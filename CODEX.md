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
- `formflow://catalog/form-templates`
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
- 表单模板：`catalog.form_templates.list/get`（空白/基础录入/查询修改/主从详情；`form.create` 与 `form.generate_from_table` 支持 `templateId`）
- 控件与绑定：`form_component.upsert/delete`、`form_binding.upsert/delete`
- 行为：`behavior.list/upsert/delete`
- 规则：`rule_reference.search`、`rule_syntax.lint`、`rule_test.run`、`rule_code.update`（lint 通过后写入并编译联动）
- 规则形式化验证：`rule_verify.model`（有界模型检查：事件触发链终止 + 迁移确定性）
- Mock 与回归：`mock_data.profile/generate/preview/apply`、`project_test.generate/run/history`
- 项目质量：`project.quality.inspect`
- 流程：`workflow.create/update/delete/validate`、`workflow_node.*`、`workflow_edge.*`
- 输出：`output.upsert/delete/generate`
- 交付：`project.package.validate/export`
- 发布：`release.get/update/preview`（`release.apply` 永远不可用）

前端项目智能体使用 `/api/ai/project-agent/v5/threads` 建立线程（thread）。智能体采用 **Codex 式单一主循环**：一次用户输入 = 一个 Turn，先只读检查项目并生成**动态展示型计划**（goal、successCriteria、summary、steps，仅用于展示与上下文，不约束执行、无需确认），随后循环内由同一个智能体动态决定下一步调用哪个 MCP 角色作用域的工具，可用 harness 工具 `plan.update` 随时修订动态计划。写工具前自动刷新最新 revision 并注入稳定幂等键，删除/覆盖独立等待确认，`release.apply` 永远不可用。工具结果压缩成简练观察回灌模型；写成功后自动运行最小验证（结构校验，行为/规则写入追加形式化验证），Turn 完成必须通过自审、结构校验、形式化验证、回归测试与 `release.preview`。连续无进展自动给出纠正指引继续执行，同类问题收敛到阈值后才会标记 blocked 并提问；决策步预算超限暂停。进度通过带单调 `seq` 的 SSE 事件流发布，暂停、停止和转向在工具边界生效。旧 V4/V2/V1 端点与 v1 记录已彻底移除/忽略，启动时只加载 schemaVersion=2 的线程。

Agent Core 按 **harness 组件**拆分（`server/src/agent-core/harness/`）：`agent-loop`（领域无关驱动）、`prompts`（PromptAssembler）、`events`（EventEmitter）；`tools/permissions/verification/recovery/context` 由 `formflow-harness.ts` 把 FormFlow 的 MCP 工具、门禁、skill 与 revision/检查点实现为接口注入，模型可替换、副作用必须走工具。

循环能力：决策支持 `batchReads` 一步并行最多 3 个只读工具（写/破坏性仍一步一个）；瞬时错误与 revision 冲突自动恢复（消耗 `maxRecoveryCycles` 预算，预算用尽才暂停）；大工具结果自动转存 artifact，模型可用内置只读工具 `context.read_artifact` 分段回读；提示词超过 `context.maxPromptChars`（默认 40000）时触发结构化上下文压缩（保留目标/约束/决策/验证/剩余工作）；写操作前自动建立项目检查点（`/checkpoints/restore` 由用户显式回滚）；Turn 完成前必须运行回归测试（`project_test.generate/run`，预存失败不阻塞、引入失败必须修复）并通过模型自审；每 turn 记录运行指标（`/threads/:id/metrics`、管理员 `/metrics`）。模型路由支持按用途（plan/decision/summarize/verify）选路（`ModelRoute.purpose`）。

行为规则在写后验证与 Turn 最终门禁中还会运行**形式化验证**：对每个携带 Behavior Rule DSL 的表单执行 `rule_verify.model`（有界显式状态模型检查），静态错误、疑似无限触发链或迁移确定性不一致都会阻止 Turn 完成；模型反例路径会回灌给智能体用于修复。

线程不区分计划/目标模式：提交 Turn 即动态执行，用户可随时暂停、打断（转向）、继续或停止。

工具总数和具体 Schema 以实时 `tools/list` 为准。

`form.update` 不得修改 `ruleCode` 或 `behaviors`；这两类写入必须由 behavior MCP 完成。对声明了 `sheet.config.computedFields` 的数据表，质量检查会逐行验证目标字段与安全表达式是否一致。

## 数据与安全约束

- 数据导入只接受已上传的 `fileId`、JSON `rows` 或 CSV 文本；不接受任意服务器路径或远程 URL。
- 内联数据最多 5 MB、10,000 行；查询每页最多 500 行；单次 batch 最多 1,000 个变更。
- 可编辑 Sheet 必须配置非空且唯一的主键，必要时先用 `data_keys.validate`。
- 默认不级联删除。存在引用时，先向用户报告引用；只有用户明确同意后才设置 `cascade: true` 并完成确认调用。
- 云端 MCP/HTTP 必须使用 Bearer Token 和 `x-tenant-id`；stdio 云端模式使用 `FORMFLOW_TOKEN` 与 `FORMFLOW_TENANT_ID`。

## 版本号规范

提交代码时必须遵循语义化版本约束：

- **0.0.x**（补丁）：修复 bug、样式调整、CSS 微调、文案修正、文档勘误
- **0.x.0**（次版本）：新增功能、改进已有功能、重构模块、新增配置项、性能优化

示例：
- 修复 Switch 手柄尺寸 → `0.0.x`
- 增加系统设置外观配置项 → `0.x.0`
- 调整组件间距 → `0.0.x`
- 新增工作流执行偏好设置 → `0.x.0`

## 离线项目包

如果 FormFlow Server/MCP 不可用，而任务只涉及已解包项目目录或 `.formflow` 单文件包，使用仓库内置 `formflow-project-editor` skill：先 `inspect`，再通过紧凑 YAML 执行 `create` 或 `normalize`，最后执行 `validate --json`。禁止直接原地覆盖输入项目。

完整接口说明见 `docs/llm-tools-mcp.md`，项目编排规范见 `docs/project-creation-spec.md`。
