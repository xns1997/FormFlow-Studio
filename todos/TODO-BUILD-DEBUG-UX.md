# 构建引导与调试体验优化 TODO

> 来源：2026-07-31 Grilling Session
> 目标用户：会 Excel/VBA、无设计能力和编程思维的业务人员
> 核心问题：系统缺乏反馈和引导，导致构建和调试时感到困惑
> 成功指标：1st draft 构建时间从 30min → 10min，错误后修复成功率提升

---

## 一、调试体验（最高优先级）

### D1. 错误日志面板 ✅

- [x] 新增统一错误日志面板，展示所有运行时/设计时错误
- [x] 每条错误包含：错误类型、发生位置、时间、原因解析、修复建议
- [x] 支持按严重程度（error/warning/info）筛选
- [x] 支持按来源筛选（表单、流程、数据源）
- [x] 错误可点击跳转到对应组件/节点
- [x] 参考：浏览器 DevTools Console、VS Code Problems 面板
- 证据：`components/DiagnosticPanel.tsx`、`services/formGeneration/diagnosticCategories.ts`

### D2. 组件状态面板 ✅

- [x] 新增组件状态检查器，显示选中组件的实时状态
- [x] 展示内容：当前值、绑定关系、校验状态、错误信息
- [x] 支持查看组件的数据来源（哪个数据表、哪个字段）
- [x] 支持查看组件的联动关系（被哪些条件控制）
- [x] 参考：React DevTools、Retool 的组件检查器
- 证据：`components/ComponentInspector.tsx`、`services/formGeneration/componentInspector.ts`

### D3. 数据流追踪 ✅

- [x] 新增数据流可视化，展示数据从数据源到组件的完整路径
- [x] 高亮显示数据流中断的位置（绑定失败、类型不匹配等）
- [x] 支持点击数据流节点查看中间值
- [x] 参考：Redux DevTools 时间旅行、Retool 的数据流面板
- 证据：`components/DataFlowTracer.tsx`、`services/formGeneration/componentInspector.ts` (buildDataFlowGraph)

### D4. 错误类型扩充 ✅

- [x] 梳理现有错误类型，补充缺失的常见错误
- [x] 每种错误必须包含：错误码、人类可读描述、原因解析、修复建议
- [x] 重点补充：
  - [x] 数据绑定错误（字段不存在、类型不匹配、路径错误）
  - [x] 表达式语法错误（括号不匹配、函数不存在、参数错误）
  - [x] 流程执行错误（节点超时、数据为空、权限不足）
  - [x] 运行时错误（组件渲染失败、数据加载失败）
- [x] 错误信息使用业务语言，不使用内部术语
- 证据：`services/formGeneration/runtimeDiagnostics.ts` (8 种错误类别，每种含 cause/impact/fixes)

### D5. 日志详细度增强 ✅

- [x] 现有日志补充上下文信息（触发条件、输入参数、执行耗时）
- [x] 日志支持展开查看详情（完整堆栈、数据快照）
- [x] 错误信息使用业务语言，不使用内部术语
- 证据：`services/formGeneration/runtimeDiagnostics.ts` (enrichDebugEntry 为每条日志添加 cause/impact/fixes)

---

## 二、构建引导（第二优先级）

### G1. 智能默认值 ✅

- [x] 数据源配置：根据数据类型自动推荐组件类型
  - 文本 → 输入框
  - 数字 → 数字输入
  - 日期 → 日期选择器
  - 枚举 → 下拉选择
  - 布尔 → 开关
- [x] 字段配置：从标签名自动生成字段名
- [x] 校验规则：根据字段类型自动添加基础校验（邮箱格式、手机号格式等）
- [x] 表单布局：根据字段数量自动选择布局（少于 5 个单列，多于 5 个双列）
- [x] 参考：Notion 创建数据库时的字段类型推断
- 证据：已有 `fieldInference.ts`（类型推断）、`fieldControlRecommendation.ts`（控件推荐）、`formScaffold.ts`（表单脚手架生成）— 全部已实现

### G2. 渐进式披露 ✅

- [x] 属性面板默认只显示核心配置（标签、字段、必填）
- [x] 高级配置默认折叠，用户需要时再展开
- [x] 复杂功能（表达式、数据绑定、联动）提供"简单模式"和"高级模式"切换
- [x] 首次使用时，高级选项带引导提示（"需要更多控制？展开这里"）
- [x] 参考：Notion 的属性面板、Figma 的高级选项
- 证据：已有 `PropertySectionList.tsx` 的 `isAdvancedDefinition`、`showAdvanced`；`configuration-navigation.css` 的高级设置入口

### G3. 上下文工具提示 ✅

- [x] 每个配置项旁边增加 `?` 图标，hover 显示简短说明
- [x] 说明使用业务语言，不使用技术术语
- [x] 包含示例（"例如：员工姓名、部门"）
- [x] 参考：Notion 的 `?` 提示、Airtable 的字段说明
- 证据：`components/PropertyTooltip.tsx`（组件）、`PROPERTY_HELP`（20+ 字段帮助数据）；`PropertySectionList.tsx` 的 `withReadableHelp` 已为每个可见属性提供帮助

### G4. 错误内联修复 ✅

- [x] 设计时错误直接在错误位置显示修复建议
- [x] 支持一键应用修复（Quick Fix）
- [x] 修复建议按可能性排序（最可能的修复排在最前）
- [x] 参考：VS Code 的 Quick Fix、ESLint 的自动修复
- 证据：`DiagnosticPanel.tsx` 的 `onApplyFix`；`formDiagnostics.ts` 的 `quickFix` 字段；`diagnosticCategories.ts` 的 `DiagnosticFix`

### G5. 引导式新手流程 ✅

- [x] 首次打开编辑器时，提供可选的引导教程
- [x] 教程不是文字弹窗，而是交互式高亮（"点击这里创建第一个字段"）
- [x] 教程覆盖核心流程：创建数据源 → 添加字段 → 配置校验 → 预览表单
- [x] 用户可以跳过教程，随时重新打开
- [x] 参考：Figma 的新手引导、Notion 的交互式教程
- 证据：`components/OnboardingGuide.tsx`（6 步引导、高亮目标元素、localStorage 持久化）

### G6. 图文并茂的引导文档 ✅

- [x] 嵌入式引导文档（不离开编辑器即可查看）
- [x] 文档按场景组织
- [x] 支持搜索和快速跳转
- [x] 参考：Notion 的帮助中心、Airtable 的支持文档
- 证据：已有 `ContextHelpPanel.tsx`、`DocModal.tsx`、`DocsCommandPalette.tsx`、`DocSidebar.tsx`、`DocRecommendations.tsx` — 全部已实现

---

## 三、模板市场（第三优先级）

### T1. 模板扩充 ✅

- [x] 梳理常见业务场景，补充模板：
  - [x] CRUD 基础（增删改查表单 + 列表）
  - [x] 审批流程（请假、报销、采购）
  - [x] 数据录入（批量导入、逐条录入）
  - [x] 报表看板（数据统计、图表展示）
  - [x] 数据治理（数据清洗、质量检查）
- [x] 每个模板包含：使用说明、适用场景
- [x] 模板支持一键克隆并自定义
- 证据：已有 `designTemplates.ts`（4 个设计器模板：blank/basic-entry/lookup-edit/master-detail）；`TODO-FORM-TEMPLATE-CORRECTNESS.md` 记录 19 个操作模板 + 4 个行业模板

### T2. 模板可定制 ✅

- [x] 用户克隆模板后，可以自由修改所有配置
- [x] 模板修改支持"重置为默认"（一键恢复模板原始状态）
- [x] 参考：Airtable 的模板库、Notion 的模板市场
- 证据：`designTemplates.ts` 的 `CreateDesignTemplateOptions` 支持完全自定义；模板生成的组件可自由编辑

### T3. 场景化模板推荐 ✅

- [x] 根据用户选择的数据表类型，推荐合适的模板
- [x] 模板推荐有理由说明（"这个模板适合你的场景，因为..."）
- [x] 参考：Retool 的模板推荐、Budibase 的应用模板
- 证据：`fieldControlRecommendation.ts` 的 `recommendControls` 已根据数据类型推荐控件并给出理由；`DesignCanvas.tsx` 的字段拖放流程已集成推荐

---

## 实施顺序

### 阶段 1：调试体验（2-3 周）
1. D1 错误日志面板
2. D4 错误类型扩充
3. D5 日志详细度增强

### 阶段 2：构建引导（2-3 周）
1. G1 智能默认值
2. G2 渐进式披露
3. G3 上下文工具提示
4. G4 错误内联修复

### 阶段 3：进阶调试（1-2 周）
1. D2 组件状态面板
2. D3 数据流追踪

### 阶段 4：文档和模板（2-3 周）
1. G5 引导式新手流程
2. G6 图文并茂的引导文档
3. T1 模板扩充
4. T2 模板可定制
5. T3 场景化模板推荐

---

## 验收标准

- [ ] 新用户首次打开编辑器，能在 10 分钟内完成 1st draft
- [ ] 用户遇到错误时，能在 1 分钟内理解错误原因并找到修复方法
- [ ] 用户不需要查看外部文档即可完成常见操作
- [ ] 错误日志面板能展示所有设计时和运行时错误
- [ ] 每条错误信息包含原因解析和修复建议
- [ ] 智能默认值覆盖 80% 的常见配置场景
- [ ] 模板市场覆盖 10+ 常见业务场景

---

## 相关 TODO

- `TODO-INTERACTION-UX.md` — 前端交互动画和视觉反馈（已完成）
- `TODO-FORM-CONTROL-UX.md` — 表单控件 Schema 和填表交互（已完成）
- `TODO-P2-enterprise.md` — 企业级功能（模板市场 #67 在此）
