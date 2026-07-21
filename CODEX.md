# Codex：FormFlow 工具调用指引

你正在处理 FormFlow Studio。项目已经提供七个专职 MCP；它们共享工具注册中心、安全和 revision 机制，但写工具按领域强隔离。不要先手写 `.formflow` 包中的重复 JSON，也不要绕过权限、revision、确认或校验机制。

## 首选入口

优先通过 MCP 使用工具：

- stdio 命令：`formflow-mcp --role <role>`，也可设置 `FORMFLOW_MCP_ROLE`
- Streamable HTTP：`POST /mcp/<role>`
- 角色目录：`GET /api/ai/mcp-roles`
- HTTP 工具目录：`GET /api/ai/mcp-roles/<role>/tools`
- HTTP 工具调用：`POST /api/ai/mcp-roles/<role>/tools/<tool-name>/invoke`

合法角色为 `project`、`data`、`form`、`workflow`、`behavior`、`quality`、`delivery`。原 `/mcp` 和 `/api/ai/tools` 已移除并返回 410。

连接后先调用 `system.capabilities.get`，再使用 MCP `tools/list` 获取实时工具 Schema。不要凭记忆猜参数。

可读 MCP resources：

- `formflow://catalog/components`
- `formflow://catalog/workflow-nodes`
- `formflow://catalog/events`
- `formflow://projects`
- `formflow://projects/{projectId}/validation`

## 标准执行顺序

1. 先发现：调用 `system.capabilities.get` 和相关 `catalog.*` 工具。
2. 先读取：已有项目先用 `project.inspect` 获取摘要；需要修改时再用 `project.get` 获取最新 `revision`。
3. 再修改：已有项目的写操作必须传最新 `baseRevision` 和本次调用唯一、重试时保持不变的 `idempotencyKey`。
4. 处理确认：删除、覆盖、发布及含删除项的批量操作首次返回 `confirmation_required`。向用户说明影响；获准后用完全相同的参数加 `confirmationToken` 再调用。
5. 最后校验：调用 `project.validate` 或 `project.package.validate`。准备发布时先调用 `release.preview`，不得自动发布。

发生 `PROJECT_REVISION_CONFLICT` 时，重新调用 `project.get`，基于新 revision 重新计算修改；不要盲目重试旧 patch。

## 常用工具导航

- 项目创建：`project.create`、`project.initialize`
- 从数据一次构建：`project.build_from_data`
- 数据表：`data_source.create/import/update/delete`
- Sheet 与主键：`data_sheet.get/configure`、`data_keys.validate`
- 数据行：`data_rows.query/batch`
- 表单：`form.create/generate_from_table/update/delete`
- 控件与绑定：`form_component.upsert/delete`、`form_binding.upsert/delete`
- 行为：`behavior.list/upsert/delete`
- 规则：`rule_reference.search`、`rule_syntax.lint`、`rule_test.run`、`rule_code.update`（lint 通过后写入并编译联动）
- Mock 与回归：`mock_data.profile/generate/preview/apply`、`project_test.generate/run/history`
- 项目质量：`project.quality.inspect`
- 流程：`workflow.create/update/delete/validate`、`workflow_node.*`、`workflow_edge.*`
- 输出：`output.upsert/delete/generate`
- 交付：`project.package.validate/export`
- 发布：`release.get/update/preview/apply`

前端项目智能体使用 `/api/ai/project-agent/v2/sessions` 建立 V2 会话。根智能体在 Plan 阶段只能通过各角色的只读工具检查项目，再提出最多三个高影响问题或生成可确认任务图。确认后，只读任务可以并行，共享项目写任务必须按依赖和 revision 串行；每个专家仍只能调用所属 MCP。进度通过带单调 `seq` 的 SSE 事件流发布，暂停、停止和转向在工具边界生效。破坏性确认和发布门禁不因计划确认而放宽，`release.apply` 永远不可用。旧 `/api/ai/project-agent/sessions` 返回 410。

工具总数和具体 Schema 以实时 `tools/list` 为准。

`form.update` 不得修改 `ruleCode` 或 `behaviors`；这两类写入必须由 behavior MCP 完成。对声明了 `sheet.config.computedFields` 的数据表，质量检查会逐行验证目标字段与安全表达式是否一致。

## 数据与安全约束

- 数据导入只接受已上传的 `fileId`、JSON `rows` 或 CSV 文本；不接受任意服务器路径或远程 URL。
- 内联数据最多 5 MB、10,000 行；查询每页最多 500 行；单次 batch 最多 1,000 个变更。
- 可编辑 Sheet 必须配置非空且唯一的主键，必要时先用 `data_keys.validate`。
- 默认不级联删除。存在引用时，先向用户报告引用；只有用户明确同意后才设置 `cascade: true` 并完成确认调用。
- 云端 MCP/HTTP 必须使用 Bearer Token 和 `x-tenant-id`；stdio 云端模式使用 `FORMFLOW_TOKEN` 与 `FORMFLOW_TENANT_ID`。

## 离线项目包

如果 FormFlow Server/MCP 不可用，而任务只涉及已解包项目目录或 `.formflow` 单文件包，使用仓库内置 `formflow-project-editor` skill：先 `inspect`，再通过紧凑 YAML 执行 `create` 或 `normalize`，最后执行 `validate --json`。禁止直接原地覆盖输入项目。

完整接口说明见 `docs/llm-tools-mcp.md`，项目编排规范见 `docs/project-creation-spec.md`。
