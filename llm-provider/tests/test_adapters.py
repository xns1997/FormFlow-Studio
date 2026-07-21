from __future__ import annotations

import unittest
from unittest.mock import patch

from src.adapters import adapter_for
from src.models import ChatInput, ChatMessage, Connection, EmbedInput


class FakeResponse:
    def __init__(self, payload): self.payload = payload
    def json(self): return self.payload


class AdapterContractTests(unittest.TestCase):
    def request(self, provider):
        return ChatInput(connection=Connection(provider=provider, model="model", api_key="secret"), messages=[ChatMessage(role="user", content="hello")], request_id=f"request-{provider}")

    @patch("src.adapters._request")
    def test_all_six_provider_types_normalize_chat(self, call):
        cases = {
            "openai": {"choices": [{"message": {"content": "openai"}}], "model": "model", "usage": {"total_tokens": 2}},
            "openai_compatible": {"choices": [{"message": {"content": "compatible"}}], "model": "model"},
            "lmstudio": {"choices": [{"message": {"content": "lmstudio"}}], "model": "model"},
            "ollama": {"message": {"content": "ollama"}, "model": "model", "eval_count": 1},
            "anthropic": {"content": [{"type": "text", "text": "anthropic"}], "model": "model", "usage": {"input_tokens": 1}},
            "gemini": {"candidates": [{"content": {"parts": [{"text": "gemini"}]}}], "usageMetadata": {"totalTokenCount": 2}},
        }
        for provider, payload in cases.items():
            with self.subTest(provider=provider):
                call.return_value = FakeResponse(payload)
                result = adapter_for(self.request(provider).connection).chat(self.request(provider))
                self.assertEqual(result.content, cases[provider].get("choices", [{}])[0].get("message", {}).get("content") if provider in ("openai", "openai_compatible", "lmstudio") else provider)
                self.assertEqual(result.request_id, f"request-{provider}")

    @patch("src.adapters._request")
    def test_embedding_is_normalized_for_openai_ollama_and_gemini(self, call):
        call.return_value = FakeResponse({"data": [{"index": 0, "embedding": [1.0, 2.0]}], "model": "embed", "usage": {}})
        request = EmbedInput(connection=Connection(provider="openai", model="embed"), input=["a"], request_id="embed-openai")
        self.assertEqual(adapter_for(request.connection).embed(request).embeddings, [[1.0, 2.0]])
        call.return_value = FakeResponse({"embeddings": [[3.0, 4.0]], "model": "embed"})
        request = EmbedInput(connection=Connection(provider="ollama", model="embed"), input=["a"], request_id="embed-ollama")
        self.assertEqual(adapter_for(request.connection).embed(request).embeddings, [[3.0, 4.0]])
        call.return_value = FakeResponse({"embedding": {"values": [5.0, 6.0]}})
        request = EmbedInput(connection=Connection(provider="gemini", model="embed"), input=["a"], request_id="embed-gemini")
        self.assertEqual(adapter_for(request.connection).embed(request).embeddings, [[5.0, 6.0]])

    @patch("src.adapters._request")
    def test_openai_compatible_structured_output_uses_prompt_fallback(self, call):
        call.return_value = FakeResponse({"choices": [{"message": {"content": "方案如下：\n```json\n{\"summary\":\"ok\"}\n```\n请确认。"}}], "model": "model"})
        request = ChatInput(
            connection=Connection(provider="openai_compatible", model="model", api_key="secret"),
            messages=[ChatMessage(role="user", content="make a plan")],
            response_schema={"type": "object", "required": ["summary"], "properties": {"summary": {"type": "string"}}},
            request_id="request-compatible-schema",
        )

        result = adapter_for(request.connection).chat(request)
        payload = call.call_args.kwargs["json"]
        self.assertNotIn("response_format", payload)
        self.assertIn("JSON Schema", payload["messages"][0]["content"])
        self.assertEqual(result.structured, {"summary": "ok"})

    @patch("src.adapters._request")
    def test_openai_keeps_native_json_schema_response_format(self, call):
        call.return_value = FakeResponse({"choices": [{"message": {"content": "{\"summary\":\"ok\"}"}}], "model": "model"})
        request = ChatInput(
            connection=Connection(provider="openai", model="model", api_key="secret"),
            messages=[ChatMessage(role="user", content="make a plan")],
            response_schema={"type": "object", "required": ["summary"], "properties": {"summary": {"type": "string"}}},
            request_id="request-openai-schema",
        )

        adapter_for(request.connection).chat(request)
        self.assertEqual(call.call_args.kwargs["json"]["response_format"]["type"], "json_schema")


if __name__ == "__main__":
    unittest.main()
