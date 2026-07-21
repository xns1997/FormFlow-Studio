from __future__ import annotations

import json
from abc import ABC, abstractmethod
from collections.abc import Iterator
from typing import Any

import requests

from .errors import AuthenticationError, CapabilityError, ProviderError, ProviderTimeout, ProviderUnavailable
from .models import ChatInput, ChatOutput, Connection, EmbedInput, EmbedOutput


def _parse_structured_content(content: str) -> Any:
    normalized = content.strip()
    if normalized.startswith("```"):
        normalized = normalized.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(normalized)
    except json.JSONDecodeError as original_error:
        starts = [position for position in (normalized.find("{"), normalized.find("[")) if position >= 0]
        if starts:
            try:
                value, _ = json.JSONDecoder().raw_decode(normalized[min(starts):])
                return value
            except json.JSONDecodeError:
                pass
        raise original_error


def _request(method: str, url: str, connection: Connection, **kwargs: Any) -> requests.Response:
    try:
        response = requests.request(method, url, timeout=connection.timeout_ms / 1000, **kwargs)
    except requests.Timeout as exc:
        raise ProviderTimeout(f"模型请求超时：{connection.provider}") from exc
    except requests.RequestException as exc:
        raise ProviderUnavailable(f"无法连接模型服务：{connection.provider}") from exc
    if response.status_code in (401, 403):
        raise AuthenticationError("模型服务认证失败")
    if response.status_code >= 400:
        try:
            detail = response.json()
        except ValueError:
            detail = response.text[:500]
        error = ProviderUnavailable if response.status_code in (408, 429, 500, 502, 503, 504) else ProviderError
        raise error(f"模型服务返回 {response.status_code}: {detail}")
    return response


class Adapter(ABC):
    capabilities = {"chat", "stream", "tools", "structured_output"}

    @abstractmethod
    def chat(self, request: ChatInput) -> ChatOutput: ...

    def stream(self, request: ChatInput) -> Iterator[dict[str, Any]]:
        result = self.chat(request)
        if result.content:
            yield {"type": "message_delta", "data": {"content": result.content}}
        for tool_call in result.tool_calls:
            yield {"type": "tool_call", "data": tool_call}
        if result.usage:
            yield {"type": "usage", "data": result.usage}
        yield {"type": "completed", "data": result.model_dump(exclude={"content", "tool_calls", "usage"})}

    def embed(self, request: EmbedInput) -> EmbedOutput:
        raise CapabilityError(f"{request.connection.provider} 不支持 Embedding")

    def list_models(self, connection: Connection) -> list[dict[str, Any]]:
        return [{"id": connection.model, "provider": connection.provider, "capabilities": sorted(self.capabilities)}]


class OpenAIAdapter(Adapter):
    capabilities = Adapter.capabilities | {"embedding"}

    def _base(self, connection: Connection) -> str:
        default = "https://api.openai.com/v1" if connection.provider == "openai" else "http://localhost:1234/v1"
        return (connection.base_url or default).rstrip("/")

    def _headers(self, connection: Connection) -> dict[str, str]:
        headers = {"Content-Type": "application/json", **connection.headers}
        if connection.api_key:
            headers["Authorization"] = f"Bearer {connection.api_key}"
        return headers

    def _payload(self, request: ChatInput, stream: bool = False) -> dict[str, Any]:
        messages = [message.model_dump(exclude_none=True) for message in request.messages]
        if request.response_schema and request.connection.provider == "openai_compatible":
            messages = [{
                "role": "system",
                "content": f"只返回符合以下 JSON Schema 的 JSON，不要 Markdown：{json.dumps(request.response_schema, ensure_ascii=False)}",
            }, *messages]
        payload: dict[str, Any] = {
            "model": request.connection.model,
            "messages": messages,
            "temperature": request.temperature,
            "stream": stream,
        }
        if request.max_tokens:
            payload["max_tokens"] = request.max_tokens
        if request.tools:
            payload["tools"] = request.tools
        if request.response_schema and request.connection.provider != "openai_compatible":
            payload["response_format"] = {"type": "json_schema", "json_schema": {"name": "formflow_response", "strict": True, "schema": request.response_schema}}
        if stream:
            payload["stream_options"] = {"include_usage": True}
        return payload

    def chat(self, request: ChatInput) -> ChatOutput:
        payload = _request("POST", f"{self._base(request.connection)}/chat/completions", request.connection, headers=self._headers(request.connection), json=self._payload(request)).json()
        choice = (payload.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        content = message.get("content") or ""
        structured = None
        if request.response_schema and content:
            try:
                structured = _parse_structured_content(content)
            except json.JSONDecodeError as exc:
                raise ProviderError("模型未返回合法的结构化 JSON") from exc
        return ChatOutput(content=content, model=payload.get("model") or request.connection.model, usage=payload.get("usage") or {}, tool_calls=message.get("tool_calls") or [], structured=structured, request_id=request.request_id)

    def stream(self, request: ChatInput) -> Iterator[dict[str, Any]]:
        response = _request("POST", f"{self._base(request.connection)}/chat/completions", request.connection, headers=self._headers(request.connection), json=self._payload(request, True), stream=True)
        for raw in response.iter_lines(decode_unicode=True):
            if not raw or not raw.startswith("data:"):
                continue
            data = raw[5:].strip()
            if data == "[DONE]":
                yield {"type": "completed", "data": {"model": request.connection.model}}
                return
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                continue
            if payload.get("usage"):
                yield {"type": "usage", "data": payload["usage"]}
            delta = ((payload.get("choices") or [{}])[0].get("delta") or {})
            if delta.get("content"):
                yield {"type": "message_delta", "data": {"content": delta["content"]}}
            for tool_call in delta.get("tool_calls") or []:
                yield {"type": "tool_call", "data": tool_call}

    def embed(self, request: EmbedInput) -> EmbedOutput:
        payload = _request("POST", f"{self._base(request.connection)}/embeddings", request.connection, headers=self._headers(request.connection), json={"model": request.connection.model, "input": request.input}).json()
        rows = sorted(payload.get("data") or [], key=lambda item: item.get("index", 0))
        return EmbedOutput(embeddings=[row.get("embedding") or [] for row in rows], model=payload.get("model") or request.connection.model, usage=payload.get("usage") or {}, request_id=request.request_id)

    def list_models(self, connection: Connection) -> list[dict[str, Any]]:
        payload = _request("GET", f"{self._base(connection)}/models", connection, headers=self._headers(connection)).json()
        return [{"id": item["id"], "provider": connection.provider, "capabilities": sorted(self.capabilities)} for item in payload.get("data") or [] if item.get("id")]


class OllamaAdapter(Adapter):
    capabilities = Adapter.capabilities | {"embedding"}

    def _base(self, connection: Connection) -> str:
        return (connection.base_url or "http://localhost:11434").rstrip("/")

    def chat(self, request: ChatInput) -> ChatOutput:
        body: dict[str, Any] = {"model": request.connection.model, "messages": [message.model_dump(exclude_none=True) for message in request.messages], "stream": False, "options": {"temperature": request.temperature}}
        if request.tools:
            body["tools"] = request.tools
        if request.response_schema:
            body["format"] = request.response_schema
        payload = _request("POST", f"{self._base(request.connection)}/api/chat", request.connection, headers={"Content-Type": "application/json", **request.connection.headers}, json=body).json()
        message = payload.get("message") or {}
        content = message.get("content") or ""
        structured = json.loads(content) if request.response_schema and content else None
        usage = {"prompt_tokens": payload.get("prompt_eval_count", 0), "completion_tokens": payload.get("eval_count", 0)}
        return ChatOutput(content=content, model=payload.get("model") or request.connection.model, usage=usage, tool_calls=message.get("tool_calls") or [], structured=structured, request_id=request.request_id)

    def stream(self, request: ChatInput) -> Iterator[dict[str, Any]]:
        body = {"model": request.connection.model, "messages": [message.model_dump(exclude_none=True) for message in request.messages], "stream": True, "options": {"temperature": request.temperature}}
        response = _request("POST", f"{self._base(request.connection)}/api/chat", request.connection, headers={"Content-Type": "application/json", **request.connection.headers}, json=body, stream=True)
        for raw in response.iter_lines(decode_unicode=True):
            if not raw:
                continue
            payload = json.loads(raw)
            message = payload.get("message") or {}
            if message.get("content"):
                yield {"type": "message_delta", "data": {"content": message["content"]}}
            for tool_call in message.get("tool_calls") or []:
                yield {"type": "tool_call", "data": tool_call}
            if payload.get("done"):
                yield {"type": "usage", "data": {"prompt_tokens": payload.get("prompt_eval_count", 0), "completion_tokens": payload.get("eval_count", 0)}}
                yield {"type": "completed", "data": {"model": payload.get("model") or request.connection.model}}

    def embed(self, request: EmbedInput) -> EmbedOutput:
        payload = _request("POST", f"{self._base(request.connection)}/api/embed", request.connection, headers={"Content-Type": "application/json"}, json={"model": request.connection.model, "input": request.input}).json()
        return EmbedOutput(embeddings=payload.get("embeddings") or [], model=payload.get("model") or request.connection.model, usage={"prompt_tokens": payload.get("prompt_eval_count", 0)}, request_id=request.request_id)

    def list_models(self, connection: Connection) -> list[dict[str, Any]]:
        payload = _request("GET", f"{self._base(connection)}/api/tags", connection).json()
        return [{"id": item["name"], "provider": "ollama", "capabilities": sorted(self.capabilities)} for item in payload.get("models") or [] if item.get("name")]


class AnthropicAdapter(Adapter):
    capabilities = {"chat", "stream", "tools", "structured_output"}

    def chat(self, request: ChatInput) -> ChatOutput:
        system = "\n".join(message.content for message in request.messages if message.role == "system")
        if request.response_schema:
            system = f"{system}\n只返回符合以下 JSON Schema 的 JSON，不要 Markdown：{json.dumps(request.response_schema, ensure_ascii=False)}".strip()
        messages = [message.model_dump(include={"role", "content"}) for message in request.messages if message.role != "system"]
        body: dict[str, Any] = {"model": request.connection.model, "messages": messages, "max_tokens": request.max_tokens or 1024, "temperature": request.temperature}
        if system:
            body["system"] = system
        if request.tools:
            body["tools"] = [{"name": tool.get("function", tool).get("name"), "description": tool.get("function", tool).get("description", ""), "input_schema": tool.get("function", tool).get("parameters", {"type": "object"})} for tool in request.tools]
        headers = {"x-api-key": request.connection.api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json", **request.connection.headers}
        base = (request.connection.base_url or "https://api.anthropic.com").rstrip("/")
        payload = _request("POST", f"{base}/v1/messages", request.connection, headers=headers, json=body).json()
        blocks = payload.get("content") or []
        content = "".join(block.get("text", "") for block in blocks if block.get("type") == "text")
        tool_calls = [{"id": block.get("id"), "type": "function", "function": {"name": block.get("name"), "arguments": json.dumps(block.get("input") or {})}} for block in blocks if block.get("type") == "tool_use"]
        structured = json.loads(content) if request.response_schema and content else None
        return ChatOutput(content=content, model=payload.get("model") or request.connection.model, usage=payload.get("usage") or {}, tool_calls=tool_calls, structured=structured, request_id=request.request_id)


class GeminiAdapter(Adapter):
    capabilities = {"chat", "stream", "tools", "structured_output", "embedding"}

    def _base(self, connection: Connection) -> str:
        return (connection.base_url or "https://generativelanguage.googleapis.com/v1beta").rstrip("/")

    def chat(self, request: ChatInput) -> ChatOutput:
        contents = [{"role": "model" if message.role == "assistant" else "user", "parts": [{"text": message.content}]} for message in request.messages if message.role != "system"]
        body: dict[str, Any] = {"contents": contents, "generationConfig": {"temperature": request.temperature}}
        system = "\n".join(message.content for message in request.messages if message.role == "system")
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        if request.response_schema:
            body["generationConfig"].update({"responseMimeType": "application/json", "responseSchema": request.response_schema})
        if request.tools:
            body["tools"] = [{"functionDeclarations": [tool.get("function", tool) for tool in request.tools]}]
        url = f"{self._base(request.connection)}/models/{request.connection.model}:generateContent"
        payload = _request("POST", url, request.connection, headers={"Content-Type": "application/json", "x-goog-api-key": request.connection.api_key, **request.connection.headers}, json=body).json()
        parts = (((payload.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
        content = "".join(part.get("text", "") for part in parts)
        tool_calls = [{"type": "function", "function": {"name": part["functionCall"].get("name"), "arguments": json.dumps(part["functionCall"].get("args") or {})}} for part in parts if part.get("functionCall")]
        return ChatOutput(content=content, model=request.connection.model, usage=payload.get("usageMetadata") or {}, tool_calls=tool_calls, structured=json.loads(content) if request.response_schema and content else None, request_id=request.request_id)

    def embed(self, request: EmbedInput) -> EmbedOutput:
        embeddings: list[list[float]] = []
        for text in request.input:
            url = f"{self._base(request.connection)}/models/{request.connection.model}:embedContent"
            payload = _request("POST", url, request.connection, headers={"Content-Type": "application/json", "x-goog-api-key": request.connection.api_key}, json={"content": {"parts": [{"text": text}]}}).json()
            embeddings.append((payload.get("embedding") or {}).get("values") or [])
        return EmbedOutput(embeddings=embeddings, model=request.connection.model, request_id=request.request_id)


def adapter_for(connection: Connection) -> Adapter:
    if connection.provider in ("openai", "openai_compatible", "lmstudio"):
        return OpenAIAdapter()
    if connection.provider == "ollama":
        return OllamaAdapter()
    if connection.provider == "anthropic":
        return AnthropicAdapter()
    if connection.provider == "gemini":
        return GeminiAdapter()
    raise CapabilityError(f"不支持 Provider：{connection.provider}")
