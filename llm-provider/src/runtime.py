from __future__ import annotations

import json
import logging
import os
import time
import uuid
from collections.abc import Iterator
from typing import Any, TypedDict

from jsonschema import ValidationError as JsonSchemaValidationError, validate as validate_json
from langgraph.graph import END, StateGraph

from .adapters import adapter_for
from .errors import CapabilityError, ProviderError, ValidationError
from .models import ChatInput, ChatMessage, ChatOutput, Connection, EmbedInput, EmbedOutput
from .plugins import plugins
from .run_store import run_store

logger = logging.getLogger("formflow.llm-provider")
TOOL_RESULT_MAX_CHARS = int(os.getenv("LLM_PROVIDER_TOOL_RESULT_MAX_CHARS", "32000"))


def _compact_tool_result(value: Any, max_chars: int = TOOL_RESULT_MAX_CHARS) -> Any:
    """Bound checkpoint/model context growth while making truncation auditable."""
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if len(encoded) <= max_chars:
        return value
    preview_chars = max(0, max_chars - 256)
    while preview_chars > 0:
        compacted = {
            "__formflowTruncated": True,
            "originalChars": len(encoded),
            "maxChars": max_chars,
            "previewText": encoded[:preview_chars],
        }
        if len(json.dumps(compacted, ensure_ascii=False, separators=(",", ":"))) <= max_chars:
            return compacted
        preview_chars = int(preview_chars * 0.75)
    return {"__formflowTruncated": True, "originalChars": len(encoded), "maxChars": max_chars}


class InferenceState(TypedDict, total=False):
    request: ChatInput
    adapter: Any
    response: ChatOutput


class InferenceRuntime:
    def __init__(self) -> None:
        graph = StateGraph(InferenceState)
        graph.add_node("validate", self._validate)
        graph.add_node("invoke", self._invoke)
        graph.add_node("normalize", self._normalize)
        graph.set_entry_point("validate")
        graph.add_edge("validate", "invoke")
        graph.add_edge("invoke", "normalize")
        graph.add_edge("normalize", END)
        self._graph = graph.compile()

    @staticmethod
    def _validate(state: InferenceState) -> InferenceState:
        request = state["request"]
        if not request.messages:
            raise ValidationError("messages 不能为空")
        adapter = adapter_for(request.connection)
        if request.tools and "tools" not in adapter.capabilities:
            raise CapabilityError(f"{request.connection.provider} 不支持工具调用")
        if request.response_schema and "structured_output" not in adapter.capabilities:
            raise CapabilityError(f"{request.connection.provider} 不支持结构化输出")
        return {"adapter": adapter}

    @staticmethod
    def _invoke(state: InferenceState) -> InferenceState:
        for attempt in range(2):
            try:
                return {"response": state["adapter"].chat(state["request"])}
            except ProviderError as error:
                if not error.retryable or attempt == 1:
                    raise
        raise ProviderError("模型调用失败")

    @staticmethod
    def _normalize(state: InferenceState) -> InferenceState:
        response = state["response"]
        schema = state["request"].response_schema
        if schema:
            try:
                validate_json(instance=response.structured, schema=schema)
            except JsonSchemaValidationError as exc:
                raise ValidationError(f"结构化输出不符合 Schema：{exc.message}") from exc
        return {"response": response}

    def chat(self, request: ChatInput) -> ChatOutput:
        started = time.monotonic()
        try:
            response = self._graph.invoke({"request": request})["response"]
            logger.info("chat completed provider=%s model=%s duration_ms=%d usage=%s request_id=%s", request.connection.provider, response.model, int((time.monotonic() - started) * 1000), response.usage, request.request_id)
            return response
        except Exception as error:
            logger.warning("chat failed provider=%s model=%s duration_ms=%d error_type=%s error=%s request_id=%s", request.connection.provider, request.connection.model, int((time.monotonic() - started) * 1000), type(error).__name__, str(error), request.request_id)
            raise

    def stream(self, request: ChatInput) -> Iterator[dict[str, Any]]:
        self._validate({"request": request})
        adapter = adapter_for(request.connection)
        for attempt in range(2):
            emitted = False
            try:
                for event in adapter.stream(request):
                    emitted = True
                    yield event
                return
            except ProviderError as error:
                if emitted or not error.retryable or attempt == 1:
                    raise

    def embed(self, request: EmbedInput) -> EmbedOutput:
        adapter = adapter_for(request.connection)
        if "embedding" not in adapter.capabilities:
            raise CapabilityError(f"{request.connection.provider} 不支持 Embedding")
        return adapter.embed(request)

    def list_models(self, connection: Connection) -> list[dict[str, Any]]:
        return adapter_for(connection).list_models(connection)


inference = InferenceRuntime()


def _path(data: dict[str, Any], path: str) -> Any:
    current: Any = data
    for segment in path.strip("$.").split("."):
        if not segment:
            continue
        if not isinstance(current, dict):
            return None
        current = current.get(segment)
    return current


def _resolve(value: Any, state: dict[str, Any]) -> Any:
    """Resolve declarative state references without evaluating arbitrary code."""
    if isinstance(value, dict):
        if set(value) == {"$path"}:
            return _path(state, str(value["$path"]))
        return {key: _resolve(item, state) for key, item in value.items()}
    if isinstance(value, list):
        return [_resolve(item, state) for item in value]
    return value


def _render_prompt(template: str, state: dict[str, Any]) -> str:
    result = template
    for marker in set(part.split("}}", 1)[0] for part in template.split("{{")[1:] if "}}" in part):
        value = _path(state, marker.strip())
        rendered = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        result = result.replace("{{" + marker + "}}", rendered if rendered is not None else "")
    return result


class AgentRuntime:
    allowed_node_types = {"model", "router", "tool", "subgraph", "plugin", "end"}

    def validate_definition(self, definition: dict[str, Any]) -> None:
        nodes = definition.get("nodes") or []
        if not nodes or not definition.get("entrypoint"):
            raise ValidationError("Agent 定义必须包含 nodes 和 entrypoint")
        ids = {str(node.get("id")) for node in nodes}
        if len(ids) != len(nodes) or "" in ids:
            raise ValidationError("Agent 节点 ID 不能为空或重复")
        for node in nodes:
            if node.get("type") not in self.allowed_node_types:
                raise ValidationError(f"不支持 Agent 节点：{node.get('type')}")
        if definition["entrypoint"] not in ids:
            raise ValidationError("Agent entrypoint 不存在")

    def start(self, definition: dict[str, Any], input_data: dict[str, Any], connection: Connection, request_id: str, tenant_id: str = "", project_id: str = "") -> dict[str, Any]:
        self.validate_definition(definition)
        run = {
            "run_id": f"run_{uuid.uuid4().hex}", "request_id": request_id, "status": "running",
            "definition": definition, "connection": connection.model_copy(update={"api_key": ""}).model_dump(), "state": {"input": input_data, "messages": input_data.get("messages", []), "outputs": {}},
            "current_node": definition["entrypoint"], "steps": 0, "events": [], "tenant_id": tenant_id, "project_id": project_id,
        }
        return self._continue(run, connection)

    def resume(self, run_id: str, tool_results: list[dict[str, Any]], request_id: str, connection: Connection | None = None) -> dict[str, Any]:
        run = run_store.get(run_id)
        if not run:
            raise ValidationError("Agent run 不存在或已过期")
        if run.get("status") != "waiting_tool":
            raise ValidationError("Agent run 当前不等待工具结果")
        pending = run.get("pending_tool") or {}
        matching = next((item for item in tool_results if item.get("tool_call_id") == pending.get("tool_call_id")), None)
        if not matching:
            raise ValidationError("缺少当前 tool_call_id 的执行结果")
        result_value = matching.get("result")
        compact_result = _compact_tool_result(result_value)
        compact_matching = {**matching, "result": compact_result}
        output_key = f"{run['current_node']}:tool:{run['steps']}" if pending.get("return_to_node") else run["current_node"]
        run["state"]["outputs"][output_key] = compact_result
        run["events"].append({"type": "tool_result", "data": compact_matching})
        # Provider message dialects differ; this normalized tool-result envelope is
        # intentionally valid for every adapter while retaining the tool_call_id.
        run["state"].setdefault("messages", []).append({"role": "user", "content": f"Tool result ({pending.get('name')}, {pending.get('tool_call_id')}): {json.dumps(compact_result, ensure_ascii=False)}"})
        run["pending_tool"] = None
        failed_tool = isinstance(result_value, dict) and result_value.get("ok") is False and result_value.get("status") != "confirmation_required"
        if failed_tool:
            failures = int(run["state"].get("tool_failures", 0)) + 1
            run["state"]["tool_failures"] = failures
            limit = int(run["definition"].get("max_tool_failures", 0))
            if limit > 0 and failures >= limit:
                run["status"] = "failed"
                run["events"].append({"type": "error", "data": {"code": "auto_repair_exhausted", "failures": failures}})
                run_store.save(run)
                return run
        else:
            run["state"]["tool_failures"] = 0
        run["current_node"] = pending.get("return_to_node") or self._next_node(run["definition"], run["current_node"], run["state"])
        run["status"] = "running"
        run["request_id"] = request_id or run.get("request_id", "")
        return self._continue(run, connection or Connection.model_validate(run["connection"]))

    def get(self, run_id: str) -> dict[str, Any]:
        run = run_store.get(run_id)
        if not run:
            raise ValidationError("Agent run 不存在或已过期")
        return run

    def _continue(self, run: dict[str, Any], connection: Connection) -> dict[str, Any]:
        definition = run["definition"]
        nodes = {node["id"]: node for node in definition["nodes"]}
        max_steps = min(int(definition.get("max_steps", 32)), 256)
        while run["status"] == "running" and run.get("current_node"):
            node = nodes[run["current_node"]]
            if node["type"] == "end":
                run["status"] = "completed"
                run["events"].append({"type": "completed", "data": {"node": node["id"]}})
                break
            if run["steps"] >= max_steps:
                run["status"] = "failed"
                run["events"].append({"type": "error", "data": {"code": "max_steps_exceeded"}})
                break
            run["steps"] += 1
            node_type = node["type"]
            config = node.get("config") or {}
            run["events"].append({"type": "node_started", "data": {"node": node["id"], "node_type": node_type, "step": run["steps"]}})
            if node_type == "tool":
                tool_name = str(config.get("name", ""))
                allowed = set(definition.get("tools") or [])
                if not tool_name or tool_name not in allowed:
                    raise CapabilityError(f"Agent 未授权工具：{tool_name}")
                arguments = _resolve(config.get("arguments"), run["state"]) if "arguments" in config else run["state"].get("input", {})
                pending = {"tool_call_id": f"tool_{uuid.uuid4().hex}", "name": tool_name, "arguments": arguments}
                run["pending_tool"] = pending
                run["status"] = "waiting_tool"
                run["events"].append({"type": "tool_call", "data": pending})
                break
            if node_type == "model":
                messages = [ChatMessage.model_validate(item) for item in run["state"].get("messages") or []]
                prompted = run["state"].setdefault("prompted_nodes", [])
                if config.get("prompt") and node["id"] not in prompted:
                    rendered_prompt = _render_prompt(str(config["prompt"]), run["state"])
                    messages.append(ChatMessage(role="user", content=rendered_prompt))
                    run["state"].setdefault("messages", []).append({"role": "user", "content": rendered_prompt})
                    prompted.append(node["id"])
                model_tools = config.get("tools") or []
                force_final = run["steps"] >= max_steps
                if force_final:
                    messages.append(ChatMessage(role="user", content="执行预算已到最后一步。禁止继续调用工具；请立即基于现有工具结果给出简洁交接，明确已完成内容、验收证据和任何阻断项。"))
                    model_tools = []
                    run["events"].append({"type": "budget_finalization", "data": {"step": run["steps"], "max_steps": max_steps}})
                result = inference.chat(ChatInput(connection=connection, messages=messages, temperature=float(config.get("temperature", 0.2)), tools=model_tools, response_schema=config.get("response_schema"), request_id=run["request_id"]))
                run["state"]["outputs"][node["id"]] = result.model_dump()
                run["events"].append({"type": "node_completed", "data": {"node": node["id"], "node_type": node_type, "structured": result.structured}})
                if result.content:
                    run["state"]["messages"].append({"role": "assistant", "content": result.content})
                    run["events"].append({"type": "message_delta", "data": {"content": result.content, "node": node["id"]}})
                if result.tool_calls and config.get("tool_mode") == "auto" and not force_final:
                    call = result.tool_calls[0]
                    function = call.get("function") or call
                    tool_name = str(function.get("name") or "")
                    allowed = set(definition.get("tools") or [])
                    if not tool_name or tool_name not in allowed:
                        failures = int(run["state"].get("unauthorized_tool_failures", 0)) + 1
                        run["state"]["unauthorized_tool_failures"] = failures
                        run["events"].append({"type": "tool_rejected", "data": {"code": "tool_not_authorized", "tool_name": tool_name, "allowed_tools": sorted(allowed), "attempt": failures}})
                        limit = max(1, int(definition.get("max_tool_failures", 3)))
                        if failures >= limit:
                            run["status"] = "failed"
                            run["events"].append({"type": "error", "data": {"code": "unauthorized_tool_repeated", "message": f"Agent 连续请求未授权工具：{tool_name}", "tool_name": tool_name, "failures": failures}})
                            break
                        correction = f"工具 {tool_name or '(空)'} 不属于当前角色，已拒绝且未执行。只能使用以下已授权工具：{', '.join(sorted(allowed)) or '无'}。请改用已授权工具完成当前角色范围内的工作；其他角色的工作作为交接项，不要再次请求未授权工具。"
                        run["state"]["messages"].append({"role": "user", "content": correction})
                        continue
                    run["state"]["unauthorized_tool_failures"] = 0
                    arguments = function.get("arguments") or {}
                    if isinstance(arguments, str):
                        try:
                            arguments = json.loads(arguments)
                        except json.JSONDecodeError as exc:
                            raise ValidationError(f"工具 {tool_name} 参数不是合法 JSON") from exc
                    pending = {"tool_call_id": call.get("id") or f"tool_{uuid.uuid4().hex}", "name": tool_name, "arguments": arguments, "return_to_node": node["id"]}
                    run["pending_tool"] = pending
                    run["status"] = "waiting_tool"
                    run["events"].append({"type": "tool_call", "data": pending})
                    break
            elif node_type == "plugin":
                result = plugins.execute(str(config.get("plugin_id", "")), str(config.get("version", "")), run["state"], config)
                run["state"]["outputs"][node["id"]] = result
                run["events"].append({"type": "node_completed", "data": {"node": node["id"], "node_type": node_type}})
            elif node_type == "subgraph":
                child = self.start(config.get("definition") or {}, run["state"].get("input") or {}, Connection.model_validate(run["connection"]), run["request_id"])
                if child["status"] != "completed":
                    raise CapabilityError("首版 subgraph 必须同步完成，不能包含外部工具暂停")
                run["state"]["outputs"][node["id"]] = child["state"]
                run["events"].append({"type": "node_completed", "data": {"node": node["id"], "node_type": node_type}})
            run["current_node"] = self._next_node(definition, node["id"], run["state"])
        if run["status"] == "running" and not run.get("current_node"):
            run["status"] = "completed"
            run["events"].append({"type": "completed", "data": {"node": None}})
        run_store.save(run)
        return run

    @staticmethod
    def _next_node(definition: dict[str, Any], node_id: str, state: dict[str, Any]) -> str | None:
        edges = [edge for edge in definition.get("edges") or [] if edge.get("source") == node_id]
        for edge in edges:
            condition = edge.get("condition")
            if not condition:
                return edge.get("target")
            actual = _path(state, str(condition.get("path", "")))
            if actual == condition.get("equals"):
                return edge.get("target")
        return None


agents = AgentRuntime()
