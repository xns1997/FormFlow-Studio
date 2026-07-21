from __future__ import annotations

import json
import time
import uuid
from typing import Any

from flask import Flask, Response, jsonify, request, stream_with_context
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from pydantic import ValidationError as PydanticValidationError

from . import __version__
from .auth import validate_service_token
from .config import settings
from .errors import ProviderError
from .models import ChatInput, Connection, EmbedInput
from .plugins import plugins
from .run_store import run_store
from .runtime import agents, inference

REQUESTS = Counter("formflow_llm_requests_total", "Provider requests", ["operation", "status"])
LATENCY = Histogram("formflow_llm_request_seconds", "Provider request latency", ["operation"])


def _id() -> str:
    return request.headers.get("x-request-id") or f"llm_{uuid.uuid4().hex}"


def _authorized() -> bool:
    provided = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    return validate_service_token(provided)


def _sse(event: dict[str, Any], request_id: str, run_id: str = "") -> str:
    payload = {"type": event["type"], "data": event.get("data") or {}, "request_id": request_id, "run_id": run_id}
    return f"event: {event['type']}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def create_app() -> Flask:
    app = Flask(__name__)

    @app.before_request
    def authenticate():
        if request.path in ("/healthz", "/readyz", "/metrics"):
            return None
        if not _authorized():
            return jsonify({"error": {"code": "authentication_failed", "message": "无效服务令牌"}, "request_id": _id()}), 401
        return None

    @app.errorhandler(ProviderError)
    def provider_error(error: ProviderError):
        REQUESTS.labels(request.endpoint or "unknown", "error").inc()
        return jsonify({"error": {"code": error.code, "message": str(error), "retryable": error.retryable}, "request_id": _id()}), error.status_code

    @app.errorhandler(PydanticValidationError)
    def validation_error(error: PydanticValidationError):
        return jsonify({"error": {"code": "invalid_request", "message": "请求格式无效", "details": error.errors(include_url=False)}, "request_id": _id()}), 400

    @app.errorhandler(Exception)
    def unknown_error(error: Exception):
        app.logger.exception("provider request failed")
        return jsonify({"error": {"code": "internal_error", "message": str(error)}, "request_id": _id()}), 500

    @app.get("/healthz")
    def health():
        return jsonify({"status": "ok", "version": __version__})

    @app.get("/readyz")
    def ready():
        available = run_store.ready or not settings.checkpoint_store_required
        return jsonify({"status": "ready" if available else "not_ready", "version": __version__, "checkpoint_store_ready": run_store.ready, "checkpoint_store": run_store.backend}), 200 if available else 503

    @app.get("/metrics")
    def metrics():
        return Response(generate_latest(), content_type=CONTENT_TYPE_LATEST)

    @app.get("/v1/models")
    def models():
        request_id = _id()
        connection = Connection.model_validate(dict(request.args))
        return jsonify({"data": inference.list_models(connection), "request_id": request_id})

    @app.post("/v1/chat/completions")
    def chat():
        started = time.monotonic()
        body = request.get_json(force=True) or {}
        body["request_id"] = body.get("request_id") or _id()
        chat_request = ChatInput.model_validate(body)
        if body.get("stream"):
            @stream_with_context
            def events():
                try:
                    for event in inference.stream(chat_request):
                        yield _sse(event, chat_request.request_id)
                    REQUESTS.labels("chat_stream", "success").inc()
                except ProviderError as error:
                    yield _sse({"type": "error", "data": {"code": error.code, "message": str(error), "retryable": error.retryable}}, chat_request.request_id)
                    REQUESTS.labels("chat_stream", "error").inc()
                finally:
                    LATENCY.labels("chat_stream").observe(time.monotonic() - started)
            return Response(events(), content_type="text/event-stream")
        with LATENCY.labels("chat").time():
            result = inference.chat(chat_request)
        REQUESTS.labels("chat", "success").inc()
        return jsonify(result.model_dump())

    @app.post("/v1/embeddings")
    def embeddings():
        body = request.get_json(force=True) or {}
        body["request_id"] = body.get("request_id") or _id()
        result = inference.embed(EmbedInput.model_validate(body))
        REQUESTS.labels("embed", "success").inc()
        return jsonify(result.model_dump())

    @app.post("/v1/agents/runs")
    def start_agent():
        body = request.get_json(force=True) or {}
        run = agents.start(body.get("definition") or {}, body.get("input") or {}, Connection.model_validate(body.get("connection") or {}), body.get("request_id") or _id(), str(body.get("tenant_id") or ""), str(body.get("project_id") or ""))
        return jsonify(_public_run(run)), 202 if run["status"] == "waiting_tool" else 200

    @app.get("/v1/agents/runs/<run_id>/events")
    def agent_events(run_id: str):
        run = agents.get(run_id)
        @stream_with_context
        def events():
            for event in run.get("events") or []:
                yield _sse(event, run.get("request_id", ""), run_id)
        return Response(events(), content_type="text/event-stream")

    @app.post("/v1/agents/runs/<run_id>/resume")
    def resume_agent(run_id: str):
        body = request.get_json(force=True) or {}
        connection = Connection.model_validate(body["connection"]) if body.get("connection") else None
        return jsonify(_public_run(agents.resume(run_id, body.get("tool_results") or [], body.get("request_id") or _id(), connection)))

    @app.get("/v1/agents/runs/<run_id>")
    def get_agent(run_id: str):
        return jsonify(_public_run(agents.get(run_id)))

    @app.get("/v1/plugins")
    def list_plugins():
        return jsonify({"data": plugins.list(), "request_id": _id()})

    return app


def _public_run(run: dict[str, Any]) -> dict[str, Any]:
    return {key: run.get(key) for key in ("run_id", "request_id", "status", "state", "events", "pending_tool", "steps")}


app = create_app()
