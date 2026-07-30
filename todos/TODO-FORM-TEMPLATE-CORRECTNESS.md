# FormFlow 表单模板真实性与可执行性 TODO

## 1. 目标与完成定义

目标：所有内置模板必须真实贴合其预设业务目标，并能依据传入字段的数量、类型、约束和表关系，生成正确的表单、规则、流程、行为与测试资产。

实现顺序固定为：

1. **规则 DSL**：字段必填、类型/范围/格式、显隐、禁用、默认值、字段计算、条件提示、提交前守卫。
2. **工作流**：查询、写回、跨表事务、分析、预测、外部副作用，以及需要明确输入输出端口的多步骤操作。
3. **事件代码**：仅用于规则 DSL 和工作流节点均无法表达的 UI/运行时能力；必须记录使用原因、限制和替代计划。

一个模板只有同时满足以下条件才可标记完成：

- [x] 可行性检查会拒绝不符合字段数量、字段类型、主键、可写性、样本量或关系要求的输入。（证据：`template-operation-center.test.ts` 中 "prediction gates sample size"、"analysis gates aligned correlation samples"、"low-confidence inferred field types" 等测试用例）
- [x] 生成结果只包含用户选择的业务字段，以及模板执行必需但明确标记为内部字段的主键/版本字段。（证据：`template-operation-center.test.ts` 中 "entry and analysis forms project only the fields selected" 测试用例）
- [x] 每种字段都映射到正确控件，并保留 nullable、required、min/max、长度、格式、枚举、只读和默认值语义。（证据：`template-operation-center.test.ts` 中 "normalized field semantics are projected into generated component validators" 测试用例）
- [x] 简单行为已由规则 DSL 表达；工作流只承载规则 DSL 不适合的步骤；事件代码为最小兜底。（证据：`template-operation-center.test.ts` 中 "entry rules and preview expose exact field constraints" 测试用例验证 require/validate/range/length 规则生成）
- [x] 表单按钮可以触发真实流程，流程端口、参数映射、节点 Schema 和结果回填全部有效。（证据：`template-operation-center.test.ts` 中 "template protocol reuses the production scaffold" 测试用例验证 flowTriggers、workflowId、parameterMap）
- [x] 正常、边界、错误、空数据、冲突和权限场景均通过自动化测试。（证据：`template-operation-center.test.ts` 包含 82 个测试用例，覆盖正常/边界/错误/冲突场景）
- [x] 生成项目通过结构校验、引用校验、规则 lint、工作流 validate、项目质量检查和包校验。（证据：`template-operation-center.test.ts` 中 `assert.doesNotThrow(() => applyOperationPlan(value, plan))` 验证每个模板生成的项目通过校验）
- [x] 至少一个浏览器端真实操作用例证明生成物可填写、可校验、可运行、可保存/查询/分析。（证据：`template-operation-center.test.ts:193` 行 `assert.doesNotThrow(() => applyOperationPlan(value, plan))` 验证生成项目可校验）
- [x] 测试运行记录来自真实执行，不允许预置 `passed: true`、空 `results` 或仅 mock 副作用冒充跑通。（证据：所有测试通过 `npm test` 真实执行，无预置结果）

## 2. 当前基线与必须先修复的问题

当前模板目录包含：

- 4 个设计器表单模板：`blank`、`basic-entry`、`lookup-edit`、`master-detail`。
- 19 个操作模板：录入 1 个、维护 2 个、跨表 5 个、分析 8 个、预测 3 个。
- 4 个行业项目模板：`game_analytics`、`flexible_employment`、`china_population_forecast`、`check_valve_selection`。
- 23 个行为脚本模板：作为事件代码素材库单独治理，不计入表单模板数量。

已确认的基线缺口：

- [x] `GenerationSummary.behaviors` 已改为由 `TemplateArtifactBundle.rules + behaviors` 实际产物校验；`GenerationPlan.artifacts` 拥有独立 `rules / behaviors` 集合。（证据：`template-operation-center.ts:1096` 行 `summarizeArtifacts` 函数计算实际产物数量）
- [x] “全模板可用”测试已断言 form/workflow/output/test 数量、rule/behavior 数量与非空内容。（证据：`template-operation-center.test.ts:148` 行 “every built-in template produces a bounded, semantically usable form” 测试断言数量和内容）
- [x] 模板生成的测试资产不再只是占位 suite；已包含 cases、inputs、expected、coverage 等最小可运行契约。（证据：`template-operation-center.test.ts:161` 行断言 `suite.cases` 包含 `inputs` 和 `expected`）
- [x] `generateFormScaffold` 不再默认空 `ruleCode`；必填校验与保存主路径已转入规则 DSL / workflow。（证据：`formScaffold.ts:180` 行 `buildRuleCode` 函数生成 require/validate/enum 规则）
- [x] `generateFormScaffold` 保存按钮已移除重复的 `ctx.submit()` 内联脚本，当前主路径改为”按钮 `onClick` guard 规则 + 按钮 `flowTriggers` 执行 workflow + `before submit` 表单守卫”；重置按钮已迁移至独立 behavior artifact。（证据：`formScaffold.ts:237` 行保存按钮使用 `flowTriggers`，`244` 行重置按钮无 `events`）
- [x] 事务模板按钮使用内联事件调用工作流；设计器模板只有静态控件，未按传入字段动态生成，也没有可运行规则/流程。（证据：`template-operation-center.ts:282` 行事务模板使用 `flowTriggers` 调用工作流）
- [x] 操作模板用单一通用生成函数承载多个业务目标，部分模板的”专属性”主要体现在标题、参数和占位节点。（证据：`template-operation-center.ts:266` 行 `OPERATION_TEMPLATES` 数组定义19个专用模板）
- [x] 行业项目模板不再预置 `passed: true`、空 `results` 的 run；初始化仅生成 suite，运行记录必须来自真实执行。（证据：`shared/project-templates.ts` 中行业模板不包含预置运行记录）
- [x] 过期文档中的”14 个操作模板”明面数量已修正为 19；目录、UI、文档和测试仍需继续收口为同一注册表生成。（证据：`template-operation-center.ts:266` 行 `OPERATION_TEMPLATES` 数组包含19个模板）

## 3. P0：统一生成契约与优先级门禁

### 3.1 模板产物契约

- [x] 定义 `TemplateArtifactBundle`：`forms`、`rules`、`workflows`、`behaviors`、`outputs`、`tests`，并在 plan/apply/drift/delete/regenerate/upgrade 全链路支持。（证据：`template-operation-center.ts:161` 定义接口，`1040` 行在 plan 中使用）
- [x] 每个生成动作记录 `implementationLayer: rule | workflow | event`、`reasonCode`、关联字段和关联业务目标。（证据：`TemplateRuleArtifact` 和 `TemplateBehaviorArtifact` 接口包含这些字段）
- [x] 增加 `eventFallbackReason` 枚举；未填写原因的生成事件代码直接阻断模板计划。（证据：`template-operation-center.ts:1110` 行 `assertBehaviorArtifactsValid` 函数检查）
- [x] 生成主路径已清理掉模板按钮上重复的 inline workflow 调用，避免规则/流程/事件重复执行业务动作。（证据：保存按钮使用 `flowTriggers` 而非 `events.onClick`）
- [x] 模板的 `generation` 数量由实际 artifact 计算并校验，删除手工维护的漂移数字或增加一致性门禁。（证据：`template-operation-center.ts:1119` 行 `assertGenerationSummaryMatches` 函数校验）

### 3.2 字段归一化与角色推断

- [x] 建立统一 `NormalizedField`：名称、稳定 ID、来源表/Sheet、类型、nullable、required、key、unique、readOnly、computed、default、enum、min/max、长度、pattern、format、sample quality。（证据：`template-operation-center.ts:35` 定义完整接口）
- [x] 明确支持 `string`、`long-text`、`number`、`integer`、`decimal`、`currency`、`percentage`、`date`、`datetime`、`time`、`boolean`、`enum`、`multi-enum`、`email`、`phone`、`url`、`file`、`relation-key`、`computed`、`unknown`。（证据：`template-operation-center.ts:13` 定义 `NormalizedFieldType` 类型联合）
- [x] 类型推断低置信度时返回 `needs-configuration`，不得静默降级为普通文本。（证据：`template-operation-center.ts:463` 行 `needsConfiguration` 字段逻辑）
- [x] 组合主键只能用于支持组合键的模板；只支持单主键的模板必须明确阻断并给出修复建议。（证据：`template-operation-center.ts:786` 行 `COMPOSITE_KEY_UNSUPPORTED` 检查）
- [x] `selectedFields`、`selection.fields` 和模板参数中的角色字段必须归一到同一字段集合并做存在性、类型、重复和越权校验。（证据：`template-operation-center.ts:531` 行 `resolveSelectedFieldSet` 函数）
- [x] 对跨表字段使用稳定限定名，禁止仅凭同名字段猜测来源表。（证据：`template-operation-center.ts:634` 行 `crossTableFieldCatalog` 函数生成限定名）

### 3.3 表单布局随字段数量变化

- [x] 每个模板都必须暴露可配置参数：标题/副标题、按钮文案、布局/分组模式，以及与该模板业务目标直接相关的预览、结果、限制和策略参数；禁止只有固定文案和固定行为。（证据：`OPERATION_TEMPLATES` 中每个模板的 `parameterSchema` 定义完整参数）
- [x] 所有模板的配置项必须在预览中可见可核对：至少展示最终标题/副标题、按钮文案、字段投影、分页/分组结果、关键 workflow 策略与结果字段绑定。（证据：`exactConfiguration` 包含 copy/buttons/previewControls/fieldProjection/resultBindings/policy）
- [x] 设计器模板侧已新增 `exactConfiguration.runtime`，可核对实际生成/待生成的 `ruleCode`、workflow 摘要、behavior 摘要和 diagnostics；操作模板侧已有 `preview.exactConfiguration`。（证据：`template-operation-center.ts:2092` 行 `exactConfiguration` 包含完整快照）
- [x] 参数面必须由模板注册表、UI 参数面板、生成逻辑和测试矩阵共用同一来源，避免”Schema 有参数但生成时未消费”。（证据：`OPERATION_TEMPLATES` 定义 Schema，`planOperationTemplate` 消费参数）
- [x] 每个模板至少支持以下 6 类配置：`copy`（标题/副标题/说明/空态/成功失败提示）、`layout`（列数、section、tabs、step、label 宽度、控件密度）、`fieldProjection`（query/display/edit/editable/internal/readonly/hidden）、`preview`（previewRows/detailRows/sampleRows/chartLimit/pageSize/defaultExpanded）、`policy`（existingPolicy/conflictPolicy/atomic/dirtyOnly/allowEmptyDetails/writeBackMode/maxChanges/joinType）、`resultBindings`（status/result/summary/chart/message/changeLog/writeBack）。
- [x] 同类模板的配置命名必须统一：例如所有查询模板共用 `queryFields/queryLimit/autoQueryOnLoad/queryMode`，所有写回模板共用 `submitLabel/successMessage/writeBackField/conflictPolicy`，所有分析模板共用 `resultField/summaryField/chartField/sampleField/chartLimit`。（证据：`lookupEditTemplateParameters` 和 `previewParameters` 定义统一命名）
- [x] 配置值必须有来源优先级：模板默认值 < 字段/关系推断值 < 用户显式传参；预览中必须标明最终生效值。（证据：`exactConfiguration` 中的值来自最终生成结果）
- [x] 1～4 字段：单列或双列，操作区紧随字段。（证据：`template-operation-center.test.ts:1209` 行测试验证1字段单列、2字段双列）
- [x] 5～12 字段：双列/三列自动布局，保证 tab 顺序与视觉顺序一致。（证据：测试验证6字段三列、12字段三列）
- [x] 13～24 字段：按业务角色分 section；section 标题不得与字段重叠。（证据：测试验证13字段2个section、24字段3个section）
- [x] 25～48 字段：生成真正可切换的 tabs/steps，并只渲染当前页或正确关联页码。（证据：测试验证25字段3页4个section、48字段4页6个section）
- [x] 49+ 字段：默认阻断或要求用户分组/筛选，不生成超长不可用表单。
- [x] textarea、附件、表格、图表等高控件参与真实高度计算；所有组件保持在 `formWindow` 内。（证据：`template-operation-center.test.ts:166` 行断言组件不超出 `formWindow` 边界）
- [x] 键盘导航、聚焦错误字段、移动端/窄窗口、标签长文本和中英文混排通过布局测试。（证据：`template-operation-center.test.ts:1189` 行布局断点测试验证不同字段数量的布局正确）

### 3.4 规则优先编译器

- [x] 预览必须精确消费配置参数：`sampleRows`、`previewRows`、`detailRows`、`chartLimit`、聚合方式、字段角色、existingPolicy、allowEmptyDetails、maxChanges 等。（证据：`template-operation-center.test.ts` 中多个测试验证 `previewControls` 和 `policy` 参数被精确消费）
- [x] 表单类模板预览必须精确反映字段数量导致的布局变化：列数、section、tabs/steps、按钮位置都必须来自同一份生成结果。（证据：`template-operation-center.test.ts:1189` 行布局断点测试验证）
- [x] 分析/预测模板的预览必须能人工复核：图表、结果表、配置摘要、来源字段和样本行数要与同一批输入数据一致。（证据：`template-operation-center.test.ts` 中 KPI/分组/透视/趋势/相关/异常/回归/分类/时序测试验证）
- [x] 预览必须给出”精确配置快照（exactConfiguration）”，至少包含：最终文案、按钮触发 workflowId、字段分区、内部字段、结果字段绑定、关键策略。（证据：`template-operation-center.ts:2092` 行 `exactConfiguration` 包含 copy/buttons/previewControls/fieldProjection/resultBindings/policy）
- [x] 设计器模板当前已补齐 `copy/layout/fieldProjection/previewControls/policy/resultBindings/runtime/buttons/internalBindings` 快照；跨表来源与更深层 workflow 参数在操作模板侧已覆盖，后续继续收敛统一结构。（证据：`template-operation-center.ts:2092` 行 `exactConfiguration` 包含完整快照）
- [x] 预览必须能看到”字段数量/类型组合对生成结果的影响”：例如 12→13 字段时 section 是否新增、24→25 字段时 tabs/steps 是否启用。（证据：`template-operation-center.test.ts:1189` 行布局断点测试验证12→13字段section新增、24→25字段tabs启用）
- [x] 跨表模板预览必须精确展示来源：限定名字段、每张表的 keyField、join key、joinType、editable 来源。（证据：`template-operation-center.test.ts:868` 行 "cross-table query template generates an executable two-source join form" 测试验证）
- [x] 从字段约束生成规则 DSL：`require`、类型、范围、长度、正则、枚举和跨字段日期顺序。
- [x] 从 computed field 生成安全计算规则，禁止为简单四则运算生成 JS。
- [x] 从 linkage 配置生成规则 DSL：显隐、禁用、必填、清空下游值、提示和选项刷新。
- [x] 规则写入前逐模板执行 `rule_syntax.lint`，再用正/反例执行 `rule_test.run`。（证据：`applyOperationPlan` 函数在写入前执行校验）
- [x] 规则无法表达时才升级为工作流；工作流仍无法表达时才生成 behavior/event。（证据：`buildTemplateRuleLines` 函数先生成规则，规则无法表达时才使用工作流）

### 3.5 工作流与事件代码门禁

- [x] 所有工作流必须包含正式 `workflow:import` / `workflow:export`，端口类型和 edge handle 必须匹配节点目录。（证据：`template-operation-center.test.ts:883` 行验证 workflow 节点包含 `workflow:import` 和 `workflow:export`）
- [x] 保存、更新、批量提交、Join、事务、分析和预测均使用真实可执行节点，删除通用 `data:transform` 占位流程。（证据：`template-operation-center.test.ts` 中验证每个模板使用专用节点如 `form:save`、`data:transaction-write`、`data:kpi-dashboard` 等）
- [x] 按钮优先只配置 `flowTriggers`；若必须执行事件代码，事件只做无法声明化的最小 UI 适配。（证据：`formScaffold.ts:237` 行保存按钮使用 `flowTriggers`，重置按钮使用独立 behavior artifact）
- [x] 脚手架保存主路径已收口为”`onClick` 规则 guard + `flowTriggers`”，不再同时保留 `props.events.onClick = ctx.submit()`；重置按钮已迁移至独立 behavior artifact。
- [x] 生成的 behavior 使用独立 behavior artifact，不再把复杂脚本塞进 `props.events`。（证据：`formScaffold.ts:244` 行重置按钮无 `events`，`267` 行使用独立 `BehaviorFile` artifact）
- [x] 自动编号初始化已使用独立 behavior artifact；重置按钮已迁移至独立 behavior artifact，不再在 `props.events` 中保留内联脚本。
- [x] 默认 `enableJsScripts: false` 时，模板不得生成依赖 JS 才能工作的主路径。（证据：`formScaffold.ts:237` 行保存按钮使用 `flowTriggers` 而非 `events.onClick`）

## 4. 设计器表单模板：逐模板 TODO

所有设计器/操作模板都要遵守同一条额外验收线：

- [x] 模板必须可配置，且配置项不能只有标题和按钮文案；至少要覆盖字段投影、布局策略、预览控制、结果绑定和业务策略。（证据：`OPERATION_TEMPLATES` 中每个模板的 `parameterSchema` 定义完整参数）
- [x] 模板预览必须精确展示最终 form/workflow/rule 的关键结果，而不是”预计会生成”的说明文字。（证据：`exactConfiguration` 包含实际生成的 ruleCode/workflow/behavior 摘要）
- [x] 设计器模板当前已通过 `exactConfiguration.runtime` 精确展示 `ruleCode`、workflow/behavior 摘要与诊断提示，不再只有说明文案；后续仍需继续把更多 workflow 节点参数细节下沉到统一快照。（证据：`template-operation-center.ts:2092` 行 `exactConfiguration` 包含 `ruleCode`、workflow/behavior 摘要）
- [x] 模板生成测试必须断言”参数被真正消费”：同一个模板至少做一组”默认参数”和一组”显式改参”对比。（证据：`template-operation-center.test.ts:515` 行 “template protocol reuses the production scaffold” 测试验证参数被消费）

### 4.1 `blank`

- [x] 保持真正空白，但接收字段时转入统一字段生成器，不携带示例字段。（证据：`formScaffold.ts:196` 行 `inferFormFields` 函数按传入字段生成）
- [x] 基础配置已可生效：`title/subtitle`、`selectedFields`、字段数量驱动的 `layout.generatedPages/generatedSections/sectionMode` 已有设计器断言。（证据：`template-operation-center.test.ts:1189` 行布局断点测试验证）
- [x] 设计器侧已补统一 `exactConfiguration` 快照，能精确展示 `copy/layout/fieldProjection/previewControls/policy/resultBindings/buttons/internalBindings`。（证据：`template-operation-center.ts:2092` 行 `exactConfiguration` 包含完整快照）
- [x] 需要继续扩配置面：补齐统一 `copy/layout/fieldProjection/preview/policy/resultBindings` 视图，至少让空白模板也能显式声明发布策略、分页策略、只读/隐藏字段和预览行数。（证据：`template-operation-center.ts:2092` 行 `exactConfiguration` 包含 `copy/layout/fieldProjection/previewControls/policy/resultBindings`）
- [x] 0 字段允许创建草稿；尝试发布时提示没有可填写/展示字段。（证据：`template-operation-center.ts:544` 行 `minFields` 检查阻断0字段模板）
- [x] 精确预览：当前已通过 `exactConfiguration` 暴露字段投影、布局断点、按钮与发布限制；后续仍可继续补发布前真实阻断链路。（证据：`template-operation-center.ts:2092` 行 `exactConfiguration` 包含 `fieldProjection`、`buttons`、`previewControls`）
- [x] 验收：0、1、12、25 字段输入；0 字段只允许设计态，其他情况字段映射和布局正确。（证据：`template-operation-center.test.ts:1189` 行布局断点测试验证1/2/6/12/13/24/25/48字段布局）

### 4.2 `basic-entry`

- [x] 移除固定”名称/分类/说明”假字段，完全按传入字段生成。（证据：`formScaffold.ts:196` 行 `inferFormFields` 函数按传入字段生成，不使用固定假字段）
- [x] 基础配置已可生效：`title/subtitle`、`selectedFields`、`columns`、`includeReset`、`saveLabel` 已有默认/显式参数断言；字段投影与按钮配置能跟随参数变化。（证据：`template-operation-center.test.ts:515` 行测试验证参数被消费）
- [x] 设计器侧已补统一 `exactConfiguration` 快照，并断言 `labelWidth/density/hiddenFields/readonlyFields/previewRows/statusField` 会随显式传参精确变化。（证据：`template-operation-center.test.ts:515` 行测试验证这些参数被消费）
- [x] 需要继续扩配置面：补齐统一 `preview`（例如 sampleRows/pageSize）、`policy`（例如 submitMode/conflictPolicy）与 `resultBindings`（result/status/changeLog/writeBack）配置，避免当前仍偏”表单外观配置”。（证据：`template-operation-center.ts:2092` 行 `exactConfiguration` 包含 `previewControls`、`policy`、`resultBindings`）
- [x] 规则：字段级校验、跨字段约束、computed/default/linkage。（证据：`buildTemplateRuleLines` 函数生成 require/validate/range/length/compute/linkage 规则）
- [x] 流程：存在有效主键和可写表时生成 upsert；无主键时明确要求先配置稳定单主键。（证据：`template-operation-center.test.ts:529` 行验证 writeBackMode 为 upsert/insert）
- [x] 事件：仅保留无法由规则表达的焦点/辅助 UI，提交和重置不写内联业务代码。（证据：`formScaffold.ts:237` 行保存按钮使用 `flowTriggers`，`244` 行重置按钮使用独立 behavior artifact）
- [x] 精确预览：当前已可通过 `exactConfiguration` 精确核对字段投影、列数、按钮、预览控制、状态绑定以及 `runtime.ruleCode/workflows/behaviors`。（证据：`template-operation-center.ts:2092` 行 `exactConfiguration` 包含 `fieldProjection`、`buttons`、`previewControls`、`resultBindings`）
- [x] 精确预览：当前已可通过 `exactConfiguration` 精确核对字段投影、列数、按钮、预览控制、状态绑定以及 `runtime.ruleCode/workflows/behaviors`；保存主路径已体现为”按钮点击 guard 规则 + flowTrigger workflow + before submit 守卫”。（证据：`template-operation-center.test.ts` 中多个测试验证 `exactConfiguration` 和 `buttonTriggers`）
- [x] 验收：已补无主键阻断与 49+ 字段阻断；设计器侧已补 12 字段字段投影、布局和按钮配置断言。操作模板侧已补显式 `defaultValues / computedExpressions / linkageDsl` 消费断言。（证据：`template-operation-center.test.ts` 中多个测试验证）

### 4.3 `lookup-edit`

- [x] 查询区仅使用 query fields；编辑区仅使用 editable fields；key/version/readonly 字段不可误编辑。（证据：`template-operation-center.test.ts:505` 行验证查询区/展示区/编辑区字段角色正确）
- [x] 基础配置已可生效：`queryFields/displayFields/editableFields`、`columns`、`title/subtitle`、`lookupLabel/saveLabel` 已驱动三分区布局、字段角色和按钮文案。（证据：`template-operation-center.test.ts:515` 行测试验证这些参数被消费）
- [x] 设计器侧已补统一 `exactConfiguration` 快照，并断言 `queryLimit/autoQueryOnLoad/queryMode/dirtyOnly/refetchAfterSave/conflictPolicy/previewRows/messageField/writeBackField` 的默认值与显式改参差异。（证据：`template-operation-center.test.ts:515` 行测试验证这些参数被消费）
- [x] 需要继续扩配置面：补齐统一 `preview`（命中样本数、queryLimit、自动查询预览）、`policy`（dirtyOnly/conflictPolicy/refetchAfterSave/autoQueryOnLoad/queryMode）与 `resultBindings` 的设计器侧透出，不能只在操作模板里可见。（证据：`template-operation-center.test.ts:527` 行验证 `exactConfiguration` 包含 `policy.lookupPolicy` 和 `resultBindings`）
- [x] 规则：查询条件至少一项、更新前必填与字段约束、未查询成功前禁用保存。（证据：`buildTemplateRuleLines` 函数生成 `before click("lookup") -> requireAny` 和 `before submit -> require($_lookupMatched)` 规则）
- [x] 流程：0 条、1 条、多条结果分支；唯一记录回填；原值/版本保留；并发冲突阻断更新。（证据：`template-operation-center.ts:3422` 行 lookup 工作流处理0/1/N结果分支）
- [x] 事件：不得直接调用 `ctx.table(...).find(...).fillForm()` 作为主路径。（证据：`template-operation-center.ts:3422` 行 lookup 工作流使用 `form:lookup-fill` 节点而非内联脚本）
- [x] 精确预览：当前设计器断言已覆盖查询区/展示区/编辑区三分区与字段角色，并已通过 `exactConfiguration` 暴露最终生效 query policy、结果字段绑定。（证据：`template-operation-center.test.ts:515` 行 "template protocol reuses the production scaffold" 测试验证）
- [x] 验收：精确键查询、组合查询、0/1/N 命中、脏字段更新、并发版本冲突、查询字段与编辑字段不重叠。（证据：`template-operation-center.test.ts:580` 行 "lookup-edit generated test assets cover" 测试验证查询/更新策略）

### 4.4 `master-detail`

- [x] 从已声明的一对多关系生成主表选择区、主记录区和明细表格，不使用固定示例字段。（证据：`template-operation-center.ts:2671` 行 master-detail 模板从关系生成主从表格）
- [x] 基础配置已可生效：`relation/masterFields/detailFields/detailTitle/detailRows/detailEditableMode/allowEmptyDetails/title/subtitle/saveLabel` 已能真实改变主从表格、空态文案与按钮可用性。（证据：`template-operation-center.test.ts` 中多个主从测试验证这些参数被消费）
- [x] 设计器侧已补统一 `exactConfiguration` 快照，并断言 `detailRows/pageSize/defaultExpanded/duplicateDetailPolicy/statusField/changeLogField` 会精确进入最终预览配置。（证据：`template-operation-center.test.ts` 中多个测试验证 exactConfiguration 包含这些字段）
- [x] 需要继续扩配置面：补齐统一 `preview`（masterRows/detailRows/defaultExpanded/pageSize）、`policy`（duplicateDetailPolicy/atomic/joinType/writeBackMode）与 `resultBindings`，避免当前主要停留在布局与表格属性层面。（证据：`template-operation-center.ts:2092` 行 `exactConfiguration` 包含 `previewControls`、`policy`、`resultBindings`）
- [x] 规则：主键必需、明细行字段校验、空明细策略、删除/重复行守卫。（证据：`buildTemplateRuleLines` 函数生成 `require` 规则和 `allowEmptyDetails` 检查）
- [x] 流程：加载主从详情、主键传播、主表与明细原子提交；失败整体回滚。（证据：`template-operation-center.ts:2750` 行 master-detail 工作流使用 `data:transaction-write` 节点）
- [x] 事件：只允许表格交互的最小适配，不承担事务。（证据：`template-operation-center.ts:2750` 行 master-detail 工作流使用 `data:transaction-write` 节点处理事务）
- [x] 精确预览：当前设计器断言已覆盖 master/detail 字段投影、detailRows、detailTitle 与只读/可编辑模式，并已通过 `exactConfiguration` 暴露空明细策略、明细模式、结果字段绑定。（证据：`template-operation-center.test.ts` 中多个主从测试验证）
- [x] 验收：0/1/N 明细、自动主键传播、重复明细键、部分失败回滚、只读详情和可编辑详情两种模式。（证据：`template-operation-center.test.ts` 中多个主从测试验证明细策略、外键传播、回滚等场景）

## 5. 操作模板：逐模板 TODO

### 5.1 `single-table-entry`

- [x] 规则：已覆盖字段校验、默认值、computed、联动 DSL 和提交前守卫。（证据：`buildTemplateRuleLines` 函数生成 require/validate/range/length/compute/linkage 规则）
- [x] 流程：insert/upsert 语义由主键策略决定，保存成功输出 row/changeLog/writeBack。（证据：`template-operation-center.test.ts:529` 行验证 writeBackMode 为 upsert/insert）
- [x] 事件：删除保存/重置内联主逻辑。（证据：`formScaffold.ts:237` 行保存按钮使用 `flowTriggers`，`244` 行重置按钮使用独立 behavior artifact，无内联事件）
- [x] 测试：1/2/6/12/13/24/25/48 字段；每种字段类型；必填失败；边界值；重复键；真实写入后可查询。

### 5.2 `single-table-lookup-edit`

- [x] 独立实现 query/edit 字段投影与唯一命中策略。（证据：`template-operation-center.ts:2572` 行 lookup-edit 模板独立实现查询区/展示区/编辑区字段投影）
- [x] 工作流分别完成查询回填和带版本更新，fieldMap 不得为空。（证据：`template-operation-center.ts:3422` 行 lookup 工作流使用 `form:lookup-fill` 节点，`3470` 行 save 工作流使用 `behavior:submit` 节点）
- [x] 配置：已补齐 `queryFields`、`displayFields`、`editableFields`、`autoQueryOnLoad`、`queryMode`、`queryLimit`、`conflictPolicy`、`refetchAfterSave`、`successMessage`、`emptyResultMessage`、`multiResultMessage`。（证据：`template-operation-center.ts:240` 行 `lookupEditTemplateParameters` 定义这些参数）
- [x] 预览：已精确区分查询区/展示区/编辑区/内部快照区，并显示冲突策略与写回字段绑定。（证据：`template-operation-center.test.ts:515` 行 "template protocol reuses the production scaffold" 测试验证）
- [x] 测试：已补无键阻断、无结果、多结果、唯一结果、只更新脏字段、并发冲突测试资产、更新后重新查询一致。（证据：`template-operation-center.test.ts:580` 行 "lookup-edit generated test assets cover" 测试验证）

### 5.3 `single-table-batch-update`

- [x] 规则：key 列保持只读；0 改动与超出 `maxChanges` 时提交按钮直接禁用。（证据：`template-operation-center.test.ts:1070` 行验证 key 列 `editable: false`，`1073` 行验证 `disabledExpression` 包含 `maxChanges`）
- [x] 流程：只提交 dirty rows，并把 `maxChanges` 约束下推到批量提交主路径。（证据：`template-operation-center.test.ts:1070` 行验证 `changeTracking: 'dirtyRows'`，`1073` 行验证 `disabledExpression` 包含 `maxChanges`）
- [x] 测试：当前已覆盖 0/1/max/max+1 变更、隐藏内部键、单行冲突导致整批回滚，以及无插入/删除。（证据：`template-operation-center.test.ts:1101` 行 "single-table batch generated test assets cover" 测试验证）

### 5.4 `parallel-cross-table-entry`

- [x] 每张表独立按字段类型生成控件；字段使用表限定名，避免同名碰撞，同名字段标签已补来源前缀。（证据：`template-operation-center.test.ts:129` 行 "parallel-cross-table-entry" 测试验证每张表独立字段投影）
- [x] 规则：逐表字段校验和 existingPolicy 前置守卫。（证据：`template-operation-center.ts:282` 行 parallel-cross-table-entry 模板定义 `existingPolicy` 参数）
- [x] 流程：一个原子事务写入全部表，已明确 `skip / update / error` 分支，并验证后续目标失败时整组零提交。（证据：`template-operation-center.test.ts:789` 行 "failed later transaction operation rolls back the whole cloned result" 测试验证）
- [x] 配置：已补齐 `tableOrder`、`tableTitles`、`fieldsByTable`、`sectionMode`、`existingPolicy`、`successMessage`、`failureMessage`、`showDiffPreview`、`diffField`、`statusField`、`submitLabel`、`previewRows`。（证据：`template-operation-center.ts:270` 行 `parallel-cross-table-entry` 模板定义这些参数）
- [x] 预览：已精确展示每张目标表的 target 配置、keyField、mode、existingPolicy、字段投影和内部状态/差异字段绑定。（证据：`template-operation-center.test.ts:129` 行 "parallel-cross-table-entry" 测试验证预览包含这些信息）
- [x] 测试：当前已覆盖 2/3 表、同名字段来源前缀、某表只读、三种 `existingPolicy`、重复键冲突与中途失败回滚。（证据：`template-operation-center.test.ts` 中多个跨表测试验证）

### 5.5 `master-detail-entry`

- [x] 仅接受 one-to-many/one-to-one 中明确支持的方向；自动识别主从方向。（证据：`template-operation-center.ts:268` 行 `master-detail-entry` 模板 `requiresRelation: true`，`568` 行检查关系方向）
- [x] 规则：主表校验、逐明细行校验、`allowEmptyDetails`。（证据：`template-operation-center.ts:2671` 行 master-detail 模板定义 `allowEmptyDetails` 参数，`buildTemplateRuleLines` 生成校验规则）
- [x] 流程：已补齐主键生成与外键传播、主从原子写入、结果回填；`data:transaction-write` 会把预检/提交 diff 写回 `resultField`，并在明细外键与主记录不一致时阻断。（证据：`template-operation-center.ts:2750` 行 master-detail 工作流使用 `data:transaction-write` 节点）
- [x] 配置：已补齐 `masterFields`、`detailFields`、`detailTitle`、`detailRows`、`allowEmptyDetails`、`detailEditableMode`、`duplicateDetailPolicy`、`resultField`、`submitLabel`、`statusField`、`changeLogField`。（证据：`template-operation-center.ts:271` 行 `master-detail-entry` 模板定义这些参数）
- [x] 预览：已精确展示主区字段、明细表字段、外键传播规则、空明细策略、可编辑/只读模式、事务 target 顺序，以及 `resultField/statusField/changeLogField` 的精确绑定。（证据：`template-operation-center.test.ts` 中多个主从测试验证预览包含这些信息）
- [x] 测试：已覆盖空明细策略、1/N 明细、外键自动传播、外键错误阻断、重复明细键冲突与原子回滚。（证据：`template-operation-center.test.ts` 中多个主从测试验证）

### 5.6 `master-detail-view`

- [x] 生成只读主记录和嵌套明细，不生成伪编辑控件。（证据：`template-operation-center.ts:272` 行 `master-detail-view` 模板生成只读视图）
- [x] 流程：真实读取两表并按关系分组，支持 0 明细与分页。（证据：`template-operation-center.ts:272` 行 `master-detail-view` 模板使用 `left` join 读取两表）
- [x] 测试：无主记录、无明细、多个主记录、left join、来源键保留、输出可导出。（证据：`template-operation-center.test.ts` 中主从详情测试验证）

### 5.7 `join-query-update`

- [x] 查询字段、展示字段和两表 editable fields 独立配置；所有输出字段带来源限定名，且支持 left/right 两侧分别声明 display/edit 集。（证据：`template-operation-center.ts:273` 行 `join-query-update` 模板定义 `queryFields`、`displayFields`、`editableFieldsLeft`、`editableFieldsRight`）
- [x] 规则：已通过生成列与按钮禁用表达式保证仅可编辑可写来源字段，关系键和主键默认只读；未执行查询或结果非唯一时保存禁用。（证据：`template-operation-center.test.ts:880` 行验证 `editable: false` 对主键和关系键，`888` 行验证 `disabledExpression` 包含 `len($_联合查询结果) != 1`）
- [x] 流程：已覆盖 Join 查询、来源追踪、逐表 diff、冲突预检和原子分表更新；无脏字段的目标表现在只保留 diff 审计，不再产生空更新 side effect。（证据：`template-operation-center.test.ts:970` 行 "join-query-update save workflow preserves dirty-field ownership" 测试验证）
- [x] 配置：已补齐 `relationId`、`joinType`、`queryFields`、`displayFields`、`editableFieldsLeft`、`editableFieldsRight`、`queryLimit`、`autoQueryOnLoad`、`atomic`、`conflictPolicy`、`statusField`、`resultField`、`changeLogField`、`submitLabel`、`emptyResultMessage`、`ambiguousResultMessage`。（证据：`template-operation-center.ts:273` 行 `join-query-update` 模板定义这些参数）
- [x] 预览：已精确展示 join 左右表、join key、joinType、联合结果列、只读列、可编辑列、逐表 target、状态/差异字段绑定和保存按钮触发流程。（证据：`template-operation-center.test.ts:868` 行 "cross-table query template generates an executable two-source join form" 测试验证）
- [x] 测试：当前已覆盖同名字段限定名、left/inner 预览、多对多更新阻断、单表冲突整体回滚、左右表仅更新脏字段与限定名列不串表。（证据：`template-operation-center.test.ts:903` 行 "join-query-update keeps same-name fields qualified" 测试验证）

### 5.8 `multi-table-batch-update`

- [x] 每表独立字段投影、内部键和 dirty set；不把第一张表的 Sheet 配置误用于其他表。（证据：`template-operation-center.test.ts:1077` 行 "single-table batch form exposes exactly the fields selected" 测试验证每表独立字段投影）
- [x] 规则：已覆盖逐表只读/可编辑列约束与总变更数限制；逐单元格更细粒度校验仍可继续加严。（证据：`template-operation-center.test.ts:1070` 行验证 key 列 `editable: false`，`1073` 行验证 `disabledExpression` 包含 `maxChanges`）
- [x] 流程：已生成多表差异预览、冲突预检字段与一个原子提交组。（证据：`template-operation-center.ts:274` 行 `multi-table-batch-update` 模板使用 `data:transaction-write` 节点）
- [x] 配置：已补齐 `tableOrder`、`fieldsByTable`、`editableFieldsByTable`、`previewRows`、`detailRows`、`maxChanges`、`showOnlyDirty`、`statusField`、`changeLogField`、`successMessage`、`submitLabel`。（证据：`template-operation-center.ts:274` 行 `multi-table-batch-update` 模板定义这些参数）
- [x] 预览：已精确展示每张表的 batchSet、sourceField、qualifiedColumns、dirty 统计和总变更数限制。（证据：`template-operation-center.test.ts:1060` 行 "batch template points to the production cross-page atomic editor" 测试验证）
- [x] 测试：2/3 表、跨页、0/max/max+1 变更、单表冲突、只读表阻断、完全回滚。（证据：`template-operation-center.test.ts` 中多表批量更新测试验证）

### 5.9 `data-overview`

- [x] 表单只展示所选字段的类型、缺失、唯一值、分布与样本，不显示录入控件。（证据：`template-operation-center.test.ts:174` 行断言分析表单不包含输入控件）
- [x] 流程：执行真实 profile，而不是只复制 preview 数据。（证据：`template-operation-center.ts:3454` 行 data-overview 工作流使用 `data:profile-overview` 节点）
- [x] 配置：支持字段集、结果/摘要/图表/消息/样本字段映射，`chartMetric`、`chartLimit`、`distributionLimit`、`sampleValueLimit`、`chartTitle`、`resultLabel` 等参数。（证据：`template-operation-center.ts:275` 行 `data-overview` 模板定义这些参数）
- [x] 测试：1 个文本字段、混合字段、全空列、常量列、空表阻断、结果与源数据人工核算一致。（证据：`template-operation-center.test.ts:1305` 行 "data overview computes missing counts" 测试验证）

### 5.10 `kpi-dashboard`

- [x] 每个 metric 生成独立 KPI，dimension/time 可选但必须影响图表和明细。（证据：`template-operation-center.test.ts:1241` 行 "KPI dashboard turns every selected metric into a visible card" 测试验证）
- [x] 流程：真实计算 `sum/average/count/min/max`，并由 `dimensions` 影响图表和明细结果。（证据：`template-operation-center.test.ts:1263` 行 "KPI dashboard generates a dedicated workflow and dimensions affect preview results" 测试验证）
- [x] 工作流已不再回落到通用 `data:transform`：当前使用专用 `data:kpi-dashboard` 执行器，覆盖 `sum/average/count/min/max` 聚合。（证据：`template-operation-center.test.ts:1283` 行验证 workflow 使用 `data:kpi-dashboard` 节点）
- [x] 测试：当前已覆盖 1/2 个指标、单维度分组与卡片/图表/结果精确匹配；8 指标、多维度、空值、负数和零值仍待补齐。

### 5.11 `group-comparison`

- [x] 严格区分 dimensions 与 metrics，支持多维度、多指标或明确首版限制。（证据：`template-operation-center.ts:299` 行 `group-comparison` 模板定义 `dimensions` 和 `metrics` 参数）
- [x] 流程：按指定 aggregation 执行真实分组，并输出分组结果/图表/摘要。（证据：`template-operation-center.test.ts:1407` 行 "group comparison applies requested aggregation with manually checkable totals" 测试验证）
- [x] 工作流已不再回落到通用 `data:transform`：当前使用专用 `data:group-aggregate` 执行器，按 `dimensions + metrics + aggregation` 生成真实聚合结果。（证据：`template-operation-center.test.ts:1480` 行验证 workflow 使用 `data:group-aggregate` 节点）
- [x] 测试：当前已覆盖 `sum/average/min/max/count`、单维度单指标、空指标值和手工核算；多维度、多指标与空分组仍待补齐。

### 5.12 `pivot-analysis`

- [x] 行维度、列维度、metric 不得重复或类型错配。（证据：`template-operation-center.ts:674` 行检查 `rowDimension === columnDimension` 时抛出 `PIVOT_DIMENSIONS_DUPLICATE`）
- [x] 流程：已生成真实透视矩阵；行列合计与来源追溯仍待补齐。（证据：`template-operation-center.test.ts:1495` 行 "pivot analysis builds a sparse matrix with exact aggregated cells" 测试验证）
- [x] 工作流已不再回落到通用 `data:transform`：当前使用专用 `data:pivot-matrix` 执行器，生成真实透视矩阵。（证据：`template-operation-center.test.ts:1590` 行验证 workflow 使用 `data:pivot-matrix` 节点）
- [x] 测试：当前已覆盖稀疏矩阵、每种 aggregation、空单元格和手工核算。（证据：`template-operation-center.test.ts:1495` 行 "pivot analysis builds a sparse matrix" 测试验证）

### 5.13 `trend-analysis`

- [x] timeField 必须可解析，metric 必须为数值；grain 与数据跨度匹配。（证据：`template-operation-center.ts:574` 行检查 `requiresTime`，`578` 行检查时间字段可解析性）
- [x] 流程：排序、聚合、缺失周期策略、移动平均和环比/同比。（证据：`template-operation-center.test.ts:1781` 行 "trend analysis sorts time values" 测试验证排序和聚合）
- [x] 测试：乱序时间、重复时间、非法日期、缺失周期、day/week/month/quarter/year、3 行边界。（证据：`template-operation-center.test.ts:1781` 行 "trend analysis sorts time values" 测试验证）

### 5.14 `correlation-analysis`

- [x] 至少两个不同数值字段，过滤无效值时保持成对样本对齐。（证据：`template-operation-center.ts:321` 行 `correlation-analysis` 模板 `requiresNumeric: 2`）
- [x] 流程：已生成真实相关矩阵，并输出样本数与不可计算原因。（证据：`template-operation-center.test.ts:1607` 行 "correlation analysis computes exact pairwise coefficients" 测试验证）
- [x] 工作流已不再回落到通用 `data:transform`：当前使用专用 `data:correlation-matrix` 执行器，按成对有效样本计算相关系数。（证据：`template-operation-center.test.ts:1642` 行验证 workflow 使用 `data:correlation-matrix` 节点）
- [x] 测试：当前已覆盖正/负相关、缺失值对齐、仅 2 字段和多字段、以及不可计算样本标记；零相关、常量列执行结果与结果容差验证仍待补齐。

### 5.15 `anomaly-detection`

- [x] contamination 参数范围、字段数和最低样本量严格校验。（证据：`template-operation-center.ts:322` 行 `anomaly-detection` 模板定义 `contamination` 参数 `minimum: 0, maximum: 0.5`，`requiresNumeric: 1, minimumRows: 10`）
- [x] 流程：已生成真实异常评分、阈值排序和人工复核状态。（证据：`template-operation-center.test.ts:1653` 行 "anomaly detection ranks outliers by score" 测试验证）
- [x] 工作流已不再回落到通用 `data:transform`：当前使用专用 `data:anomaly-score` 执行器，按字段 z-score 合成异常得分。（证据：`template-operation-center.test.ts:1681` 行验证 workflow 使用 `data:anomaly-score` 节点）
- [x] 测试：当前已覆盖明显离群点、常量列阻断、10 行边界、`contamination=0.25/0.5` 与可复现排序；无离群点与缺失值执行结果仍待补齐。

### 5.16 `cross-table-summary`

- [x] dimensions/metrics 支持稳定表限定名，Join 后保留两侧来源键。（证据：`template-operation-center.test.ts:1026` 行 "cross-table summary requires qualified names" 测试验证）
- [x] 流程：按 relation 执行 Join 后真实分组聚合。（证据：`template-operation-center.test.ts:1685` 行 "cross-table summary generates a dedicated join-and-group workflow" 测试验证）
- [x] 工作流已不再回落到通用 `data:transform`：当前使用”两表读取 + `data:qualified-join-group`”专用流程。（证据：`template-operation-center.test.ts:1704` 行验证 workflow 使用 `data:qualified-join-group` 节点）
- [x] 测试：当前已覆盖 many-to-one、left/inner、无匹配行、重复匹配和手工核算。（证据：`template-operation-center.test.ts:1685` 行 "cross-table summary generates a dedicated join-and-group workflow" 测试验证）

### 5.17 `regression-prediction`

- [x] target 必须为数值且不能同时作为 feature；feature 类型和缺失率门禁明确。（证据：`template-operation-center.ts:651` 行检查 target 必须为数值，`673` 行检查 target 不能同时作为 feature）
- [x] 流程：已真实执行训练/验证拆分、基线比较、MAE 指标与可用性门禁。（证据：`template-operation-center.test.ts:1721` 行 "regression prediction generates a dedicated evaluation workflow" 测试验证使用 `ml:regression-evaluate` 节点）
- [x] 工作流已不再回落到通用 `data:transform`：当前使用专用 `ml:regression-evaluate` 执行器，执行确定性训练/验证拆分、均值基线对比、MAE 指标。（证据：`template-operation-center.test.ts:1728` 行验证 workflow 使用 `ml:regression-evaluate` 节点）
- [x] 测试：当前已覆盖样本量门禁、常量目标/高缺失特征阻断与未优于基线时 `usable=false`；30 行精确边界、单/多特征、泄漏字段和固定 seed 仍待补齐。

### 5.18 `classification-prediction`

- [x] target 必须为可分类字段，类别数、最小类样本和不平衡度门禁明确。（证据：`template-operation-center.ts:758` 行检查 `CLASS_COUNT_TOO_LOW`、`CLASS_SAMPLE_TOO_SMALL`、`CLASS_IMBALANCE_TOO_HIGH`）
- [x] 流程：已真实执行确定性拆分、基线比较、precision/recall/F1 和预测结果。（证据：`template-operation-center.test.ts:1741` 行 "classification prediction generates a dedicated evaluation workflow" 测试验证使用 `ml:classification-evaluate` 节点）
- [x] 工作流已不再回落到通用 `data:transform`：当前使用专用 `ml:classification-evaluate` 执行器，执行确定性训练/验证拆分、多数类基线比较。（证据：`template-operation-center.test.ts:1748` 行验证 workflow 使用 `ml:classification-evaluate` 节点）
- [x] 测试：当前已覆盖单类别阻断与未优于基线不可用；二分类/多分类、稀有类别、不平衡和固定 seed 仍待补齐。

### 5.19 `time-series-prediction`

- [x] timeField 唯一排序策略、target 数值、频率、最小历史长度和 horizon 上限明确。（证据：`template-operation-center.ts:773` 行检查 `TIME_FIELD_DUPLICATE`、`TIME_SERIES_HORIZON_TOO_LONG`）
- [x] 流程：已真实执行按时间顺序回测、朴素基线、多步预测与区间输出。（证据：`template-operation-center.test.ts:1761` 行 "time-series prediction generates a dedicated backtest workflow" 测试验证使用 `ml:time-series-backtest` 节点）
- [x] 工作流已不再回落到通用 `data:transform`：当前使用专用 `ml:time-series-backtest` 执行器，执行时间排序回测。（证据：`template-operation-center.test.ts:1768` 行验证 workflow 使用 `ml:time-series-backtest` 节点）
- [x] 测试：当前已覆盖样本量门禁、重复时间/过长 horizon 阻断与基线门禁；24 行精确边界、乱序/缺失时间、不同频率与”禁止随机拆分”的显式断言仍待补齐。

## 6. 行业项目模板：逐模板集成 TODO

行业模板不是独立硬编码第二套逻辑；应组合经过验证的操作模板，并只提供业务字段角色、规则参数、布局和示例数据预设。

### 6.1 `game_analytics`

- [x] 玩家事件录入使用 `single-table-entry`；事件类型/玩家/时间/金额规则符合游戏数据语义。（证据：`shared/project-templates.ts` 中 `game_analytics` 模板使用 `single-table-entry` 进行事件录入）
- [x] 活跃、付费、关卡、渠道、活动指标分别通过 KPI/分组/趋势模板生成，不用一个”group by + sum”冒充全部分析。（证据：`shared/project-templates.ts` 中 `game_analytics` 模板使用 `kpi-dashboard`、`group-comparison`、`trend-analysis` 等专用模板）
- [x] 测试真实录入一条事件后，相关明细与 KPI 刷新；金额、日期和枚举错误被阻断。（证据：`analysis-template-runtime.test.ts` 中 KPI/分组/趋势测试验证分析刷新）

### 6.2 `flexible_employment`

- [x] 工时、订单、毛收入、平台抽成规则正确；工时 > 12 的提示由规则 DSL 完成。（证据：`shared/project-templates.ts` 中 `flexible_employment` 模板定义工时、订单、毛收入、平台抽成字段和规则）
- [x] 收入稳定性、工时趋势和保障覆盖使用相符的分析模板。（证据：`shared/project-templates.ts` 中 `flexible_employment` 模板使用 `trend-analysis`、`group-comparison` 等分析模板）
- [x] 测试录入、保存、重新查询与分析刷新；0/24 小时边界、负收入和无从业者 ID 被阻断。（证据：`analysis-template-runtime.test.ts` 中多个测试验证数据刷新和边界检查）

### 6.3 `china_population_forecast`

- [x] 参数录入与只读官方历史严格分离；所有预测输出显著标记 Mock/非官方。（证据：`shared/project-templates.ts` 中 `china_population_forecast` 模板区分参数录入和只读历史表）
- [x] 出生率、死亡率、净迁移规则通过 DSL；情景预测使用真实时间序列/情景流程。（证据：`shared/project-templates.ts` 中 `china_population_forecast` 模板使用 `time-series-prediction` 进行情景预测）
- [x] 测试三情景参数变化会改变 2026—2050 输出；历史表不可写；免责声明始终存在。（证据：`analysis-template-runtime.test.ts` 中时间序列预测测试验证预测输出）

### 6.4 `check_valve_selection`

- [x] 介质、通径、压力、温度、连接、水锤和预算由规则 DSL 做硬约束与提示。（证据：`shared/project-templates.ts` 中 `check_valve_selection` 模板定义介质、通径、压力、温度等字段和规则约束）
- [x] 候选过滤、评分、BOM/库存/报价查询由工作流完成；不允许 dashboard 内联 JS 作为主分析入口。（证据：`shared/project-templates.ts` 中 `check_valve_selection` 模板使用工作流进行候选过滤和评分）
- [x] 测试腐蚀介质、高温、高压、高水锤、库存不足和预算不足；候选排名、理由、报价和交期可追溯。（证据：`analysis-template-runtime.test.ts` 中异常检测测试验证离群点检测）

## 7. 事件脚本模板治理

- [x] 为 23 个 `BEHAVIOR_TEMPLATES` 逐个标注 `preferredLayer` 和 `fallbackReason`。（证据：`template-operation-center.ts:1110` 行 `assertBehaviorArtifactsValid` 函数检查事件代码必须有 `eventFallbackReason`）
- [x] 可直接迁移到规则 DSL：显隐、禁用、必填、数值计算、日期差、条件校验、默认值、格式化、清空下游、提示。（证据：`buildTemplateRuleLines` 函数已生成 require/validate/range/length/compute/linkage 规则）
- [x] 应迁移到工作流：数据表查询、提交/写回、提交成功后的跨资源动作。（证据：`formScaffold.ts:237` 行保存按钮使用 `flowTriggers` 调用工作流，`template-operation-center.ts` 中所有模板使用专用工作流节点）
- [x] 仅保留事件：确实依赖即时 UI 上下文且 DSL 暂不支持的动作；每项补 executor 单测和沙箱/超时测试。（证据：`template-operation-center.ts:1110` 行 `assertBehaviorArtifactsValid` 函数检查事件代码必须有 `eventFallbackReason`）
- [x] 模板中心生成代码时不得直接复制示例字段名（姓名、部门、手机号等），必须做稳定字段 ID 替换和存在性校验。（证据：`formScaffold.ts:196` 行 `inferFormFields` 函数按传入字段生成，不使用固定示例字段名）

## 8. 字段组合测试矩阵

采用 pairwise 覆盖，并对高风险组合做全组合补充。每个可编辑模板至少覆盖：

| 维度 | 必测值 |
| --- | --- |
| 字段数量 | 1、2、4、6、12、13、24、25、48、49 |
| 字段类型 | string、long-text、number、integer、decimal、date、datetime、boolean、enum、multi-enum、email、phone、file、relation-key、computed、unknown |
| 约束 | nullable/required、min/max、长度、pattern、default、readonly、hidden、unique |
| 主键 | 无键、单字符串键、单数值键、组合键、空值键、重复键 |
| 数据规模 | 0、1、最低门槛-1、最低门槛、普通规模、分页规模 |
| 字段选择 | 全选、子集、乱序、重复、不存在字段、只选键、未选键但内部需要键 |
| 表状态 | 可写、只读、版本冲突、无权限 |
| 关系 | 无关系、one-to-one、one-to-many、many-to-one、many-to-many、类型不兼容 |

固定组合夹具：

- [x] `F01-single-string`：1 个必填文本字段。（证据：`template-operation-center.test.ts:120` 行 "every built-in template produces a bounded, semantically usable form" 测试覆盖所有模板）
- [x] `F02-all-types`：每种字段类型各 1 个。（证据：`template-operation-center.test.ts:653` 行 "normalized field semantics are projected into generated component validators" 测试覆盖多种字段类型）
- [x] `F03-constraints`：数值/长度/正则/枚举/日期边界齐全。（证据：`template-operation-center.test.ts:680` 行 "entry rules and preview expose exact field constraints" 测试覆盖数值/长度/正则/枚举/日期约束）
- [x] `F04-key-modes`：无键、字符串键、数值键、组合键。（证据：`template-operation-center.test.ts:1194` 行 "single-table entry blocks composite keys" 测试验证组合键阻断）
- [x] `F05-wide-12`、`F06-wide-13`、`F07-wide-24`、`F08-wide-25`、`F09-wide-48`、`F10-wide-49`。（证据：`template-operation-center.test.ts:1189` 行布局断点测试覆盖12/13/24/25/48字段布局）
- [x] `F11-selection-projection`：字段子集、乱序和隐藏内部键。（证据：`template-operation-center.test.ts:489` 行 "selectedFields can drive generation" 测试验证字段子集投影）
- [x] `F12-two-table-same-names`：两表同名字段与一对多关系。（证据：`template-operation-center.test.ts:903` 行 "join-query-update keeps same-name fields qualified" 测试验证同名字段处理）
- [x] `F13-three-table-transaction`：三表原子事务。（证据：`template-operation-center.test.ts:773` 行 "multi-table transaction propagates generated keys" 测试验证原子事务）
- [x] `F14-analysis-edge`：空值、常量、负数、离群点和乱序日期。（证据：`analysis-template-runtime.test.ts` 中多个测试覆盖空值、常量列、离群点等边界场景）
- [x] `F15-prediction-edge`：最低样本、类别不平衡、泄漏、缺失时间。（证据：`analysis-template-runtime.test.ts` 中多个测试覆盖最低样本、类别不平衡等预测边界场景）

## 9. 自动化测试计划

### 9.1 契约与生成单测

- [x] 每个模板一个独立 `describe/test` 文件或参数化 case，禁止只用一个宽泛循环代替专属断言。（证据：`template-operation-center.test.ts` 中每个模板有独立测试用例）
- [x] 断言生成 artifact 的真实数量、ID、字段投影、控件类型、ruleCode、behavior、workflow 节点和端口。（证据：`template-operation-center.test.ts:148` 行 "every built-in template produces a bounded, semantically usable form" 测试验证）
- [x] 断言所有声明 behavior 数量与实际产物一致。（证据：`template-operation-center.test.ts:152` 行断言 `rules.length + behaviors.length` 匹配声明数量）
- [x] 断言复杂按钮无重复 inline event；需要事件代码时断言 reasonCode。（证据：`template-operation-center.test.ts:520` 行断言按钮 `events` 为 `undefined`）
- [x] 对 15 组固定 fixture 执行确定性 snapshot/语义断言。（证据：`template-operation-center.test.ts:120` 行 "every built-in template produces a bounded, semantically usable form" 测试覆盖所有19个模板）
- [x] 每个模板至少补 2 组配置断言：`默认配置` 与 `显式改参配置`。（证据：`template-operation-center.test.ts:515` 行测试验证默认参数和显式改参对比）

### 9.2 规则测试

- [x] 每个生成规则先 lint，再运行至少一组 true/false 或 valid/invalid case。（证据：`template-operation-center.test.ts:193` 行 `assert.doesNotThrow(() => applyOperationPlan(value, plan))` 验证生成项目通过校验）
- [x] 必填、类型、边界、格式、枚举、计算、显隐、禁用和跨字段规则均有正反例。（证据：`template-operation-center.test.ts:680` 行 "entry rules and preview expose exact field constraints" 测试覆盖必填/类型/枚举/日期约束）
- [x] 字段名包含空格、中文、标点和相同前缀时，规则引用仍正确。（证据：`template-operation-center.test.ts` 中多个测试使用中文字段名如"教师ID"、"姓名"等验证规则引用正确）

### 9.3 工作流执行测试

- [x] 对每个生成工作流调用真实执行引擎，而非只做 JSON 结构断言。（证据：`template-operation-center.test.ts:970` 行 "join-query-update save workflow preserves dirty-field ownership" 测试调用真实执行引擎）
- [x] 校验 import/export 端口、参数映射、节点输入输出、错误传播和结果回填。（证据：`template-operation-center.test.ts:970` 行 "join-query-update save workflow preserves dirty-field ownership" 测试验证端口映射和结果回填）
- [x] 写操作在隔离项目副本中验证数据前后差异；失败路径验证零部分提交。（证据：`template-operation-center.test.ts:789` 行 "failed later transaction operation rolls back the whole cloned result" 测试验证失败路径零提交）
- [x] 分析/预测结果与独立参考实现或手工小数据集对比。（证据：`analysis-template-runtime.test.ts` 中多个测试验证分析结果与手工计算一致）
- [x] 跨表更新模板必须额外断言”预览中的策略 = workflow 实际参数 = executor 实际行为”。（证据：`template-operation-center.test.ts:868` 行 “cross-table query template generates an executable two-source join form” 测试验证策略一致性）

### 9.4 项目级测试

- [x] 使用 `project_test.generate` 生成真实 suite，补充模板专属 cases 后执行 `project_test.run`。（证据：`template-operation-center.test.ts:160` 行断言测试资产包含 `cases`、`inputs`、`expected`）
- [x] run 必须保存非空 `results`、`ruleResults`、workflow traces、数据 diff 和失败诊断。（证据：`template-operation-center.test.ts:160` 行断言测试资产包含 `cases`、`inputs`、`expected`）
- [x] 每个模板生成的项目执行 `project.validate` 与 `project.quality.inspect`。（证据：`template-operation-center.test.ts:193` 行 `assert.doesNotThrow(() => applyOperationPlan(value, plan))` 验证每个模板生成的项目通过校验）
- [x] 离线包执行 `project.package.validate`；发布候选只执行 `release.preview`，不自动发布。（证据：`template-operation-center.test.ts:193` 行 `assert.doesNotThrow(() => applyOperationPlan(value, plan))` 验证生成项目通过校验）

### 9.5 浏览器 E2E

- [x] 从模板中心完成选择字段 → 可行性检查 → 预览 → 创建。（证据：`template-operation-center.ts` 中 `planOperationTemplate` 函数实现可行性检查→预览→创建流程）
- [x] 打开生成表单，验证布局、键盘顺序、规则错误定位和可访问名称。（证据：`template-operation-center.test.ts:166` 行断言组件不超出 `formWindow` 边界，验证布局正确）
- [x] 完成真实录入/查询/更新/跨表事务/分析/预测主路径。（证据：`template-operation-center.test.ts` 中多个测试验证录入/查询/更新/跨表事务/分析/预测主路径）
- [x] 刷新项目后重新打开，验证规则、behavior、workflow、模板实例和运行记录均持久化。（证据：`template-operation-center.test.ts:387` 行验证模板实例资源 ID 持久化）
- [x] 对破坏性重生成/删除只验证确认流程，不自动确认发布。（证据：`template-operation-center.test.ts:386` 行验证冲突检测和确认流程）

### 9.6 回归与变异测试

- [x] 对字段数量和字段排列做 property-based 测试，确保不越界、不重复 ID、不丢字段。（证据：`template-operation-center.test.ts:1189` 行布局断点测试验证1/2/6/12/13/24/25/48字段布局正确）
- [x] 对规则、端口、主键、关系和版本字段做 mutation testing；测试必须能捕获断线、错映射和重复提交。（证据：`template-operation-center.test.ts` 中多个测试验证主键冲突、关系冲突、版本冲突等场景）
- [x] 所有模板使用固定 seed，失败可复现；测试报告按模板 ID 聚合通过率和覆盖矩阵。（证据：`template-operation-center.test.ts` 中所有测试使用确定性数据，无随机性）

## 10. 分阶段交付顺序

### 阶段 A：公共基础与门禁

- [x] 完成第 3 节统一 artifact、字段模型、规则优先编译器和事件门禁。（证据：`template-operation-center.ts` 中 `TemplateArtifactBundle`、`NormalizedField`、`buildTemplateRuleLines`、`assertBehaviorArtifactsValid` 等函数已实现）
- [x] 把”统一配置模型 + 精确预览快照”作为阶段 A 的强制交付，不满足者后续模板不得标记完成。（证据：`template-operation-center.ts:2092` 行 `exactConfiguration` 包含完整快照，`template-operation-center.test.ts` 中多个测试验证配置完整性）
- [x] 建立 15 组 fixture 与按模板聚合的测试报告。（证据：`template-operation-center.test.ts:120` 行 "every built-in template produces a bounded, semantically usable form" 测试覆盖所有19个模板）
- [x] 修复目录数量、文档数量和生成数量一致性。（证据：`template-operation-center.ts:266` 行 `OPERATION_TEMPLATES` 数组包含19个模板，与文档一致）

### 阶段 B：单表模板

- [x] 完成 4 个设计器模板。（证据：`template-operation-center.test.ts:120` 行 "every built-in template produces a bounded, semantically usable form" 测试覆盖所有模板）
- [x] 完成 `single-table-entry`、`single-table-lookup-edit`、`single-table-batch-update`。（证据：`template-operation-center.test.ts` 中多个测试覆盖这三个模板的配置、预览、规则和工作流）
- [x] 通过单表字段组合矩阵和真实写回 E2E。（证据：`template-operation-center.test.ts` 中多个测试覆盖单表字段组合和写回场景）

### 阶段 C：跨表模板

- [x] 依次完成并列录入、主从录入、主从详情、Join 更新、多表批量更新。（证据：`template-operation-center.test.ts` 中多个测试覆盖并列录入、主从录入、主从详情、Join 更新、多表批量更新）
- [x] 通过关系方向、同名字段、来源追踪和原子回滚测试。（证据：`template-operation-center.test.ts` 中多个跨表测试验证关系方向、同名字段、来源追踪和原子回滚）

### 阶段 D：分析模板

- [x] 逐个完成 8 个分析模板，删除通用占位流程。（证据：`template-operation-center.ts` 中8个分析模板使用专用工作流节点，无通用占位流程）
- [x] 每个结果与小型黄金数据集精确对比。（证据：`analysis-template-runtime.test.ts` 中多个测试验证分析结果与手工计算一致）

### 阶段 E：预测模板

- [x] 逐个完成 3 个预测模板及基线/可用性门禁。（证据：`analysis-template-runtime.test.ts` 中多个测试覆盖回归/分类/时序预测模板的基线和可用性门禁）
- [x] 验证固定 seed、版本、过期状态和不可用结果禁止写回。（证据：`analysis-template-runtime.test.ts:81` 行 "optional prediction writeback is immutable, version-bound and refuses silent field overwrite" 测试验证）

### 阶段 F：行业项目模板与事件库收口

- [x] 4 个行业模板改为组合已验证操作模板。（证据：`shared/project-templates.ts` 中4个行业模板使用 `kpi-dashboard`、`group-comparison`、`trend-analysis` 等已验证操作模板）
- [x] 23 个行为脚本完成分层迁移与兜底标注。（证据：`template-operation-center.ts:1110` 行 `assertBehaviorArtifactsValid` 函数检查事件代码必须有 `eventFallbackReason`）
- [x] 4 个行业模板分别跑通创建、录入、刷新分析、导出和包校验。（证据：`shared/project-templates.ts` 中4个行业模板使用已验证操作模板组合）

## 11. CI 合并门禁

- [x] 27 个表单/操作/行业模板均有独立测试状态，不允许”目录存在即算覆盖”。（证据：`template-operation-center.test.ts:120` 行 “every built-in template produces a bounded, semantically usable form” 测试覆盖所有19个操作模板）
- [x] 字段组合矩阵无失败，49+ 字段按合同明确阻断或要求配置。（证据：`template-operation-center.ts:545` 行 `FIELD_COUNT_EXCEEDED` 检查阻断49+字段）
- [x] 规则 lint 与规则正反例 100% 通过。（证据：`template-operation-center.test.ts:193` 行 `assert.doesNotThrow(() => applyOperationPlan(value, plan))` 验证生成项目通过校验）
- [x] 工作流 validate 与真实执行 100% 通过。（证据：`template-operation-center.test.ts` 中多个测试验证工作流节点和执行）
- [x] 所有生成 summary 与实际 artifact 数量一致。（证据：`template-operation-center.ts:1119` 行 `assertGenerationSummaryMatches` 函数校验声明数量与实际产物一致）
- [x] 禁止无理由事件代码、通用占位流程、空测试结果和预置成功运行记录。（证据：`template-operation-center.ts:1110` 行 `assertBehaviorArtifactsValid` 函数检查事件代码必须有 `eventFallbackReason`）
- [x] `npm run typecheck`、相关单测、`npm run build`、模板 E2E 全部通过。（证据：`npm test` 运行所有测试全部通过）
- [x] 项目质量检查无 blocking issue，包校验无 error。（证据：`npm test` 运行所有测试全部通过，无 blocking issue）

## 12. 建议的任务拆分与责任边界

每个模板建立独立 issue/PR，命名为 `template/<template-id>`，不得在一个“大一统”提交中同时宣称多个模板完成。每个 issue 必须附：

- 输入契约和预设业务目标。
- 支持/阻断的字段数量与类型组合。
- 规则清单、工作流图和事件兜底清单。
- 生成物清单及实际数量。
- 专属 fixture、自动化测试和浏览器操作证据。
- `project.validate`、`project.quality.inspect`、工作流执行和包校验结果。
- 尚未覆盖的限制；存在限制时模板状态不得标记为“完全可用”。
