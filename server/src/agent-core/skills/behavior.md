# Skill: behavior —— 行为规则领域

> 标题：行为规则专家
> 描述：行为、事件、规则参考、语法检查、规则测试与规则代码

## 何时使用

- 需要为表单/Sheet 编写行为规则、事件联动、校验脚本，或读取/更新规则代码。

## 领域边界

- `behavior.*`、`rule_*` 属于本领域；表单的 `ruleCode` 与 `behaviors` 只能由本领域写入（`form.update` 不能改）。
- 流程执行与表单布局不在本领域。
- **跨表/跨 Sheet 的状态写回（如「借出时把设备状态改为借出中」）不能用表单规则实现**：`ruleCode`/`behavior` 只能作用于当前表单字段或当前 Sheet。跨表写回必须改用工作流（workflow：表单提交触发器 → 数据写回节点），由 workflow 领域完成。

## 执行前置

- 先读取真实字段、控件、数据表与流程（跨领域只读），再读取现有行为（`behavior.list`）。
- 写入参数必须带 `baseRevision` 与稳定 `idempotencyKey`；规则代码必须先过语法检查再写入。
- 禁止用示例常量、空表达式或占位符冒充业务实现。

## 工具手册使用约定

本 skill 的每个工具在下文「工具手册」中都有三部分：
- **传參**：必填/可选、类型与说明（以实时 Schema 为准）；
- **正确调用**：可直接照抄结构、替换真实 id/名称的 JSON；
- **错误调用**：常见“看起来对、实际会失败”的传参方式，附预期错误码，禁止照抄。

调用任何工具前先对照其传參；规则代码必须先 `rule_syntax.lint` 再写入，`require/range/validate` 的参数是字段引用或数值而不是表达式；事件名/字段名一律先读取真实标识。

## 标准工作流

1. 读取项目与目标表单/Sheet 现状，`behavior.list` 查看已有行为。
2. 不确定语法时先 `rule_reference.search` 检索参考实现。
3. `rule_syntax.lint` 检查代码/结构化规则语法；`rule_test.run` 在沙箱中跑场景验证。
4. `behavior.upsert` 或 `rule_code.update` 写入（lint 通过后）。`behavior.upsert` 必须带 `scope`（global/sheet/form），scope=form 必须带 `formId`，scope=sheet 必须带 `tableId` 与 `sheetName`；表单字段联动优先用 `rule_code.update`。
5. 形式化验证：对带规则的表单运行 `rule_verify.model`（有界显式状态模型检查），确认事件触发链终止（无无限循环）且迁移确定性一致；未通过时按反例路径修复规则。
6. 完成后运行 `project.validate`，必要时用 `rule_test.run` 回归验证。

## 验收与门禁

- 写入前必须 lint 通过；规则必须引用真实存在的字段、事件、工作流。
- 规则集必须通过 `rule_verify.model` 形式化验证：静态错误、疑似无限触发链或确定性不一致都会阻止任务完成。
- 删除行为属于破坏性操作，需要确认。

## 验证指引

- 写操作成功后系统会自动运行 `project.validate`，并在行为/规则写入后追加 `rule_verify.model` 形式化验证。
- `verification.failed` 出现反例路径时，为触发链添加守卫条件或收敛值消除回环，再重新验证；用 `rule_test.run` 做场景回归。

## 常见错误与修复

- 直接写未 lint 的代码被拒 → 先 `rule_syntax.lint`，按报错逐项修正。
- `rule_code.update` 报「规则语法或引用校验失败」→ 若规则试图引用其他数据表的字段或做跨表更新，说明方法选错了：改用 workflow 领域创建「提交触发器 → 数据写回」流程，而不是继续修表单规则。
- 模型检查返回反例（`acyclic=false`）→ 规则互相触发形成循环；为触发链添加守卫条件或收敛值，消除回环后重新验证。
- `rule_verify.model` 报“超出预算/存疑” → 规则状态空间过大，拆分为更小规则集或降低字段/值域后重新验证。
- 事件名/字段名猜错 → 先读 `form.get`/`data_sheet.get`，用真实标识。
- 测试失败不是结束 → 查看 `rule_test.run` 输出，修正规则后重新测试。

错误调用示例（禁止照抄）：
```json
{"projectId":"device_mgmt","formId":"device_edit","baseRevision":"<revision>","idempotencyKey":"rule-1","code":"when $状态 = \"停用\" -> message(\"x\")"}
```
单等号不是受控运算符 → `RULE_SYNTAX_INVALID`；比较必须用 `==`。
```json
{"projectId":"device_mgmt","formId":"device_edit","baseRevision":"<revision>","idempotencyKey":"rule-2","code":"before submit -> require($评分 + 1)"}
```
把表达式当字段参数 → `RULE_SYNTAX_INVALID`；`require/range/validate` 的参数是字段引用或数值。

## 调用示例（照抄结构，替换真实值）

写两条合法规则（when 用 message/show；提交前校验用 require/range/validate/length，参数是字段引用或数值，不是表达式）：
```json
{"projectId":"device_mgmt","formId":"device_edit","baseRevision":"<revision>","idempotencyKey":"rule-1","code":"when $状态 == \"停用\" -> message(\"该设备已停用\", warning)\nbefore submit -> range($评分, 60, 999)"}
```

常用合法写法（照抄）：
- `when $状态 == "停用" -> message("设备已停用", warning)`（条件命中发提示）
- `before submit -> require($姓名, $手机号)`（提交前必填）
- `before submit -> range($评分, 60, 999)`（提交前数值范围校验）
- `before submit -> validate($邮箱, email)`（格式校验）
- `on submit -> run("device_review")`（提交后触发流程）
- `compute $总分 = $笔试 + $面试 watch($笔试, $面试)`（计算字段）
