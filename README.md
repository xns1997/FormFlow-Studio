# FormFlow Studio v0.8.0

**Excel 表单编排框架** —— 可视化流程编排 + 表单设计器 + 数据预览 + 使用模式 + 行为定义

> 将 Excel 数据表转化为可交互的表单应用，通过拖拽式节点编排数据处理流程，无需编写后端代码。

---

## 功能概览

### 数据预览
- 上传 Excel / CSV / JSON，自动识别表头、字段类型、数据概览
- AG Grid 高性能表格展示，支持分页、排序、筛选
- 字段类型推断（string / number / date / boolean / enum）
- 数据统计描述（Describe 报告）
- 「发送到表单」一键将数据行推送到测试页

### 流程编排
- 拖拽式节点画布，支持 Ctrl+拖拽多选、右键菜单、快捷键
- **147 节点** 全部可执行（无 stub）：
  - **Generic (48)**: 输入输出、筛选排序、分组聚合、数据清洗、缺失值处理、类型转换、正则提取、编码解码、校验、条件分支、遍历、调用流程
  - **Behavior (32)**: 表单事件触发、条件分支、赋值、计算、校验、提交、JS 脚本、循环、数据查询、批量赋值、列表查询、自动编号、表单回填、必填校验、表单重置
  - **Func (23)**: 样式、图表（SVG）、工作表操作、表单控件、查找替换、去重、合并单元格
  - **ML (18)**: 归一化、标准化、PCA、K-Means、KNN、决策树、随机森林、朴素贝叶斯、SVM、异常检测、线性回归、相关性分析
  - **Scenario (5)**: Excel→JSON、JSON→XLSX 导出、追加行、预览、地址工具
- 27 种端口类型 + 类型校验器
- 节点间真实数据传递（topological sort + 依赖执行）
- **执行选项**：`onNodeFailure`(失败策略)、`timeoutMs`/`nodeTimeoutMs`(超时)、`parallel`(并行)、`isolatedScopes`(作用域隔离)、`debug`(调试快照)、`transactionalSideEffects`(事务性侧效果)
- 拼音搜索、收藏、最近使用、节点悬浮详情卡
- **Name Box** 输入地址跳转、**Formula Bar** 显示单元格内容
- 超 Z 列号支持（AA, AB, ... ZZ+）

### Range Selector（Excel 级选区）
- 拖拽选区 + 方向键导航 + Shift 扩展
- 行号 / 列号点击选整行 / 整列
- Ctrl+拖拽多区域选择
- 绿色选区边框 + 拖拽角手柄
- 右键菜单（选整行、选整列、复制地址）
- 列宽拖拽调整 + 双击自适应
- Name Box 输入地址跳转（如 `B3`、`D5:H10`）
- Formula Bar 显示当前单元格内容

### 表单设计器
- 所见即所得画布（基于 @antv/x6）
- 14 种控件：文本输入、多行文本、数字、下拉、单选、多选、日期、开关、评分、按钮、文本标签、图片、表格、容器、选项卡
- **预览模式**：控件不可拖拽但可交互（输入、选择、点击）
- 控件属性面板（分组折叠、校验规则、样式配置）
- 事件编辑器（Monaco 代码编辑器 + 智能提示）
- 流程触发器配置（控件事件 → 运行流程）
- 数据源绑定（RangeRef → 单元格 / 区域）

### 行为引擎
- Trigger / Condition / Action / SideEffect 四元组
- **24 种事件**：formLoad, formReady, formReset, rowLoad, rowSelect, rowAdd, rowDelete, fieldChange, fieldBlur, fieldFocus, fieldKeyDown, fieldPaste, fieldClear, valueChange, buttonClick, beforeSubmit, submit, submitSuccess, submitError, validate, dataImport, dataExport, dataSourceChange, tabChange
- **17 种动作**：setValue, clearValue, setVisible, setHidden, setEnabled, setDisabled, setRequired, setOptional, showMessage, logMessage, switchTab, executeScript, submitData, **callApi**(增强版), refreshData, navigate, **runWorkflow**
- **callApi 增强**：POST body、Bearer/API Key 认证、响应回写、可配置超时和重试
- **runWorkflow 动作**：在行为中调用流程，流程输出自动回写表单
- **条件求值扩展**：支持 `dataSource` 指定数据来源（form/flow/behavior），可访问流程输出和其他行为结果
- 脚本沙箱（getValue / setValue / formData / setField / showMessage / querySheet / submit）
- 事件名自动映射（onFieldChange → fieldChange）
- 行为日志实时追踪
- **可视化规则构建器**：触发器/条件/动作 UI，与代码双向同步，自然语言预览
- **行为模板库**：14 个预置模板（联动/计算/校验/查询/提交/UI），一键插入
- **行为测试面板**：模拟数据输入、运行测试、执行日志展示
- **行为导入导出**：JSON 格式导入/导出/下载
- 行为文档中心（全局 `/docs`，支持从项目工作区和项目设置回跳）+ 行为页右侧快速 Reference

### 使用模式
- 独立页面（`/projects/:id/usage`），只能操作数据和填写表单，不能编辑表单结构/流程/行为
- **数据预览**：AG Grid 表格，支持新增/删除/编辑行，保存到后端 `.formflow` 包
- **表单预览**：侧边栏表单列表，点击打开大弹窗，内嵌设计器 PreviewCanvas（空间布局、控件可交互）
- **表单→工作表同步**：表单字段变更时自动写回对应工作表（通过 `tableBinding` 定位，500ms 防抖）
- 项目列表每个卡片下方有「使用模式」快捷入口

### Monaco 编辑器
- 自定义浅色主题 `formflow-light`（语法高亮 + Suggest Widget 完整配色）
- 对象 / 数组类型输入自动使用 Monaco
- 输出预览 Modal 的原始数据视图使用 Monaco
- 智能提示（ctx. 上下文 API、JSON 字段名）
- 全屏编辑 + 折叠 + 行号

### 离线兼容
- 所有 store save 调用静默失败（服务器离线不阻塞）
- 项目导入支持本地 JSON 文件
- initProject 不覆盖已导入的项目数据

---

## 智能体项目生成与编辑

仓库内置了一个面向 Codex 的 FormFlow v2 skill：[`formflow-project-editor`](./.codex/skills/formflow-project-editor/)。它把“紧凑 YAML 意图”转换成规范化的 `.formflow` 目录和 ZIP，适合让智能体创建项目、编辑现有项目、做引用校验和打包，而不必重复输出整套项目 JSON。

核心能力：

- `inspect`：读取目录或 ZIP，输出项目摘要、数据表、表单、行为、流程和引用关系
- `create`：根据 YAML 创建规范化 FormFlow v2 项目，并可同时输出 ZIP
- `normalize`：把现有项目映射到冻结的 v2 结构后，再按稳定 ID 应用增删改
- `validate`：检查 schema、ID、索引、引用、数据 key、流程端口和交付门禁
- `pack` / `unpack`：确定性打包和解包，保证重复执行结果稳定

示例 skill 位于 [`./.codex/skills/formflow-project-editor/`](./.codex/skills/formflow-project-editor/)，示例项目规格位于 [`./projects/skill-demo/sales-approval.yaml`](./projects/skill-demo/sales-approval.yaml)。

常用命令：

```bash
# 根据紧凑 YAML 生成项目目录和 ZIP
node .codex/skills/formflow-project-editor/scripts/formflow-project.mjs \
  create projects/skill-demo/sales-approval.yaml \
  --out projects/skill-demo/skill_demo_sales_approval.formflow

# 校验生成结果（支持目录或 ZIP）
node .codex/skills/formflow-project-editor/scripts/formflow-project.mjs \
  validate projects/skill-demo/skill_demo_sales_approval.formflow.zip \
  --json

# 查看现有项目摘要，便于让智能体先读结构再编辑
node .codex/skills/formflow-project-editor/scripts/formflow-project.mjs \
  inspect projects/skill-demo/skill_demo_sales_approval.formflow.zip
```

这一版冻结支持 FormFlow v2，并且对未知字段采取“停止并报告”的策略，不会静默删除扩展字段。相关格式、默认值和规范化规则见：

- [`authoring-spec.md`](./.codex/skills/formflow-project-editor/references/authoring-spec.md)
- [`formflow-v2-format.md`](./.codex/skills/formflow-project-editor/references/formflow-v2-format.md)
- [`validation-rules.md`](./.codex/skills/formflow-project-editor/references/validation-rules.md)

---

## 快速开始

macOS / Linux：

```bash
# 统一初始化 Node、pnpm、Python venv 和依赖
bash scripts/init-env.sh

# 启动开发服务器 (前端 + 后端)
pnpm dev:all

# 或分别启动
pnpm dev        # 前端 (Vite, port 5173)
pnpm server     # 后端 (Express, port 3001)

# 构建
pnpm build

# 类型检查
pnpm typecheck

# 测试
pnpm test

# 端到端测试
pnpm test:e2e
```

Windows PowerShell：

```powershell
# 统一初始化 Node、pnpm、Python venv 和依赖
powershell -ExecutionPolicy Bypass -File scripts/init-env.ps1

# 启动开发服务器 (前端 + 后端)
pnpm dev:all
```

说明：
- 初始化脚本会输出非常详细的阶段日志，并自动创建或复用仓库根目录下的 `venv/`
- 如果缺少 Node.js 或 Python，脚本不会自动安装；会先检查 macOS 上的 Homebrew 可用版本，然后给出官方下载地址
- 旧命令 `bash python-service/setup.sh` 仍可用，但现在只是转发到新的仓库级初始化脚本

## 5 分钟快速上手

### 第一步：创建项目
1. 启动开发服务器：`pnpm dev:all`
2. 打开浏览器访问 `http://localhost:5173`
3. 点击首页「新建项目」，输入项目名称和描述

### 第二步：导入数据
1. 进入项目后，切换到「数据预览」标签页
2. 点击「上传文件」，选择 Excel/CSV/JSON 文件
3. 系统会自动解析表结构、列类型和数据样本

### 第三步：设计表单
1. 切换到「表单设计」标签页
2. 从左侧工具箱拖拽控件到画布
3. 通过右侧属性面板配置控件：
   - 设置字段名（name）用于数据绑定
   - 配置校验规则（required、validator）
   - 设置样式（fontSize、color）

### 第四步：添加行为
1. 切换到「行为定义」标签页
2. 选择要添加行为的事件（如 onFormLoad、onFieldChange）
3. 编写脚本实现业务逻辑：
   ```javascript
   // 示例：字段变更时联动
   if (field === '部门') {
     await setVisible('技术栈', value === '技术部');
   }
   ```

### 第五步：测试运行
1. 切换到「测试运行」标签页
2. 预览表单效果并测试行为逻辑
3. 支持实时查看脚本日志和数据变化

## 典型使用场景

### 场景一：员工信息录入
- **数据表**：员工信息表（工号、姓名、部门、职位、薪资）
- **表单**：文本输入（姓名）、数字输入（工号）、下拉选择（部门）
- **行为**：自动生成工号、部门联动、提交前校验
- **流程**：查询员工、新增员工、更新员工

### 场景二：服务工单管理
- **数据表**：服务工单表（工单号、客户、问题类型、状态、处理人）
- **表单**：工单录入、工单查询、工单处理
- **行为**：状态流转、自动分配、超时提醒
- **流程**：创建工单、查询工单、更新工单

### 场景三：数据统计分析
- **数据表**：销售数据表（日期、产品、数量、金额）
- **表单**：数据录入、统计查询、图表展示
- **行为**：数据校验、自动计算、图表更新
- **流程**：数据导入、统计分析、导出报表

## 常见问题

### Q: 如何实现字段联动？
A: 在「行为定义」标签页，为字段的 onFieldChange 事件编写脚本。例如：
```javascript
if (field === '部门') {
  await setVisible('技术栈', value === '技术部');
}
```

### Q: 如何在提交前校验数据？
A: 使用 onSubmit 或 onBeforeSubmit 事件。推荐使用 requireFields 批量校验：
```javascript
const check = await ctx.requireFields(['姓名', '手机号']);
if (!check.valid) {
  showMessage('请填写必填项', 'error');
  return;
}
```

### Q: 如何实现级联选择？
A: 为父级字段的 onFieldChange 事件编写脚本，动态设置子级字段的选项：
```javascript
const cityOptions = {
  '广东': ['广州', '深圳'],
  '浙江': ['杭州', '宁波']
};
const options = cityOptions[value] || [];
await setValue('城市', options[0] || '');
```

### Q: 如何调用流程？
A: 在按钮的 onClick 事件中使用 runConfiguredWorkflow()。流程需要先在「流程编排」标签页设计好，并绑定到按钮事件。

### Q: 如何导出数据？
A: 使用流程中的「数据导出」节点，支持导出为 Excel、CSV、JSON 格式。也可以在使用模式中直接导出当前数据。

## 示例项目

| 项目 | 说明 | 数据表 | 表单 | 流程 |
|------|------|--------|------|------|
| `example_support_ops` | 服务工单闭环 | 服务工单 + 问题字典 | 新建工单 + 查询处理 | 查询/创建/更新 |
| `example_employee_mgmt` | 员工在职信息 | 员工信息 | 数据录入 + 数据修改 + 统计分析 | 新增/更新/统计/批量/预测 |
| `example_student_info` | 学生信息 | 学生信息 | 数据录入 + 数据修改 + 统计分析 | 新增/更新/统计/批量/预测 |
| `example_check_valve_selection` | 止回阀选型 | 止回阀选型 | 数据录入 + 数据修改 + 统计分析 | 新增/更新/统计/批量/预测 |
| `example_valve_selection_v2` | 阀门二代选型 | 客户需求 + 阀门主数据 + 附件主数据 + 兼容规则 | 客户需求录入 + 候选方案分析 + 需求记录维护 | 保存需求/查询/零代码选型推荐 |
| `example_valve_selection_v3` | 阀门三代选型 | 需求受理 + 技术画像 + 阀门主数据 + 选项附件 + 案例库 + 审计日志 | 需求受理台 + 快速推荐台 + 技术澄清台 + 方案决策台 + 案例复盘台 | 受理/快速推荐/标准化/筛选/评分/提案/确认/归档 |
| `example_renewable_generation` | 新能源发电量 | 新能源发电量 | 数据录入 + 数据修改 + 统计分析 | 新增/更新/统计/批量/预测 |
| `example_shanghai_catering` | 上海餐饮企业分析 | 餐饮月度数据 + 预测数据 + 年度汇总 | 数据录入 + 数据修改 + 统计分析 + 预测分析 + 年度汇总 | 录入/修改/统计/预测 |

所有示例项目均位于 `projects/data/<id>.formflow/`，可直接在项目列表中打开。运行 `pnpm generate:support-example` 或 `npx tsx scripts/generate_industry_examples.ts` 可重新生成。

`example_valve_selection_v2` 使用高阶推荐节点把“多条件筛选 + 候选选取 + 批量回填”收敛为更短的选型流程，适合作为推荐类项目的参考样板。

`example_valve_selection_v3` 则按业务阶段重构为“受理 → 技术画像 → 候选生成 → 评分排序 → 提案确认 → 案例归档”的多流程样板，并额外提供一张“快速推荐台”来承接二代同款的一页式推荐体验。

---

## 文档系统

### 全局文档中心
- 首页：`/docs` — 分区导航（梗概/行为/表单设计/流程节点/后端）
- 导航栏「文档」按钮打开全局文档弹窗
- 支持跨分区搜索和标签过滤

### 文档分区
| 分区 | 路径 | 内容 |
|------|------|------|
| 梗概 | `/docs/overview` | 产品介绍、快速入门、项目结构 |
| 行为 | `/docs/behavior` | 31 个事件文档 + 3 个主题文档 |
| 表单设计 | `/docs/form-design` | 26 种控件的属性和用法 |
| 流程节点 | `/docs/flow-nodes` | 8 个分组的节点说明 |
| 后端 | `/docs/backend` | 9 个 API 模块文档 |

### 行为文档详情
- 仓库手册：`docs/behavior-event-reference.md`
- 项目流程规范：`docs/project-creation-spec.md`
- 项目工作区：访问 `/projects/:id/workspace/:tab`
- 项目设置页：访问 `/projects/:id/settings/:section`
- 行为页右侧的 `Reference` 面板提供当前事件的快速摘要，并支持跳转到完整文档页

### 行为模板库

| 类别 | 模板 | 说明 |
|------|------|------|
| 联动 | 字段显隐联动 | 当某个字段值变化时，显示或隐藏另一个字段 |
| 联动 | 下拉选项联动 | 根据父级选择动态设置子级选项 |
| 联动 | 条件禁用字段 | 满足条件时禁用某些字段 |
| 计算 | 自动乘法计算 | 两个字段相乘自动填充结果 |
| 计算 | 薪资计算 | 根据基本工资和绩效自动计算奖金和总薪酬 |
| 计算 | 日期差值计算 | 计算两个日期之间的天数差 |
| 校验 | 条件校验 | 满足特定条件时才进行校验 |
| 校验 | 提交前校验 | 提交前检查必填字段和业务规则 |
| 查询 | 查询数据表 | 根据字段值查询数据表中的其他信息 |
| 提交 | 提交前格式化 | 提交前自动格式化数据 |
| 提交 | 表单加载默认值 | 表单加载时自动填充默认值 |
| UI | 提交成功提示 | 提交成功后显示自定义提示 |
| UI | 行切换日志 | 切换数据行时记录日志 |

---

## 技术栈

| 技术 | 用途 |
|------|------|
| React 19 + TypeScript | 前端框架 |
| Vite 8 | 构建工具（Rolldown） |
| @xyflow/react | 流程画布 |
| @antv/x6 | 表单设计器画布 |
| AG Grid | 数据表格 |
| Monaco Editor | 代码编辑器 |
| Zustand | 状态管理 |
| SheetJS | Excel 读写 |
| Express | 后端 API |

---

## 项目结构

```
├── ui/                         # React + TypeScript + Vite 8 前端
│   ├── src/
│   │   ├── components/        # 通用 UI 组件
│   │   │   ├── DocModal.tsx   # 全局文档弹窗
│   │   │   ├── DocSidebar.tsx # 文档目录导航
│   │   │   ├── FormRenderer.tsx
│   │   │   ├── CodeEditor.tsx
│   │   │   └── ...
│   │   ├── designer/          # 表单设计器
│   │   │   ├── PropertyPanel.tsx    # 属性面板主壳
│   │   │   ├── properties/         # 属性子组件
│   │   │   │   ├── EventScriptEditor.tsx
│   │   │   │   ├── FlowTriggerEditor.tsx
│   │   │   │   ├── LinkageRulesEditor.tsx
│   │   │   │   └── utils.ts
│   │   │   ├── useDesigner.tsx      # 设计器主 hook
│   │   │   ├── hooks/              # 子 hooks
│   │   │   │   ├── useDesignerState.ts
│   │   │   │   ├── useDesignerActions.ts
│   │   │   │   ├── useDesignerClipboard.ts
│   │   │   │   ├── useDesignerHistory.ts
│   │   │   │   └── useDesignerIO.ts
│   │   │   ├── controls/           # 控件定义
│   │   │   │   ├── input.tsx       # 输入类控件
│   │   │   │   ├── select.tsx      # 选择类控件
│   │   │   │   ├── container.tsx   # 容器类控件
│   │   │   │   └── display.tsx     # 展示类控件
│   │   │   └── ...
│   │   ├── pages/             # 路由页面
│   │   │   ├── home/          # 首页相关
│   │   │   │   ├── Layout.tsx
│   │   │   │   ├── ProjectsListPage.tsx
│   │   │   │   └── SystemSettingsPage.tsx
│   │   │   ├── editor/        # 编辑器相关
│   │   │   │   ├── UnifiedEditorPage.tsx
│   │   │   │   ├── CanvasPage.tsx
│   │   │   │   ├── DataPreviewPage.tsx
│   │   │   │   ├── BehaviorPage.tsx
│   │   │   │   └── ...
│   │   │   └── doc/           # 文档系统
│   │   │       ├── DocsHomePage.tsx        # 全局文档首页
│   │   │       ├── BehaviorDocsPage.tsx    # 行为文档
│   │   │       ├── SectionPage.tsx         # 通用分区页面
│   │   │       ├── OverviewPage.tsx        # 梗概文档
│   │   │       ├── FormDesignSectionPage.tsx # 表单设计文档
│   │   │       ├── FlowNodeSectionPage.tsx   # 流程节点文档
│   │   │       └── BackendSectionPage.tsx    # 后端 API 文档
│   │   ├── project/           # 项目状态、类型和持久化
│   │   ├── services/          # 业务服务层
│   │   │   ├── engine/        # 流程/行为引擎
│   │   │   │   ├── flowEngine.ts
│   │   │   │   ├── behaviorEngine.ts
│   │   │   │   ├── formEventExecutor.ts
│   │   │   │   └── ...
│   │   │   ├── io/            # 数据读写/API
│   │   │   │   ├── behaviorDocs.ts   # 文档数据 facade
│   │   │   │   ├── docs/             # 文档数据子模块
│   │   │   │   │   ├── types.ts      # 核心类型定义
│   │   │   │   │   ├── shared.ts     # 共享数据与工厂函数
│   │   │   │   │   ├── sections.ts   # 全局文档分区定义
│   │   │   │   │   ├── event-docs-script.ts  # 脚本事件文档(22个)
│   │   │   │   │   ├── event-docs-control.ts # 控件事件文档(9个)
│   │   │   │   │   ├── topic-docs.ts         # 主题文档(3个)
│   │   │   │   │   ├── overview-docs.ts      # 梗概文档
│   │   │   │   │   ├── form-design-docs.ts   # 表单设计文档(26控件)
│   │   │   │   │   ├── flow-node-docs.ts     # 流程节点文档(8分组)
│   │   │   │   │   └── backend-docs.ts       # 后端 API 文档(9模块)
│   │   │   │   ├── routes.ts
│   │   │   │   └── ...
│   │   │   ├── display/      # 展示/编辑辅助
│   │   │   ├── data/         # 数据处理
│   │   │   └── config/       # 配置/类型/模板
│   │   ├── models/            # 核心数据模型
│   │   └── style/             # 模块化样式
│   │       ├── variables.css          # CSS 变量
│   │       ├── layout.css             # 全局布局
│   │       ├── pages-doc.css          # 文档页面样式
│   │       ├── designer-*.css         # 设计器样式(10个文件)
│   │       ├── renderer-*.css         # 表单渲染样式(17个文件)
│   │       ├── components-*.css       # 组件样式(5个文件)
│   │       └── pages-*.css            # 页面样式(7个文件)
│   ├── nodes/                 # 约定式节点包
│   │   ├── <node>/
│   │   │   ├── schema.json    # 节点元数据（必需）
│   │   │   └── index.ts       # execute 实现（可选）
│   │   ├── executors/         # 分类公共执行器
│   │   ├── node-packages.ts   # 节点包发现与标准化方法
│   │   ├── package-modules.ts # import.meta.glob 入口
│   │   └── registry.ts        # 统一节点注册表
│   ├── e2e/                   # Playwright 测试
│   ├── index.html
│   ├── vite.config.ts         # Vite 8 / Rolldown 配置
│   └── tsconfig.json
├── server/                    # Express 后端
│   ├── src/
│   │   ├── config/paths.ts    # 服务、项目和 Python 路径中心
│   │   ├── routes/            # API 路由（projects/files/data/workflows/behaviors/describe/configs/ml/history/checkpoints）
│   │   └── index.ts           # 服务入口
│   └── data/                  # 上传、缓存、报告和配置
├── python-service/            # Python 数据分析与 ML 服务
│   ├── src/
│   │   ├── describe.py
│   │   └── ml_engine.py
│   ├── requirements.txt
│   └── setup.sh
├── projects/                  # 项目资产
│   ├── example_sales_approval.zip # 可导入示例包
│   └── data/                  # 后端目录式项目包
├── docs/                      # 使用与事件参考文档
├── scripts/                   # 项目数据生成脚本
└── package.json               # 仓库统一命令入口
```

### 节点包约定

Vite 8 通过 `import.meta.glob('./*/schema.json')` 自动识别 `ui/nodes` 下的节点包。新增节点只需创建目录和 `schema.json`，无需再维护手写目录清单；存在 `index.ts` 时执行器按需加载，生产构建输出为独立的 `assets/nodes/<节点包>-<hash>.js` chunk。

### FormFlow v2 项目包约定

后端不再识别旧的单文件 `<id>.json` 项目。每个项目保存为 `projects/data/<id>.formflow/`：

```text
<id>.formflow/
├── project.json
├── forms/
│   ├── _index.json
│   └── <form-id>.json
├── data/
│   ├── _index.json
│   └── <source-id>.meta.json
├── workflows/workflows.json
├── behaviors/behaviors.json
└── outputs/outputs.json
```

`project.json` 必须声明 `kind: "formflow-project"` 和 `formatVersion: 2`。浏览器导入导出的 `.zip` 与服务端磁盘目录 `.formflow` 使用相同内容结构，前端会通过 ZIP 内部的 `project.json` 识别项目包。

---

## 节点类型

| 类别 | 数量 | 说明 |
|------|------|------|
| Generic | 48 | 输入输出、筛选排序、分组聚合、数据清洗、缺失值处理、类型转换、正则、编码、校验、集成（数据库 / WebSocket / PDF / Email）、工作流 I/O、多条件筛选、TopN 选取、**条件分支**、**遍历**、**调用流程** |
| Behavior | 32 | 表单事件触发、条件分支、赋值、计算、校验、提交、JS 脚本、循环、数据查询、批量赋值、列表查询、自动编号、表单回填、必填校验、表单重置 |
| Func | 23 | 样式、图表（SVG）、工作表操作、表单控件、查找替换、去重、合并单元格、保护 |
| ML | 18 | 预处理（归一化 / 标准化 / PCA）、分析（描述统计 / 相关性 / 回归）、挖掘（K-Means / KNN / 决策树 / 随机森林 / SVM / 朴素贝叶斯 / 异常检测） |
| Scenario | 5 | Excel→JSON、JSON→XLSX、追加行、预览、地址工具 |

---

## 数据流

```
数据预览 → 流程编排 → 表单设计 → 测试运行
   ↓           ↓           ↓          ↓
 上传文件    节点连接    控件绑定    行为触发
 字段识别    数据传递    数据源      变更记录
 数据概览    类型校验    RangeRef    导出结果
```

---

## License

MIT
