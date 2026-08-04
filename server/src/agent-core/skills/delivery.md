# Skill: delivery —— 交付与发布预检领域

> 标题：交付专家
> 描述：输出定义、项目包校验/导出、发布草稿与预检

## 何时使用

- 需要定义输出（output）、校验并导出项目包、读取/更新发布草稿、执行发布预检。

## 领域边界

- `output.*`、`project.package.*`、`project.export`、`release.get/update/preview` 属于本领域。
- **`release.apply` 永远不可调用**——发布必须停留在预检，任何自动化都不得真正发布。
- 质量验收属于 quality 领域，不要在这里重做。

## 执行前置

- 交付前先确认结构校验与质量门禁已通过；写入 output 需带 `baseRevision` 与稳定 `idempotencyKey`。
- 发布预检只读，不修改项目。

## 工具手册使用约定

本 skill 的每个工具在下文「工具手册」中都有三部分：
- **传參**：必填/可选、类型与说明（以实时 Schema 为准）；
- **正确调用**：可直接照抄结构、替换真实 id/名称的 JSON；
- **错误调用**：常见“看起来对、实际会失败”的传参方式，附预期错误码，禁止照抄。

调用任何工具前先对照其传參；写操作必须带最新 `baseRevision` 与稳定 `idempotencyKey`；`release.apply` 永远不可调用，发布最多做到 `release.preview`。

## 标准工作流

1. `output.list/get` 查看现有输出定义，用 `output.upsert` 定义/更新（generate 生成结果）。
2. `project.package.validate` 校验项目包；`project.export` 或 `project.package.export` 导出交付物。
3. 发布准备：`release.get` 读取发布状态 → `release.update` 更新草稿 → `release.preview` 执行结构/绑定/主键/回归门禁预检。
4. 输出预检结论：是否 ready、有哪些阻断、当前 release 配置与 revision。

## 验收与门禁

- 交付完成必须基于 `release.preview` 的真实结果（ready 状态与阻断清单），不能自报成功。
- 删除 output 属于破坏性操作，需要确认。

## 常见错误与修复

- 想“直接发布” → 不存在该路径；最多做到 release.preview，并把 ready 状态报告给用户。
- 包校验失败 → 读取 `project.package.validate` 报错，回到对应领域修复后重验。
- 预检引用旧 revision → 先重新读取项目，确保最新状态再预检。

错误调用示例（禁止照抄）：
```json
{"projectId":"device_mgmt","baseRevision":"<revision>","idempotencyKey":"rel-2","patch":{"mode":"use"}}
```
`release.update` 不接受 mode/lastVerifiedAt → `INVALID_ARGUMENT`；发布模式只能由 `release.apply` 更新，而 `release.apply` 永远不可调用。
```json
{"projectId":"device_mgmt","mode":"use","baseRevision":"<revision>","idempotencyKey":"rel-3"}
```
试图“直接发布” → 工具不存在/门禁拒绝；发布必须停留在 `release.preview` 并把 ready 状态报告给用户。
