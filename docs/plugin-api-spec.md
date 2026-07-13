# FormFlow Plugin API v1

插件位于项目根目录 `plugins/<plugin-id>/plugin.json`。清单必须包含：

```json
{
  "apiVersion": 1,
  "id": "example-plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "nodes": [{
    "id": "generic:example",
    "label": "示例节点",
    "description": "插件节点",
    "category": "插件",
    "kind": "generic",
    "properties": [],
    "ports": [],
    "executorUrl": "/plugins/example-plugin/executor/example.js"
  }]
}
```

## 生命周期

- `discover`：启动时扫描清单并校验 `apiVersion`、ID 唯一性。
- `register`：节点加入统一注册表；存在 `executorUrl` 时注册远程执行器。
- `activate`：首次执行节点时动态加载执行模块。
- `reload`：开发环境监听清单变更并重新构建注册表。
- `dispose`：插件移除后注销节点与缓存。

执行模块需导出 `execute(context)`，返回以输出端口名为键的对象。`context` 包含 `inputs`、`properties`，不得直接访问宿主存储；持久化应通过 `/api/plugins/:id/storage/:key`。

插件配置保存在 `server/data/plugins/<plugin-id>.json`。插件 ID、节点 ID 和存储键仅允许字母、数字、`_`、`-`、`:`，宿主会拒绝路径穿越。
