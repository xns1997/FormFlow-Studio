# Skill: project —— 项目生命周期领域

> 标题：项目专家
> 描述：项目创建、模板初始化、整包导入、克隆、元信息、项目读取/校验与删除

## 何时使用

- 用户要求从零创建项目、初始化模板、导入整包、克隆项目。
- 需要读取项目整体结构、元信息、revision，或运行全项目结构校验。
- 修改任何领域（data/form/workflow/behavior/quality/delivery）之前，先在本领域完成项目读取。

## 领域边界

- 本领域负责项目级生命周期与只读基础设施：`project.list/get/inspect/validate/create/initialize/update/clone/delete/diff/import/build_from_data/export`。
- 数据表、表单、流程、行为、质量、交付分别属于其他领域，不得在本领域越权修改。

## 执行前置

- 写入前必须先 `project.get` 读取最新 revision，并把它填到写入参数 `baseRevision`；revision 冲突时重新读取并重算，禁止盲目重试旧参数。
- 每个写操作都必须带唯一的、重试时保持不变的 `idempotencyKey`。
- 删除、覆盖、级联删除会返回 `confirmation_required`，这不是失败，等待用户确认即可，禁止绕过。
- 新项目创建（`project.create/initialize/build_from_data/import`）没有 baseRevision，不读取旧 revision。

## 工具手册使用约定

本 skill 的每个工具在下文「工具手册」中都有三部分：
- **传參**：必填/可选、类型与说明（以实时 Schema 为准）；
- **正确调用**：可直接照抄结构、替换真实 id/名称的 JSON；
- **错误调用**：常见“看起来对、实际会失败”的传参方式，附预期错误码，禁止照抄。

调用任何工具前先对照其传參；写操作必须带最新 `baseRevision` 与稳定 `idempotencyKey`；资源 ID 一律先读取真实值，禁止猜测。

## 标准工作流

1. 先用 `project.list`（或用户给的 ID）确定目标项目，用 `project.inspect` 看摘要，用 `project.get` 拿最新 revision。
2. 创建新项目：`project.create` 建空项目，或用 `catalog.templates.list` + `project.initialize` 走行业模板，或用 `project.build_from_data` 从数据一次构建，或用 `project.import` 导入整包。
3. 修改元信息用 `project.update`（patch 局部更新）。
4. 完成后运行 `project.validate` 校验结构、引用、主键和交付门禁。

## 验收与门禁

- 创建或导入后必须核对项目范围（数据表、表单、流程是否齐全）并给出 revision。
- 删除项目（`project.delete`）必须等待用户确认；确认后清出会话项目范围。
- `release.apply` 永远不可调用；发布只做到 `release.preview`。

## 常见错误与修复

- 用旧 revision 写入 → 重新 `project.get`，基于最新 revision 重算，不要原样重放。
- 猜测模板 ID 或字段名 → 先 `catalog.templates.list`、`project.inspect` 读取真实值。
- 把确认等待当成失败重试 → 确认是正常流程，保持参数不变等待用户决定。
- 写入失败返回 `issues/expected/received/suggestedArguments` 时，逐项修正失败调用，不要从头重做。

错误调用示例（禁止照抄）：
```json
{"id":"device_mgmt","name":"设备巡检"}
```
缺 `idempotencyKey` → `IDEMPOTENCY_KEY_REQUIRED`。
```json
{"projectId":"device_mgmt","baseRevision":"<旧值>","idempotencyKey":"upd-1","config":{"description":"x"}}
```
用旧 revision → `PROJECT_REVISION_CONFLICT`，需重新 `project.get`。
