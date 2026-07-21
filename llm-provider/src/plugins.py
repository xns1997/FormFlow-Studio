from __future__ import annotations

import importlib.util
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .config import settings
from .errors import CapabilityError


@dataclass
class Plugin:
    id: str
    version: str
    description: str
    run: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]


class PluginRegistry:
    def __init__(self) -> None:
        self._plugins: dict[str, Plugin] = {}
        self.reload()

    def reload(self) -> None:
        self._plugins.clear()
        root = Path(settings.plugin_dir)
        if not root.exists():
            return
        for manifest_path in root.glob("*/plugin.json"):
            manifest = json.loads(manifest_path.read_text("utf-8"))
            plugin_id = str(manifest.get("id", ""))
            if not plugin_id or (settings.plugin_allowlist and plugin_id not in settings.plugin_allowlist):
                continue
            module_path = manifest_path.parent / str(manifest.get("entry", "plugin.py"))
            if not module_path.is_file():
                continue
            spec = importlib.util.spec_from_file_location(f"formflow_llm_plugin_{plugin_id}", module_path)
            if not spec or not spec.loader:
                continue
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            run = getattr(module, "run", None)
            if not callable(run):
                continue
            self._plugins[plugin_id] = Plugin(plugin_id, str(manifest.get("version", "0.0.0")), str(manifest.get("description", "")), run)

    def list(self) -> list[dict[str, Any]]:
        return [{"id": plugin.id, "version": plugin.version, "description": plugin.description, "enabled": True} for plugin in self._plugins.values()]

    def execute(self, plugin_id: str, required_version: str, state: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
        plugin = self._plugins.get(plugin_id)
        if not plugin:
            raise CapabilityError(f"插件未安装或未在白名单中：{plugin_id}")
        if required_version and plugin.version != required_version:
            raise CapabilityError(f"插件版本不匹配：{plugin_id} 需要 {required_version}，当前 {plugin.version}")
        result = plugin.run(dict(state), dict(config))
        if not isinstance(result, dict):
            raise CapabilityError(f"插件 {plugin_id} 必须返回对象")
        return result


plugins = PluginRegistry()
