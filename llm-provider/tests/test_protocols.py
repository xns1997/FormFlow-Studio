from __future__ import annotations

import json
import unittest
from concurrent import futures
from unittest.mock import patch

import grpc

from src.config import settings
from src.generated import llm_provider_pb2 as pb2
from src.generated import llm_provider_pb2_grpc as pb2_grpc
from src.grpc_server import LlmProviderService
from src.http_app import create_app
from src.models import ChatOutput
from src.runtime import inference


class ProtocolEquivalenceTests(unittest.TestCase):
    def test_http_and_grpc_share_normalized_chat_result(self):
        expected = ChatOutput(content="same", model="model", usage={"total_tokens": 3}, request_id="protocol-request")
        with patch.object(inference, "chat", return_value=expected):
            http = create_app().test_client().post("/v1/chat/completions", headers={"Authorization": f"Bearer {settings.service_token}"}, json={
                "connection": {"provider": "ollama", "model": "model"},
                "messages": [{"role": "user", "content": "hi"}], "request_id": "protocol-request",
            })
            server = grpc.server(futures.ThreadPoolExecutor(max_workers=2))
            pb2_grpc.add_LlmProviderServicer_to_server(LlmProviderService(), server)
            port = server.add_insecure_port("127.0.0.1:0")
            server.start()
            try:
                stub = pb2_grpc.LlmProviderStub(grpc.insecure_channel(f"127.0.0.1:{port}"))
                grpc_result = stub.Chat(pb2.ChatRequest(connection=pb2.ProviderConnection(provider="ollama", model="model"), messages=[pb2.Message(role="user", content="hi")], request_id="protocol-request"))
            finally:
                server.stop(0).wait()
        self.assertEqual(http.status_code, 200)
        self.assertEqual(http.get_json()["content"], grpc_result.content)
        self.assertEqual(http.get_json()["usage"], json.loads(grpc_result.usage_json))
        self.assertEqual(grpc_result.request_id, "protocol-request")


if __name__ == "__main__":
    unittest.main()
