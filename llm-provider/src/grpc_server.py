from __future__ import annotations

import json
import os
from concurrent import futures
from typing import Any

import grpc

from . import __version__
from .auth import validate_service_token
from .config import settings
from .errors import CapabilityError, ProviderError, ProviderTimeout, ProviderUnavailable, ValidationError
from .models import ChatInput, Connection, EmbedInput
from .plugins import plugins
from .run_store import run_store
from .runtime import agents, inference
from .generated import llm_provider_pb2 as llm_pb2
from .generated import llm_provider_pb2_grpc as llm_pb2_grpc

GRPC_MAX_MESSAGE_BYTES = int(os.getenv('LLM_PROVIDER_GRPC_MAX_MESSAGE_BYTES', str(16 * 1024 * 1024)))


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _loads(value: str, fallback: Any) -> Any:
    if not value:
        return fallback
    return json.loads(value)


def _connection(message: Any) -> Connection:
    return Connection(provider=message.provider, base_url=message.base_url, api_key=message.api_key, model=message.model, timeout_ms=message.timeout_ms or 60_000, headers=dict(message.headers))


def _chat_request(request: Any) -> ChatInput:
    return ChatInput(connection=_connection(request.connection), messages=[{"role": item.role, "content": item.content, "name": item.name or None, "tool_call_id": item.tool_call_id or None} for item in request.messages], temperature=request.temperature, max_tokens=request.max_tokens or None, tools=_loads(request.tools_json, []), response_schema=_loads(request.response_schema_json, None), request_id=request.request_id)


class AuthInterceptor(grpc.ServerInterceptor):
    def intercept_service(self, continuation, handler_call_details):
        handler = continuation(handler_call_details)
        metadata = dict(handler_call_details.invocation_metadata or [])
        token = metadata.get("authorization", "").removeprefix("Bearer ").strip()
        if validate_service_token(token) or handler is None:
            return handler
        def deny(_request, context):
            context.abort(grpc.StatusCode.UNAUTHENTICATED, "invalid service token")
        def deny_stream(_request, context):
            context.abort(grpc.StatusCode.UNAUTHENTICATED, "invalid service token")
            yield None
        if handler.response_streaming:
            return grpc.unary_stream_rpc_method_handler(deny_stream, request_deserializer=handler.request_deserializer, response_serializer=handler.response_serializer)
        return grpc.unary_unary_rpc_method_handler(deny, request_deserializer=handler.request_deserializer, response_serializer=handler.response_serializer)


class LlmProviderService(llm_pb2_grpc.LlmProviderServicer):
    def _abort(self, context: grpc.ServicerContext, error: Exception):
        code = grpc.StatusCode.INTERNAL
        if isinstance(error, ValidationError): code = grpc.StatusCode.INVALID_ARGUMENT
        elif isinstance(error, CapabilityError): code = grpc.StatusCode.FAILED_PRECONDITION
        elif isinstance(error, ProviderTimeout): code = grpc.StatusCode.DEADLINE_EXCEEDED
        elif isinstance(error, ProviderUnavailable): code = grpc.StatusCode.UNAVAILABLE
        elif isinstance(error, ProviderError): code = grpc.StatusCode.UNKNOWN
        context.abort(code, str(error))

    def ListModels(self, request, context):
        try:
            models = inference.list_models(_connection(request.connection))
            return llm_pb2.ListModelsResponse(models=[llm_pb2.ModelInfo(id=item["id"], provider=item["provider"], capabilities=item.get("capabilities") or []) for item in models], request_id=request.request_id)
        except Exception as error: self._abort(context, error)

    def Chat(self, request, context):
        try:
            result = inference.chat(_chat_request(request))
            return llm_pb2.ChatResponse(content=result.content, model=result.model, usage_json=_json(result.usage), tool_calls_json=_json(result.tool_calls), structured_json=_json(result.structured) if result.structured is not None else "", request_id=result.request_id)
        except Exception as error: self._abort(context, error)

    def ChatStream(self, request, context):
        try:
            for event in inference.stream(_chat_request(request)):
                if not context.is_active(): return
                yield llm_pb2.StreamEvent(type=event["type"], data_json=_json(event.get("data") or {}), request_id=request.request_id)
        except Exception as error: self._abort(context, error)

    def Embed(self, request, context):
        try:
            result = inference.embed(EmbedInput(connection=_connection(request.connection), input=list(request.input), request_id=request.request_id))
            return llm_pb2.EmbedResponse(embeddings=[llm_pb2.Embedding(values=row, index=index) for index, row in enumerate(result.embeddings)], model=result.model, usage_json=_json(result.usage), request_id=result.request_id)
        except Exception as error: self._abort(context, error)

    def StartAgentRun(self, request, context):
        try:
            return self._run_response(agents.start(_loads(request.definition_json, {}), _loads(request.input_json, {}), _connection(request.connection), request.request_id, request.tenant_id, request.project_id))
        except Exception as error: self._abort(context, error)

    def StreamAgentRun(self, request, context):
        try:
            run = agents.start(_loads(request.definition_json, {}), _loads(request.input_json, {}), _connection(request.connection), request.request_id, request.tenant_id, request.project_id)
            for event in run.get("events") or []:
                yield llm_pb2.StreamEvent(type=event["type"], data_json=_json(event.get("data") or {}), request_id=request.request_id, run_id=run["run_id"])
        except Exception as error: self._abort(context, error)

    def ResumeAgentRun(self, request, context):
        try: return self._run_response(agents.resume(request.run_id, _loads(request.tool_results_json, []), request.request_id, _connection(request.connection)))
        except Exception as error: self._abort(context, error)

    def GetAgentRun(self, request, context):
        try: return self._run_response(agents.get(request.run_id))
        except Exception as error: self._abort(context, error)

    def ListPlugins(self, request, context):
        return llm_pb2.ListPluginsResponse(plugins=[llm_pb2.PluginInfo(**item) for item in plugins.list()], request_id=request.request_id)

    def Health(self, request, context):
        return llm_pb2.HealthResponse(status="ok", version=__version__, checkpoint_store_ready=run_store.ready, checkpoint_store=run_store.backend)

    @staticmethod
    def _run_response(run: dict[str, Any]):
        return llm_pb2.AgentRunResponse(run_id=run["run_id"], status=run["status"], state_json=_json(run.get("state") or {}), events_json=_json(run.get("events") or []), request_id=run.get("request_id", ""), tenant_id=run.get("tenant_id", ""), project_id=run.get("project_id", ""))


def create_server() -> grpc.Server:
    if settings.require_mtls and not (settings.tls_cert and settings.tls_key and settings.tls_ca):
        raise RuntimeError("LLM_PROVIDER_REQUIRE_MTLS=true 时必须配置 TLS_CERT、TLS_KEY 和 TLS_CA")
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=16),
        interceptors=[AuthInterceptor()],
        options=[
            ('grpc.max_receive_message_length', GRPC_MAX_MESSAGE_BYTES),
            ('grpc.max_send_message_length', GRPC_MAX_MESSAGE_BYTES),
        ],
    )
    llm_pb2_grpc.add_LlmProviderServicer_to_server(LlmProviderService(), server)
    address = f"{settings.grpc_host}:{settings.grpc_port}"
    if settings.tls_cert and settings.tls_key:
        from pathlib import Path
        private_key = Path(settings.tls_key).read_bytes()
        certificate_chain = Path(settings.tls_cert).read_bytes()
        root = Path(settings.tls_ca).read_bytes() if settings.tls_ca else None
        credentials = grpc.ssl_server_credentials([(private_key, certificate_chain)], root_certificates=root, require_client_auth=settings.require_mtls or bool(root))
        server.add_secure_port(address, credentials)
    else:
        server.add_insecure_port(address)
    return server
