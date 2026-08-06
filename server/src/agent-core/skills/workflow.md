# Skill: workflow —— 工作流领域

> 标题：流程专家
> 描述：工作流、节点、连线与流程校验

## 何时使用

- 需要创建、替换或删除工作流，调整节点与连线，或校验流程结构与端口。

## 领域边界

- `workflow.*` 与 `workflow_node.*`、`workflow_edge.*` 属于本领域。
- 流程触发的表单按钮配置在 form 领域，规则联动在 behavior 领域，不要越权。

## 执行前置

- 修改前先读取现有节点、端口与连线（`workflow.get`）；写入参数必须带 `baseRevision` 与稳定 `idempotencyKey`。
- 节点使用 `specId/position/data`（propertiesJson 序列化），连线使用 source/target 节点 ID 与 `out:`/`in:` 端口。
- 只引用真实存在的节点、端口和表单资源，禁止捏造 ID。

## 工具手册使用约定

本 skill 的每个工具在下文「工具手册」中都有三部分：
- **传參**：必填/可选、类型与说明（以实时 Schema 为准）；
- **正确调用**：可直接照抄结构、替换真实 id/名称的 JSON；
- **错误调用**：常见“看起来对、实际会失败”的传参方式，附预期错误码，禁止照抄。

调用任何工具前先对照其传參；连线端口必须带 `out:`/`in:` 前缀，source/target 必须引用真实节点；写操作必须带最新 `baseRevision` 与稳定 `idempotencyKey`。

## 标准工作流

1. 读取项目与现有流程（`workflow.list/get`），查看节点 specId 与端口（可参考 `catalog.workflow_nodes`）。
2. `workflow.create` 或 `workflow.update` 提供稳定 ID 的完整流程（nodes + edges）。
3. 增量调整用 `workflow_node.upsert` / `workflow_edge.upsert`，按稳定 ID 新增或替换。
4. 删除节点前检查是否仍被连线引用；有引用时 `cascade=true` 并等待确认。
5. 完成后运行 `workflow.validate`（按流程范围）+ `project.validate` 全项目结构。

### 保存/写回工作流配方（表单提交 → 数据写回）

「表单提交后更新数据表」必须走流程，不能用表单规则。标准三节点：
`workflow:import`（输入表单数据）→ `behavior:submit`（校验 + 写回）→ `workflow:export`（成功/变更/写回事件）。

**优先使用 `workflow.generate_from_table`**（arguments: projectId/tableId/sheetName/id/name/baseRevision/idempotencyKey）：系统按表与主键生成节点/端口/连线全部合法的写回工作流，避免手拼节点出错；生成后用 `form_component.upsert` 把表单按钮的 `props.flowTriggers`（对象 { 事件名: { enabled: true, workflowId } }）指向该流程 id。

`behavior:submit` 的 `propertiesJson` 关键参数：`validateFirst`、`writeBackMode`（upsert/update）、`writeBackTableId`、`writeBackSheetName`、`writeBackKeyField`、`writeBackKeyFormField`、`writeBackFieldMap`（表单字段 → 表列，用真实列名）。

端口连接：`workflow:import.out:formData → behavior:submit.in:formData`、`out:originalData → in:originalData`；`behavior:submit.out:success/changeLog/writeBack/fileData → workflow:export.in:success/changeLog/writeBack/fileData`。

先在 `catalog.workflow_nodes.list` 查真实 specId 与端口，再建边；参数必须引用真实表、Sheet 与字段。

## 调用示例（照抄结构，替换真实值；节点与端口必须真实存在）

创建一条已验证可用的简单流程（表单加载 → 条件判断 → 记录日志）：
```json
{"projectId":"device_mgmt","id":"device_review","baseRevision":"<revision>","idempotencyKey":"wf-1","item":{"id":"device_review","name":"设备巡检审批","nodes":[{"id":"n1","specId":"behavior-on-form-load","label":"表单加载","position":{"x":40,"y":40}},{"id":"n2","specId":"behavior-condition","label":"评分判断","position":{"x":280,"y":40}},{"id":"n3","specId":"behavior-log","label":"记录日志","position":{"x":520,"y":40}}],"edges":[{"id":"e1","source":"n1","sourceHandle":"out:trigger","target":"n2","targetHandle":"in:trigger"},{"id":"e2","source":"n2","sourceHandle":"out:true","target":"n3","targetHandle":"in:trigger"}]}}
```

端口参考：`behavior-on-form-load`（in trigger / out trigger）、`behavior-condition`（in trigger,value,compareValue / out true,false,value）、`behavior-log`（in trigger,message,data）。`behavior-notify`/`behavior-compose-message` 没有输入端口，不能作为连线终点。

## 验收与门禁

- 流程节点、边、端口引用必须全部有效；连线必须连接到真实端口。
- 删除流程/节点/连线属于破坏性操作，需要确认。

## 验证指引

- 写操作成功后系统会自动运行 `project.validate`；流程改动额外运行 `workflow.validate`（按流程范围）。
- 校验失败时读取报错中的节点/端口引用，用 `workflow.get` 核对真实端口后修复。

## 常见错误与修复

- 端口写法错误（缺 `out:`/`in:` 前缀）→ 用 `workflow.get` 读取真实端口 ID 后重试。
- 引用了不存在的表单/按钮 → 先在 form 领域读取，或先创建对应资源。
- 用 `workflow.update` 覆盖未读取的最新状态 → 先读取再合并，避免覆盖他人改动。

错误调用示例（禁止照抄）：
```json
{"projectId":"device_mgmt","workflowId":"device_review","baseRevision":"<revision>","idempotencyKey":"edge-1","item":{"id":"e9","source":"n9","sourceHandle":"out:trigger","target":"n1","targetHandle":"in:trigger"}}
```
连线引用不存在的节点 → `PROJECT_VALIDATION_FAILED`；source/target 必须指向真实节点。
```json
{"projectId":"device_mgmt","id":"wf1","baseRevision":"<revision>","idempotencyKey":"wf-2","item":{"id":"wf1","name":"坏边","nodes":[{"id":"n1","specId":"behavior-notify"}],"edges":[{"id":"e1","source":"n1","target":"n1"}]}}
```
边缺少 `out:`/`in:` 端口 → `PROJECT_VALIDATION_FAILED`；端口写法必须先读 `workflow.get`。
