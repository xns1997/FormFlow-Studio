# Skill: quality —— 质量与回归领域

> 标题：质量专家
> 描述：Mock 数据、回归套件、项目质量与结构校验

## 何时使用

- 需要生成 Mock/演示数据、建立并运行回归测试、做独立质量验收。

## 领域边界

- `mock_data.*`、`project_test.*`、`project_analysis.*`、`project.quality.inspect` 属于本领域。
- 本领域只做验收与质量，不执行交付预检或任何发布操作；发布由 delivery 领域负责。

## 执行前置

- 只接受真实项目结果与独立验收证据，不接受静态占位或“专家自报完成”。
- 运行回归前先确认项目结构与数据已就绪；写入 Mock 数据需带 `baseRevision` 与稳定 `idempotencyKey`。

## 工具手册使用约定

本 skill 的每个工具在下文「工具手册」中都有三部分：
- **传參**：必填/可选、类型与说明（以实时 Schema 为准）；
- **正确调用**：可直接照抄结构、替换真实 id/名称的 JSON；
- **错误调用**：常见“看起来对、实际会失败”的传参方式，附预期错误码，禁止照抄。

调用任何工具前先对照其传參；质量验收必须基于真实工具输出；写操作必须带最新 `baseRevision` 与稳定 `idempotencyKey`；Mock 数据先 profile/generate/preview 再 apply。

## 标准工作流

1. `project.quality.inspect` 汇总阶段门禁、结构诊断、绑定缺口与最近测试状态。
2. 需要演示数据时：`mock_data.profile` 看画像 → `mock_data.generate`（可用 `seed` 保证确定性）→ `mock_data.preview` 检查 → `mock_data.apply` 写入。
3. 建立回归：`project_test.generate` 生成场景 → `project_test.run` 运行 → `project_test.history` 查看趋势。
4. 结束后给出结构化验收结论：结构、绑定、主键、测试与剩余问题。

## 验收与门禁

- 质量门禁不通过时，将诊断反馈给对应领域修复后再验收；不得靠跳过或降级门禁通过。
- 对声明了 `computedFields` 的表，逐行验证目标字段与安全表达式一致。

## 常见错误与修复

- 把质量任务写成交付任务 → 交付（release.preview/package）由 delivery 领域执行。
- 用虚构的测试结果充当证据 → 必须提供 `project_test.run`/`project.quality.inspect` 的真实输出。
- Mock 数据与 schema 不一致 → 用 profile 约束生成，preview 后再 apply。

错误调用示例（禁止照抄）：
```json
{"projectId":"device_mgmt","baseRevision":"<revision>","idempotencyKey":"test-run-1","suiteId":"not_a_suite"}
```
suiteId 不存在 → `TEST_SUITE_NOT_FOUND`；套件必须先 `project_test.generate` 生成。
```json
{"projectId":"device_mgmt","tableId":"device","sheetName":"Sheet1","rowCount":5,"baseRevision":"<revision>","idempotencyKey":"mock-1"}
```
跳过 preview 直接 apply → 数据与 schema 不一致时被拒；先用 `mock_data.preview` 检查再写。
