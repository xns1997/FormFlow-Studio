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
- `GET /api/ai/project-agent/v2/sessions/history?q=&status=&projectId=&archived=&cursor=&limit=`：只返回轻量历史摘要并使用不透明游标分页。
- `PATCH /api/ai/project-agent/v2/sessions/:id`：更新历史任务标题或置顶状态。
- `DELETE /api/ai/project-agent/v2/sessions/:id`、`POST /api/ai/project-agent/v2/sessions/:id/restore`：归档与恢复任务，不删除项目内容。
- `DELETE /api/ai/project-agent/v2/sessions/:id/permanent`：明确确认后永久删除任务及其审计记录；执行中的任务必须先安全暂停。
- `POST /api/ai/project-agent/v2/sessions/:id/turns`
- `GET /api/ai/project-agent/v2/sessions/:id/events?afterSeq=<seq>`
- `POST /api/ai/project-agent/v2/sessions/:id/plans/:planId/confirm`
- `POST /api/ai/project-agent/v2/sessions/:id/operations/:operationId/decision`
- `POST /api/ai/project-agent/v2/sessions/:id/control`
- `GET/POST /api/ai/project-agent/v2/capability-bundles`

根智能体先调用只读工具检查项目，再提出最多三个高影响问题或生成目标契约。目标契约只确认需求、成功标准、范围与风险，不预先生成专家任务图。执行阶段由协调器根据最新观察选择下一步行动；互不依赖的只读任务最多四路并发，任何写任务独占当前决策步并使用最新 revision。工具结果压缩成可读观察后回灌模型，新增风险、项目范围或破坏性操作仍需确认。连续两次没有证据、revision 或需求状态推进时暂停并向用户提问，最大步数由能力包的 `maxDecisionSteps` 控制，并兼容旧 `maxLoopRounds`。协调器的 `complete` 不能绕过需求证据及质量/交付门禁。

事件接口支持 JSON 补播和 `text/event-stream`，所有事件携带会话内单调 `seq`；客户端断线后从最后序号恢复。新会话发布 `decision_started`、`action_selected`、`action_started`、`observation_recorded`、`action_completed`、`orchestration_stalled` 和 `orchestration_completed`；旧事件继续兼容读取。删除、覆盖等操作仍独立等待确认，`release.apply` 永远不进入能力包或专家工具列表。

会话中的消息和目标契约可携带 `turnId`，动态任务通过内部 `stepId` 关联其触发行动。前端据此将用户输入、目标确认、当前行动、工具反馈、验收和最终回复渲染为单一业务时间线；内部序号和 ID 不进入普通界面。旧会话仍可从 `rounds` 与 `roundId` 转换为业务行动，缺少关联字段时按时间戳与事件顺序回退归组，API 路径和既有字段保持兼容。

项目质量与测试相关工具：

- `project.quality.inspect`：统一阶段门禁、引用、绑定、主键和最近回归结果。
- `mock_data.profile/generate/preview/apply`：固定 seed 生成；正常行只追加，负向场景隔离保存。
- `project_test.generate/run/history`：持久化测试套件、运行结构/规则/表单约束测试并保留最近二十次结果。
- `rule_code.update`：由 behavior MCP 专职写入 Behavior Rule DSL；写入前强制 lint，然后编译为表单控件联动。`form.update` 不能绕过该边界修改规则或行为。

项目包中的 `testing/testing.json` 保存生成配置、隔离夹具、测试套件和有界运行历史；旧包缺少该文件时按空资产读取。

## 表单坐标约定

新建或更新的表单设计使用 `coordinateSpace: "window-content-v1"`。控件 `x/y` 是窗体内容区局部坐标；内容区位于固定 `52px` 标题栏和窗体内边距之后。窗体底栏启用时预留 `64px`。编辑、预览和使用态共用这一坐标模型，窗体按控件边界只增不减地自动扩展；使用态保持原始像素尺寸，外层最多占 `90vw/90vh`，超出部分滚动而不缩放或重排。

未带 `coordinateSpace` 的旧表单在读取时按旧画布绝对坐标迁移。迁移会保持控件原画布位置、处理左侧或顶部负坐标并扩展窗体，保存标记后不会重复换算。

## MCP resources

- `formflow://roles/{role}/capabilities`（所有角色）
- `formflow://catalog/components`
- `formflow://catalog/workflow-nodes`
- `formflow://catalog/events`
- `formflow://projects`
- `formflow://projects/{projectId}/validation`

资源只在相关角色中出现。完整工具名称、负责人、说明及输入 Schema 始终以该角色的 `tools/list` 或 `/api/ai/mcp-roles/<role>/tools` 为准。`project.apply_patch` 已移除；创建后的编辑必须使用相应领域工具。发布草稿使用 `delivery` 角色的 `release.update`。
