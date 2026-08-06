# Skill: form —— 表单与控件领域

> 标题：表单专家
> 描述：表单、控件、字段绑定、表单状态与预览

## 何时使用

- 需要创建表单、从数据表生成表单、更新表单设计、增删控件或绑定、预览表单。
- 需要挑选表单模板（空白/基础录入/查询修改/主从详情）时，先查 `catalog.form_templates.list/get` 再创建。

## 领域边界

- `form.*`、`form_component.*`、`form_binding.*` 属于本领域。
- 表单的 `ruleCode` 与 `behaviors` 只能由行为规则领域（behavior）写入；`form.update` 传入这两个字段会被拒绝。
- 行为、规则、事件联动属于 behavior 领域，不要在这里实现。

## 执行前置

- 修改前先读取当前表单（`form.get`）与字段/控件真实标识；写入参数必须带 `baseRevision` 与稳定 `idempotencyKey`。
- 控件必须具有稳定 ID 与合法几何（宽度/高度大于 0、有布局位置）；窗体是表单实例固有配置，不能作为控件新增。

## 工具手册使用约定

本 skill 的每个工具在下文「工具手册」中都有三部分：
- **传參**：必填/可选、类型与说明（以实时 Schema 为准）；
- **正确调用**：可直接照抄结构、替换真实 id/名称的 JSON；
- **错误调用**：常见“看起来对、实际会失败”的传参方式，附预期错误码，禁止照抄。

调用任何工具前先对照其传參；表单的 `ruleCode` 与 `behaviors` 只能由 behavior 领域写入，`form.update` 传这两个字段会被拒；控件 ID 与表单 ID 一律先读取真实值。

## 标准工作流

1. 读取项目与现有表单（`form.list/get`），确定表单模式（create/edit/detail/lookup-edit）。
2. 选模板（可选）：`catalog.form_templates.list` 查看可用模板与默认模式；`catalog.form_templates.get` 查看适用选项。主从详情模板需先声明关系（`requiresRelation=true`）。
3. 从表生成：`form.generate_from_table` 按列类型与主键生成整套表单；传 `templateId` 时模式由模板决定（未显式传 `mode`），设计会记录 `templateKey`。
4. 手工建表：`form.create` 提供稳定 `id`、`name`、`mode`/`templateId`（二选一）与设计对象（可选）；不传 `design` 时按模板初始化空骨架。
5. 布局：`form_component.upsert` 增改控件（按钮动作用 `props.events` 的非空脚本，或 `props.flowTriggers` 指向现有流程的启用触发器）；`form_binding.upsert` 维护字段绑定。
6. 局部更新用 `form.update`（patch 不包含 ruleCode/behaviors）。
7. 完成后运行 `project.validate`，并用 `form.preview` 检查字段、控件与绑定是否齐全。

## 验收与门禁

- 每个表单有默认展示入口；删除表单会检查 release 默认引用，必要时 `cascade=true` 并确认。
- 删除控件会级联清理子控件与绑定，属于破坏性操作，需要确认。

## 验证指引

- 写操作成功后系统会自动运行 `project.validate`，并检查表单引用/绑定是否完整。
- 完成后用 `form.preview` 核对字段、控件与绑定；`ruleCode/behaviors` 的验证由 behavior 领域的形式化验证负责。

## 常见错误与修复

- 用 `form.update` 改规则/行为被拒 → 改走 behavior 领域工具。
- 创建的表单是空壳（0 控件、0 绑定）会被结构校验拦截 → 用 `form.generate_from_table`（按列与主键自动生成控件+绑定），或 `form.create` 后立即用 `form_component.upsert`/`form_binding.upsert` 补齐；不要交付没有控件的表单。
- `CONTROL_TYPE_MISMATCH`（如「字段 归还时间 应使用日期时间控件」）→ 用 `form_component.upsert` 把该控件 type 改成期望类型：日期/时间列用 `datePicker`/`dateRange`/`timePicker`，数值列用 `number`，照片列用 `upload`/`imageUpload`；组件 id 取错误路径最后一段。
- 表单按钮触发流程：先 `workflow.create` 创建流程，再用 `form_component.upsert` 给按钮配置 `props.flowTriggers`（引用真实 workflow id）；`form_component.upsert` 缺少 props/events 会被拒，参照 `form.get` 返回的真实控件结构。
- 控件 ID 或字段绑定拼错 → 先 `form.get` 读取真实标识。
- 按钮没有动作 → 事件脚本必须非空，或 flowTrigger 引用真实存在的 workflow。
- 布局被规范化导致差异 → 以服务端返回结果为准，重新读取后继续。

错误调用示例（禁止照抄）：
```json
{"projectId":"device_mgmt","id":"device_edit","baseRevision":"<revision>","idempotencyKey":"upd-1","patch":{"ruleCode":"when $状态 == \"停用\" -> message(\"x\")"}}
```
用 `form.update` 改规则 → `INVALID_ARGUMENT`，`ruleCode/behaviors` 必须走 behavior MCP。
```json
{"projectId":"device_mgmt","formId":"device_edit","baseRevision":"<revision>","idempotencyKey":"cmp-1","item":{"id":"window","type":"form"}}
```
把表单窗体当控件新增 → `FORM_WINDOW_IS_INTRINSIC`，窗体是表单实例固有配置。
