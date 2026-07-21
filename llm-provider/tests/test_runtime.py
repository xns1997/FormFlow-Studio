from __future__ import annotations

import os
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("LLM_PROVIDER_SERVICE_TOKEN", "test-token")
os.environ.setdefault("LLM_PROVIDER_DATABASE_URL", "")

from src.models import ChatOutput, Connection
from src.plugins import PluginRegistry
from src.runtime import agents


class AgentRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.connection = Connection(provider="ollama", base_url="http://localhost:11434", api_key="must-not-persist", model="test")

    def test_tool_node_pauses_and_resume_completes(self):
        definition = {
            "entrypoint": "tool",
            "tools": ["echo"],
            "nodes": [{"id": "tool", "type": "tool", "config": {"name": "echo", "arguments": {"ok": True}}}, {"id": "done", "type": "end"}],
            "edges": [{"source": "tool", "target": "done"}],
        }
        run = agents.start(definition, {}, self.connection, "request-1")
        self.assertEqual(run["status"], "waiting_tool")
        self.assertEqual(run["connection"]["api_key"], "")
        pending = run["pending_tool"]
        resumed = agents.resume(run["run_id"], [{"tool_call_id": pending["tool_call_id"], "result": {"ok": True}}], "request-1", self.connection)
        self.assertEqual(resumed["status"], "completed")
        self.assertEqual(resumed["state"]["outputs"]["tool"], {"ok": True})

    def test_tool_arguments_resolve_state_paths(self):
        definition = {
            "entrypoint": "tool", "tools": ["echo"],
            "nodes": [{"id": "tool", "type": "tool", "config": {"name": "echo", "arguments": {"code": {"$path": "input.code"}}}}], "edges": [],
        }
        run = agents.start(definition, {"code": "on load -> message(\"ok\", info)"}, self.connection, "request-path")
        self.assertEqual(run["pending_tool"]["arguments"]["code"], "on load -> message(\"ok\", info)")

    def test_unlisted_tool_is_rejected(self):
        definition = {"entrypoint": "tool", "nodes": [{"id": "tool", "type": "tool", "config": {"name": "secret"}}], "edges": []}
        with self.assertRaisesRegex(Exception, "未授权工具"):
            agents.start(definition, {}, self.connection, "request-2")

    def test_plugins_require_allowlist_and_exact_version(self):
        with tempfile.TemporaryDirectory() as root:
            directory = Path(root) / "example"
            directory.mkdir()
            (directory / "plugin.json").write_text(json.dumps({"id": "example", "version": "1.0.0", "entry": "plugin.py"}), "utf-8")
            (directory / "plugin.py").write_text("def run(state, config):\n    return {'ok': True}\n", "utf-8")
            with patch("src.plugins.settings", SimpleNamespace(plugin_dir=root, plugin_allowlist=("example",))):
                registry = PluginRegistry()
            self.assertEqual(registry.execute("example", "1.0.0", {}, {}), {"ok": True})
            with self.assertRaisesRegex(Exception, "版本不匹配"):
                registry.execute("example", "2.0.0", {}, {})
            with patch("src.plugins.settings", SimpleNamespace(plugin_dir=root, plugin_allowlist=("other",))):
                blocked = PluginRegistry()
            with self.assertRaisesRegex(Exception, "未安装或未在白名单"):
                blocked.execute("example", "1.0.0", {}, {})

    @patch("src.runtime.inference.chat")
    def test_model_and_router_graph(self, chat):
        chat.return_value = ChatOutput(content="ok", model="test")
        definition = {
            "entrypoint": "model", "nodes": [{"id": "model", "type": "model"}, {"id": "done", "type": "end"}],
            "edges": [{"source": "model", "target": "done"}],
        }
        run = agents.start(definition, {"messages": [{"role": "user", "content": "hi"}]}, self.connection, "request-3")
        self.assertEqual(run["status"], "completed")
        self.assertEqual(run["state"]["outputs"]["model"]["content"], "ok")

    @patch("src.runtime.inference.chat")
    def test_model_prompt_renders_state_without_eval(self, chat):
        chat.return_value = ChatOutput(content="ok", model="test")
        definition = {"entrypoint": "model", "nodes": [{"id": "model", "type": "model", "config": {"prompt": "Code: {{input.code}}"}}], "edges": []}
        agents.start(definition, {"code": "safe"}, self.connection, "request-template")
        self.assertEqual(chat.call_args.args[0].messages[-1].content, "Code: safe")

    @patch("src.runtime.inference.chat")
    def test_model_native_tool_loop_resumes_back_to_model(self, chat):
        chat.side_effect = [
            ChatOutput(content="", model="test", tool_calls=[{"id": "call-1", "type": "function", "function": {"name": "echo", "arguments": "{\"value\": 7}"}}]),
            ChatOutput(content="done", model="test"),
        ]
        definition = {
            "entrypoint": "model", "tools": ["echo"],
            "nodes": [{"id": "model", "type": "model", "config": {"tool_mode": "auto", "tools": [{"type": "function", "function": {"name": "echo", "parameters": {"type": "object"}}}]}}, {"id": "done", "type": "end"}],
            "edges": [{"source": "model", "target": "done"}],
        }
        run = agents.start(definition, {}, self.connection, "request-tool-loop")
        self.assertEqual(run["status"], "waiting_tool")
        self.assertEqual(run["pending_tool"]["arguments"], {"value": 7})
        resumed = agents.resume(run["run_id"], [{"tool_call_id": "call-1", "result": {"ok": True}}], "request-tool-loop", self.connection)
        self.assertEqual(resumed["status"], "completed")
        self.assertIn("Tool result (echo", chat.call_args_list[1].args[0].messages[-1].content)

    @patch("src.runtime.inference.chat")
    def test_native_tool_loop_stops_after_bounded_failures(self, chat):
        chat.return_value = ChatOutput(content="", model="test", tool_calls=[{"id": "call-fail", "type": "function", "function": {"name": "echo", "arguments": "{}"}}])
        definition = {"entrypoint": "model", "tools": ["echo"], "max_tool_failures": 1, "nodes": [{"id": "model", "type": "model", "config": {"tool_mode": "auto", "tools": []}}], "edges": []}
        run = agents.start(definition, {}, self.connection, "request-failure-limit")
        resumed = agents.resume(run["run_id"], [{"tool_call_id": "call-fail", "result": {"ok": False, "error": {"code": "FAILED"}}}], "request-failure-limit", self.connection)
        self.assertEqual(resumed["status"], "failed")
        self.assertEqual(resumed["events"][-1]["data"]["code"], "auto_repair_exhausted")

    @patch("src.runtime.inference.chat")
    def test_unlisted_native_tool_is_rejected_then_model_self_corrects(self, chat):
        chat.side_effect = [
            ChatOutput(content="", model="test", tool_calls=[{"id": "call-secret", "function": {"name": "secret", "arguments": "{}"}}]),
            ChatOutput(content="已改用当前角色能力完成交接", model="test"),
        ]
        definition = {"entrypoint": "model", "tools": ["echo"], "max_steps": 4, "max_tool_failures": 3, "nodes": [{"id": "model", "type": "model", "config": {"tool_mode": "auto", "tools": [{"type": "function", "function": {"name": "echo"}}]}}, {"id": "done", "type": "end"}], "edges": [{"source": "model", "target": "done"}]}
        run = agents.start(definition, {}, self.connection, "request-unauthorized-correction")
        self.assertEqual(run["status"], "completed")
        self.assertTrue(any(event["type"] == "tool_rejected" and event["data"]["tool_name"] == "secret" for event in run["events"]))
        self.assertIn("不属于当前角色", chat.call_args_list[1].args[0].messages[-1].content)

    @patch("src.runtime.inference.chat")
    def test_repeated_unlisted_native_tool_fails_with_bounded_report(self, chat):
        chat.return_value = ChatOutput(content="", model="test", tool_calls=[{"id": "call-secret", "function": {"name": "secret", "arguments": "{}"}}])
        definition = {"entrypoint": "model", "tools": ["echo"], "max_steps": 6, "max_tool_failures": 2, "nodes": [{"id": "model", "type": "model", "config": {"tool_mode": "auto", "tools": []}}], "edges": []}
        run = agents.start(definition, {}, self.connection, "request-unauthorized-bounded")
        self.assertEqual(run["status"], "failed")
        self.assertEqual(run["events"][-1]["data"]["code"], "unauthorized_tool_repeated")

    @patch("src.runtime.inference.chat")
    def test_success_resets_consecutive_tool_failure_budget(self, chat):
        chat.side_effect = [
            ChatOutput(content="", model="test", tool_calls=[{"id": "call-1", "function": {"name": "echo", "arguments": "{}"}}]),
            ChatOutput(content="", model="test", tool_calls=[{"id": "call-2", "function": {"name": "echo", "arguments": "{}"}}]),
            ChatOutput(content="", model="test", tool_calls=[{"id": "call-3", "function": {"name": "echo", "arguments": "{}"}}]),
            ChatOutput(content="done", model="test"),
        ]
        definition = {"entrypoint": "model", "tools": ["echo"], "max_steps": 10, "max_tool_failures": 2, "nodes": [{"id": "model", "type": "model", "config": {"tool_mode": "auto", "tools": []}}, {"id": "done", "type": "end"}], "edges": [{"source": "model", "target": "done"}]}
        run = agents.start(definition, {}, self.connection, "request-consecutive")
        run = agents.resume(run["run_id"], [{"tool_call_id": "call-1", "result": {"ok": False, "error": {"code": "FIRST"}}}], "request-consecutive", self.connection)
        run = agents.resume(run["run_id"], [{"tool_call_id": "call-2", "result": {"ok": True}}], "request-consecutive", self.connection)
        run = agents.resume(run["run_id"], [{"tool_call_id": "call-3", "result": {"ok": False, "error": {"code": "SECOND"}}}], "request-consecutive", self.connection)
        self.assertEqual(run["status"], "completed")
        self.assertEqual(run["state"]["tool_failures"], 1)

    @patch("src.runtime.inference.chat")
    def test_last_budget_step_forces_handoff_without_more_tools(self, chat):
        chat.side_effect = [
            ChatOutput(content="", model="test", tool_calls=[{"id": "call-1", "function": {"name": "echo", "arguments": "{}"}}]),
            ChatOutput(content="已完成交接", model="test", tool_calls=[{"id": "ignored-call", "function": {"name": "echo", "arguments": "{}"}}]),
        ]
        definition = {"entrypoint": "model", "tools": ["echo"], "max_steps": 2, "nodes": [{"id": "model", "type": "model", "config": {"tool_mode": "auto", "tools": [{"type": "function", "function": {"name": "echo"}}]}}, {"id": "done", "type": "end"}], "edges": [{"source": "model", "target": "done"}]}
        run = agents.start(definition, {}, self.connection, "request-final-budget")
        run = agents.resume(run["run_id"], [{"tool_call_id": "call-1", "result": {"ok": True}}], "request-final-budget", self.connection)
        self.assertEqual(run["status"], "completed")
        self.assertEqual(chat.call_args_list[1].args[0].tools, [])
        self.assertTrue(any(event["type"] == "budget_finalization" for event in run["events"]))

    @patch("src.runtime.inference.chat")
    def test_large_tool_result_is_compacted_in_checkpoint_and_model_context(self, chat):
        chat.side_effect = [
            ChatOutput(content="", model="test", tool_calls=[{"id": "call-large", "type": "function", "function": {"name": "echo", "arguments": "{}"}}]),
            ChatOutput(content="done", model="test"),
        ]
        definition = {"entrypoint": "model", "tools": ["echo"], "nodes": [{"id": "model", "type": "model", "config": {"tool_mode": "auto", "tools": []}}], "edges": []}
        run = agents.start(definition, {}, self.connection, "request-large-result")
        resumed = agents.resume(run["run_id"], [{"tool_call_id": "call-large", "result": {"ok": True, "rows": ["x" * 1000] * 100}}], "request-large-result", self.connection)
        output = resumed["state"]["outputs"]["model:tool:1"]
        self.assertTrue(output["__formflowTruncated"])
        self.assertLessEqual(len(json.dumps(output)), 32_000)
        self.assertIn("__formflowTruncated", chat.call_args_list[1].args[0].messages[-1].content)


if __name__ == "__main__":
    unittest.main()
