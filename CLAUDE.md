# Claude：FormFlow 工具调用指引

你正在处理 FormFlow Studio。优先调用项目已经提供的 MCP 工具完成项目创建、数据导入、表单设计、行为、工作流、输出和发布，不要直接拼写 `.formflow` 包 JSON，也不要绕过工具的权限、revision、确认和校验。

## MCP 发现

推荐使用 stdio MCP 命令 `formflow-mcp`；也可连接 Streamable HTTP `/mcp`。连接成功后：

1. 调用 `system.capabilities.get`。
2. 调用 `tools/list`，以实时返回的描述和输入 Schema 为准。
3. 根据需要读取以下 resources：
   - `formflow://catalog/components`
   - `formflow://catalog/workflow-nodes`
   - `formflow://catalog/events`
   - `formflow://projects`
   - `formflow://projects/{projectId}/validation`

如果 MCP 客户端不可用，可使用：

- `GET /api/ai/tools` 查看工具；
- `POST /api/ai/tools/<tool-name>/invoke` 调用，body 为 `{ "arguments": { ... } }`。

## 必须遵守的调用协议

- 已有项目先 `project.inspect`；准备写入时调用 `project.get` 获取最新 `revision`。
- 每个写调用都传 `baseRevision` 和唯一的 `idempotencyKey`。同一次操作重试时沿用原 key，不同操作不可复用。
- 收到 `PROJECT_REVISION_CONFLICT` 后重新读取并重算修改，不重复提交旧参数。
- 收到 `confirmation_required` 时停止自动执行，向用户说明 `impact`。用户批准后，保持其余参数完全一致，加入返回的 `confirmationToken` 再调用。
- 删除默认不使用 `cascade`；只有用户明确批准级联影响后才传 `cascade: true`。
- 修改完成后必须执行 `project.validate` 或 `project.package.validate`。
- 发布前必须执行 `release.preview`；`release.apply` 属于破坏性确认操作，不得自行决定发布。

## 工具选择

- 新项目骨架：`project.initialize`
- 已有数据直接生成项目：`project.build_from_data`
- 多资源批量修改：`project.apply_patch`
- 导入/创建数据表：`data_source.import`、`data_source.create`
- 配置 Sheet 和主键：`data_sheet.configure`、`data_keys.validate`
- 查询/写回数据：`data_rows.query`、`data_rows.batch`
- 创建或从表生成表单：`form.create`、`form.generate_from_table`
- 精确修改控件/绑定：`form_component.*`、`form_binding.*`
- 三层行为：`behavior.*`
- 规则参考、检查和测试：`rule_reference.search`、`rule_syntax.lint`、`rule_test.run`
- 流程及节点/连线：`workflow.*`、`workflow_node.*`、`workflow_edge.*`
- 输出与项目包：`output.*`、`project.package.*`
- 发布：`release.get`、`release.preview`、`release.apply`

需要控件或流程节点类型时先查询 `catalog.components.*` 或 `catalog.workflow_nodes.*`，不得创造目录中不存在的类型、属性或端口。

## 数据边界

- 数据导入仅接受已上传 `fileId`、JSON 行数组或 CSV 文本；禁止任意本地路径和远程 URL。
- 内联数据最多 5 MB、10,000 行；查询每页最多 500 行；单次批量变更最多 1,000 项。
- 可编辑 Sheet 必须有非空、唯一主键。
- 云端连接必须带 Bearer Token 和租户；stdio 使用 `FORMFLOW_TOKEN` 与 `FORMFLOW_TENANT_ID`。

离线编辑本地项目包时，使用 `.codex/skills/formflow-project-editor/` 中的 CLI：`inspect → create/normalize → validate --json`，不得直接覆盖输入路径。

完整说明：`docs/llm-tools-mcp.md`；业务编排规范：`docs/project-creation-spec.md`。
