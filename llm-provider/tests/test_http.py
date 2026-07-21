from __future__ import annotations

import os
import hashlib
import hmac
import time
import unittest
from unittest.mock import patch

os.environ.setdefault("LLM_PROVIDER_SERVICE_TOKEN", "test-token")
os.environ.setdefault("LLM_PROVIDER_DATABASE_URL", "")

from src.http_app import create_app
from src.models import ChatOutput


class HttpApiTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.headers = {"Authorization": "Bearer test-token"}

    def test_inference_requires_service_token(self):
        response = self.client.post("/v1/chat/completions", json={})
        self.assertEqual(response.status_code, 401)

    @patch("src.http_app.inference.chat")
    def test_chat_uses_normalized_contract(self, chat):
        chat.return_value = ChatOutput(content="hello", model="test-model", usage={"total_tokens": 2}, request_id="request-http")
        response = self.client.post("/v1/chat/completions", headers=self.headers, json={
            "connection": {"provider": "ollama", "model": "test-model"},
            "messages": [{"role": "user", "content": "hi"}], "request_id": "request-http",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["content"], "hello")
        self.assertEqual(chat.call_args.args[0].connection.provider, "ollama")

    def test_health_is_public(self):
        self.assertEqual(self.client.get("/healthz").status_code, 200)
        ready = self.client.get("/readyz")
        self.assertEqual(ready.status_code, 200)
        self.assertEqual(ready.get_json()["checkpoint_store"], "memory")

    def test_short_lived_service_token_is_accepted(self):
        expires = int(time.time()) + 60
        unsigned = f"v1.{expires}.test-nonce"
        token = f"{unsigned}.{hmac.new(b'test-token', unsigned.encode(), hashlib.sha256).hexdigest()}"
        response = self.client.get("/v1/plugins", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
