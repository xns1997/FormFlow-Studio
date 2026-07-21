# FormFlow 大模型工具与 MCP

FormFlow Server 在同一进程中暴露七个专职 MCP。它们共用 Schema、权限、revision、确认和审计逻辑，但写工具只归属一个领域。

## 接入方式

- 查看角色：`GET /api/ai/mcp-roles`
- 查看工具：`GET /api/ai/mcp-roles/<role>/tools`
- 调用工具：`POST /api/ai/mcp-roles/<role>/tools/<tool-name>/invoke`，请求体使用 `{ "arguments": { ... } }`
- MCP Streamable HTTP：`POST /mcp/<role>`
- MCP stdio：`formflow-mcp --role <role>` 或 `FORMFLOW_MCP_ROLE=<role> formflow-mcp`

角色为 `project`、`data`、`form`、`workflow`、`behavior`、`quality`、`delivery`。不指定角色会被拒绝；原聚合 `/mcp`、`/api/ai/tools` 和无角色 invoke 接口返回 410。

云端 HTTP 使用现有 Bearer JWT，并通过 `x-tenant-id` 选择租户。stdio 在云端模式下必须设置 `FORMFLOW_TOKEN`，租户通过 `FORMFLOW_TENANT_ID` 指定。

## 写操作约定

已有项目的写操作必须携带最近一次读取返回的 `baseRevision` 和调用方生成的 `idempotencyKey`。revision 不一致时返回 `PROJECT_REVISION_CONFLICT`，调用方应重新读取项目后再生成修改。

删除、覆盖导入、发布，以及包含删除项的批量操作，第一次调用返回 `confirmation_required`。确认后使用完全相同的参数并补充 `confirmationToken` 再调用；令牌五分钟过期、绑定调用人和参数且只能使用一次。

## 数据导入

`data_source.import` 接受：

- 已通过 `/api/files/upload` 上传的 `fileId`；
- `rows` JSON 对象数组；
- `csv` 文本。

不接受服务器文件路径或远程 URL。内联数据最多 5 MB、10,000 行；查询每页最多 500 行；单次批量写回最多 1,000 个变更。

## 项目编排智能体

项目智能体 V2 使用显式版本 API；旧 `/api/ai/project-agent/sessions` 端点返回 410：

- `GET/POST /api/ai/project-agent/v2/sessions`
- `POST /api/ai/project-agent/v2/sessions/:id/turns`
- `GET /api/ai/project-agent/v2/sessions/:id/events?afterSeq=<seq>`
- `POST /api/ai/project-agent/v2/sessions/:id/plans/:planId/confirm`
- `POST /api/ai/project-agent/v2/sessions/:id/operations/:operationId/decision`
- `POST /api/ai/project-agent/v2/sessions/:id/control`
- `GET/POST /api/ai/project-agent/v2/capability-bundles`

根智能体先调用只读工具检查项目，再选择提出最多三个高影响问题或生成任务图。计划确认后，只读任务最多四路并行；所有共享项目写任务按依赖和 revision 串行。执行中可在工具边界暂停、停止或转向。任务只有在 `project.validate` 及对应质量/交付门禁产生验收证据后才算通过。

事件接口支持 JSON 补播和 `text/event-stream`，所有事件携带会话内单调 `seq`；客户端断线后从最后序号恢复。删除、覆盖等操作仍独立等待确认，`release.apply` 永远不进入能力包或专家工具列表。

项目质量与测试相关工具：

- `project.quality.inspect`：统一阶段门禁、引用、绑定、主键和最近回归结果。
- `mock_data.profile/generate/preview/apply`：固定 seed 生成；正常行只追加，负向场景隔离保存。
- `project_test.generate/run/history`：持久化测试套件、运行结构/规则/表单约束测试并保留最近二十次结果。
- `rule_code.update`：由 behavior MCP 专职写入 Behavior Rule DSL；写入前强制 lint，然后编译为表单控件联动。`form.update` 不能绕过该边界修改规则或行为。

项目包中的 `testing/testing.json` 保存生成配置、隔离夹具、测试套件和有界运行历史；旧包缺少该文件时按空资产读取。

## MCP resources

- `formflow://roles/{role}/capabilities`（所有角色）
- `formflow://catalog/components`
- `formflow://catalog/workflow-nodes`
- `formflow://catalog/events`
- `formflow://projects`
- `formflow://projects/{projectId}/validation`

资源只在相关角色中出现。完整工具名称、负责人、说明及输入 Schema 始终以该角色的 `tools/list` 或 `/api/ai/mcp-roles/<role>/tools` 为准。`project.apply_patch` 已移除；创建后的编辑必须使用相应领域工具。发布草稿使用 `delivery` 角色的 `release.update`。
