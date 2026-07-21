from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


ProviderKind = Literal["openai", "openai_compatible", "anthropic", "gemini", "ollama", "lmstudio"]


class Connection(BaseModel):
    provider: ProviderKind
    base_url: str = ""
    api_key: str = ""
    model: str
    timeout_ms: int = Field(default=60_000, ge=1_000, le=600_000)
    headers: dict[str, str] = Field(default_factory=dict)


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str
    name: str | None = None
    tool_call_id: str | None = None


class ChatInput(BaseModel):
    connection: Connection
    messages: list[ChatMessage]
    temperature: float = Field(default=0.2, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1)
    tools: list[dict[str, Any]] = Field(default_factory=list)
    response_schema: dict[str, Any] | None = None
    request_id: str = ""


class ChatOutput(BaseModel):
    content: str = ""
    model: str
    usage: dict[str, Any] = Field(default_factory=dict)
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    structured: Any = None
    request_id: str = ""


class EmbedInput(BaseModel):
    connection: Connection
    input: list[str]
    request_id: str = ""


class EmbedOutput(BaseModel):
    embeddings: list[list[float]]
    model: str
    usage: dict[str, Any] = Field(default_factory=dict)
    request_id: str = ""
