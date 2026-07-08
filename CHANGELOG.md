# Changelog

## [0.7.0] - 2026-07-08

### 工作流 I/O 节点
- **流程导入节点** (`workflow:import`): 流程级统一入口，按自定义字段向下游输出表单触发数据
- **流程导出节点** (`workflow:export`): 流程级统一出口，按自定义字段收集流程结果
- 支持 `port-definition` 属性类型，通过表格或 JSON 编辑端口定义

### CRUD 节点包（6 个新节点）
- `behavior-set-values`: 批量赋值节点，支持对象输入或多键值对配置，一次性设置多个表单字段
- `behavior-query-list`: 列表查询节点，从数据表查询多条记录，支持筛选条件和字段映射
- `behavior-next-sequence`: 自动编号节点，读取数据表最大编号并生成下一个序号
- `behavior-fill-form`: 表单回填节点，根据查询条件加载记录并回填到表单字段
- `behavior-require-fields`: 必填校验节点，检查指定字段是否已填写，未通过则阻止提交
- `behavior-reset-form`: 表单重置节点，清空所有字段值并聚焦首个字段，用于连续录入场景

### 数据处理节点（2 个新节点）
- `generic-criteria-filter`: 多条件筛选节点，支持 `contains/equals/gt/lt/gte/lte/startsWith/endsWith/isEmpty/isNotEmpty` 等操作符，多个条件可选 AND/OR 组合
- `generic-pick-record`: TopN 记录选取节点，支持升序/降序排序并取前 N 条记录

### 输入端口增强
- **多连接支持**: 输入端口可接收多条连接，通过 `__inputSelections` 选择使用哪条连接的数据
- **输入覆盖** (`__inputOverrides`): 可直接在节点属性中配置输入值，无需连接上游节点
- **项目数据表绑定**: 支持从项目数据表直接绑定到节点输入端口，自动提取表头和预览数据
- 去重逻辑：连接边自动去重，防止重复连接
- 输入收集逻辑重构：按端口分组处理，支持边选择和属性覆盖优先级

### 新增示例项目
- `example_valve_selection_v2`（阀门二代选型）: 使用高阶推荐节点实现"多条件筛选 + 候选选取 + 批量回填"的选型推荐流程
- `example_valve_selection_v3`（阀门三代选型）: 按业务阶段重构为"受理 → 技术画像 → 候选生成 → 评分排序 → 提案确认 → 案例归档"的多流程样板

### 工程改进
- **统一初始化脚本**: 新增 `scripts/init-env.sh` (macOS/Linux) 和 `scripts/init-env.ps1` (Windows)，统一管理 Node、pnpm、Python venv 和依赖安装
- **PortTableEditor 增强**: 支持表格/JSON 双模式编辑，新增端口描述字段
- 节点总数从 134 增加到 **144** 个
- 示例生成脚本重构：提取 `workflowNode`、`workflowEdge`、`portDefs` 等工具函数，支持更复杂的示例场景
- 所有示例项目的工作流数据更新，集成新节点

### 新增文件
- `ui/nodes/behavior-set-values/schema.json` — 批量赋值节点
- `ui/nodes/behavior-query-list/schema.json` — 列表查询节点
- `ui/nodes/behavior-next-sequence/schema.json` — 自动编号节点
- `ui/nodes/behavior-fill-form/schema.json` — 表单回填节点
- `ui/nodes/behavior-require-fields/schema.json` — 必填校验节点
- `ui/nodes/behavior-reset-form/schema.json` — 表单重置节点
- `ui/nodes/generic-criteria-filter/schema.json` — 多条件筛选节点
- `ui/nodes/generic-pick-record/schema.json` — TopN 记录选取节点
- `ui/src/services/engine/crudHelpers.ts` — CRUD 节点公共辅助函数
- `ui/src/services/engine/workflowIo.ts` — 工作流 I/O 脚手架生成
- `scripts/init-env.sh` — macOS/Linux 初始化脚本
- `scripts/init-env.ps1` — Windows 初始化脚本
- `projects/data/example_valve_selection_v2.formflow/` — 阀门二代选型项目
- `projects/data/example_valve_selection_v3.formflow/` — 阀门三代选型项目

---

## [0.6.0] - 2026-07-07

### UI 代码结构重构
- **services/ 目录分组**: 55 个文件按功能域归入 5 个子目录：`engine/`(流程/行为引擎)、`io/`(数据读写/API)、`display/`(展示/编辑辅助)、`data/`(数据处理)、`config/`(配置/类型/模板)
- **pages/ 目录归位**: 16 个页面组件移入 `home/`、`editor/`、`doc/` 子目录，消除平铺结构
- **designer/ 大文件拆分**: `PropertyPanel.tsx`(1884行) 拆为 5 个子组件；`useDesigner.tsx`(1117行) 拆为 5 个 hooks + utils
- **behaviorDocs.ts 拆分**: 931 行拆为 `types.ts`、`shared.ts`、`event-docs-script.ts`、`event-docs-control.ts`、`topic-docs.ts`
- **CSS 文件拆分**: `designer.css`(3031行)→10 文件、`form-renderer.css`(1745行)→17 文件、`components.css`(1297行)→5 文件、`pages.css`(1342行)→7 文件
- 清理空目录 `main/`、`preload/`、`renderer/` 和无引用的 `project/context.tsx`

### 文档系统增强
- **模糊搜索**: 多关键词空格分隔、加权匹配（eventName > title > tags > category > summary）
- **标签过滤**: 为 31 个事件文档添加 `tags` 字段，支持 pill 形状多选过滤
- **快捷导航**: 详情页增加 `DocSidebar` 目录组件（IntersectionObserver 自动高亮）、面包屑导航、上/下一篇导航
- **全局文档弹窗**: 导航栏「文档」按钮改为打开 `DocModal` 模态框，保留 `/docs` 独立路由
- **补充示例**: 为缺少示例的事件补充实用代码示例
- **样式增强**: 事件卡片化、代码块头部、标签过滤栏、搜索图标、section 分隔线、Modal 内滚动适配

### 全局文档系统
- **文档首页**: 新增 `/docs` 全局文档首页，分区卡片 + 全局搜索 + 热门文档
- **5 大文档分区**: 梗概(概述/快速入门/项目结构)、行为(31事件+3主题)、表单设计(26控件)、流程节点(8分组)、后端(9 API模块)
- **分区页面**: 每个分区支持索引+详情双模式，复用 `SectionPage` 通用组件
- **数据来源**: 表单设计文档从控件注册表提取，流程节点文档从节点注册表提取，后端 API 文档从路由模块提取
- **路由升级**: `/docs`→首页、`/docs/behavior/:slug`→行为详情、`/docs/form-design/:slug`→控件详情、`/docs/flow-nodes/:slug`→节点详情、`/docs/backend/:slug`→API详情

### 右侧面板样式优化
- 全局右侧面板宽度变量缩小：`340-420px` → `280-340px`
- 设计器属性面板统一使用 CSS 变量（移除硬编码 `400-460px`）
- antd 控件最小高度降低：`34px` → `28px`
- 控件圆角缩小：`12px` → `8px`，阴影简化
- 字段间距、输入框内边距、textarea 高度全面收紧

---

## [0.5.0] - 2026-07-06

### 使用模式页面
- 新增独立「使用模式」页面（`/projects/:id/usage`），数据预览 + 表单预览弹窗
- 数据预览：AG Grid 只读表格 + 列详情 + 新增/删除/编辑行 + 保存到后端
- 表单预览：侧边栏表单列表，点击打开大弹窗，内嵌设计器 PreviewCanvas（空间布局、控件可交互）
- 项目列表每个卡片增加「使用模式」入口按钮

### 后端数据 API 改造
- 新增项目作用域数据 API：`POST /api/projects/data/query|add|update|delete`
- 后端直接读写 `.formflow` 包中的 `srcTable[].sheets[].preview` 数据
- `project-package-store.ts` 新增 `getTableSheetData` / `updateTableSheetData` 函数
- 前端 `UsagePage` 和 `DataPreviewPage` 全部切换到新 API

### 表单→工作表同步
- PreviewCanvas 新增防抖同步钩子：表单字段变更时自动写回对应工作表
- 通过 `tableBinding`（tableId/sheetName/keyField/keyValue/column）定位目标单元格
- 500ms 防抖批量提交，调用 `persistProject` 持久化到 `.formflow` 包

### 表单设计器优化
- 工具栏新增表单切换下拉菜单，可直接切换当前编辑的表单
- 切换表单时先清空画布再加载新设计（`clearDesign` 方法）
- 控件配置面板性能优化：`SchemaField` 使用 `React.memo`，`updateProp` / `currentProps` / `tables` 等全部 `useMemo` / `useCallback` 稳定化，避免单字段修改触发整体重渲染

### 自定义 JS 流程节点
- 新增 `generic-custom-js` 节点包：自定义输入/输出端口 + Monaco 代码编辑器
- 端口定义使用表格化 UI（PortTableEditor），支持添加/删除行、名称/标签/类型配置
- 代码编辑器使用 Monaco，支持全屏、语法高亮、行号
- CanvasPage 新增 `port-definition` 和 `code` 属性类型渲染

### 日期选择器修复
- DatePicker 隐藏原生 input 移除 `pointerEvents: 'none'`，`showPicker()` 可正常工作
- `onInput` 全部改为 `onChange`（React 标准事件）
- DatePicker / DateRange / TimePicker 统一修复

### 项目列表视觉优化
- 卡片封面改为 Mesh Gradient（多层 radial-gradient + 椭圆形色块 + rgba 半透明融合）
- 移除 emoji 图标，卡片封面为纯渐变色带
- 8 组低饱和度清爽配色

### 示例项目修复
- `generate_industry_examples.ts` 的 `writeBackFieldMap` 从 `$form.字段名` 修正为 `字段名`
- 重新生成 `example_employee_mgmt` / `example_student_info` / `example_check_valve_selection` / `example_renewable_generation`

### 移除
- 删除 `TestPage.tsx`（762 行），功能已整合到使用模式页面
- 移除 `/workspace/test` 路由

---

## [0.4.0] - 2026-07-03

### FormFlow v2 项目架构
- 项目持久化从单文件 `<id>.json` 改为 `projects/data/<id>.formflow/` 目录包
- `project.json` 使用 `kind: formflow-project` 与 `formatVersion: 2` 进行严格识别，不再接受旧项目 JSON
- 表单、数据源、流程、行为和输出分别存入独立目录/文件，后端读取时统一组装为运行时项目模型
- 项目创建、更新、复制、删除及流程/行为 API 全部接入目录包存储层
- 前端移除旧 JSON 导入导出；磁盘目录使用 `.formflow`，分发包使用 `.zip`，并通过包内 `project.json` 严格识别
- 删除原有项目数据，新增“销售订单审批”完整 v2 示例及可导入 ZIP

### 仓库目录重构
- 前端统一迁入 `ui/`，包含应用源码、节点包、Vite 配置、TypeScript 配置和 Playwright 测试
- Express 后端整理为 `server/src/`，运行数据集中到 `server/data/`
- Python 数据分析与 ML 能力整理为 `python-service/`，源码与环境安装文件分离
- 示例项目和服务端项目持久化数据集中到 `projects/` 与 `projects/data/`
- 新增 `server/src/config/paths.ts`，统一管理仓库、服务数据、项目和 Python 服务路径
- 更新开发、构建、测试、E2E 和服务启动命令以适配新结构

### Vite 8 与节点包自动发现
- 升级到 Vite 8.1 和 `@vitejs/plugin-react` 6，构建配置切换到 `build.rolldownOptions`
- 使用 `import.meta.glob` 按目录约定自动发现节点 schema 和执行器，移除注册表中的手写节点目录清单
- 提炼节点 ID 标准化、schema 转换、执行器加载等通用方法
- 节点执行器改为动态导入，生产构建按 `assets/nodes/<节点包>-<hash>.js` 独立分块
- 自动注册表覆盖 133 个唯一节点；验证 136 个节点执行入口均有对应独立 chunk

### 工程质量
- 新增节点包发现测试并更新目录感知型注册表测试
- 补齐 `@playwright/test` 开发依赖和 `test:e2e` 命令
- 更新 E2E 路由断言和可访问性定位器，5 项浏览器流程全部通过
- 当前验证基线：95 项单元测试、5 项 E2E、TypeScript 类型检查、Vite 生产构建、后端 API 冒烟测试和 Python 语法检查

---

## [0.3.0] - 2026-07-01

### 交互体验优化 — 降低填表感
- **智能行切换器**: 可搜索下拉行选择器，显示前 3 列摘要，支持关键词模糊搜索，↑↓ 快捷键导航，行进度条
- **自动聚焦与键盘流**: 行切换后自动聚焦首个可编辑字段，Enter 跳下一字段，Shift+Enter 跳上一字段，Ctrl+Enter 提交，底部快捷键提示条
- **即时校验与引导**: 必填项进度条（3/7），字段 blur 后内联校验，校验通过绿色对勾动画，数字字段范围提示
- **情感化反馈**: 提交成功 toast 通知，dirty 字段左侧橙色竖条标记，变更数量 badge
- **分步向导模式**: 可编辑字段 > 6 个时自动启用，步骤条导航，slide 过渡动画，上一步/下一步按钮
- **卡片式布局**: layout="card" 模式，每 4 个字段自动分组为圆角卡片，带阴影和 hover 效果

### 行为定义系统完善
- **补全动作执行器**: 新增 setRequired, setOptional, switchTab, submitData, callApi, refreshData, navigate 7 个动作
- **行为模板库**: 14 个预置模板（联动/计算/校验/查询/提交/UI），一键插入
- **可视化规则构建器**: 触发器/条件/动作 UI，与代码双向同步，自然语言预览
- **行为测试与调试**: 测试面板，模拟数据输入，运行测试，执行日志展示
- **行为导入导出**: JSON 格式导入/导出/下载，支持批量操作

### 行为事件扩展（12 个新事件）
- `onFormReady`: 表单完全加载就绪后触发
- `onFormReset`: 表单重置时触发
- `onBeforeSubmit`: 提交前触发（可拦截）
- `onFieldKeyDown`: 字段内按键时触发
- `onFieldPaste`: 粘贴内容到字段时触发
- `onFieldClear`: 清空字段时触发
- `onRowAdd`: 新增数据行时触发
- `onRowDelete`: 删除数据行时触发
- `onRowSelect`: 选择数据行时触发
- `onDataImport`: 数据导入时触发
- `onDataExport`: 数据导出时触发
- `onValueChange`: 任意字段值变化时触发

### 新增文件
- `src/services/behaviorTemplates.ts` — 行为模板库
- `src/services/behaviorIO.ts` — 行为导入导出服务
- `src/components/RuleBuilder.tsx` — 可视化规则构建器
- `src/components/BehaviorTestPanel.tsx` — 行为测试面板

### 改动文件
- `src/services/behaviorEngine.ts` — TriggerType 扩展到 24 个，补全 7 个动作执行器
- `src/pages/TestPage.tsx` — RowSwitcher 组件、toast、键盘快捷键、新事件触发器
- `src/pages/BehaviorPage.tsx` — 模板按钮、导入导出、可视化/代码模式切换、测试面板
- `src/components/FormRenderer.tsx` — autoFocus、wizardMode、layout、onKeyDown/onPaste/onClear
- `src/style/form-renderer.css` — RowSwitcher、toast、wizard、card、键盘提示条样式

---

## [0.2.0] - 2026-06-30

### 全部节点执行器真实可运行
- **133 个节点**全部有真实执行逻辑，无 stub
- `generic:database-query`: fetch API 调用 + SQL 解析回退（SELECT/WHERE/LIMIT 对项目数据查询）
- `generic:websocket`: 真实 WebSocket 连接配置 + 发送/断开状态管理
- `generic:pdf-report`: HTML 报告生成 + 浏览器下载/打印
- `generic:email-send`: mailto: 链接打开 + SMTP 配置提示
- `func-form-validate`: 完整规则引擎（required/minLength/maxLength/min/max/pattern/email/phone）
- `func-apply-style`: 真实样式应用到 XLSX 单元格
- `func-conditional-format`: 条件过滤（contains/equals/gt/lt/gte/lte/isEmpty/isNotEmpty）
- `func-data-validation`: 校验逻辑（list/whole/decimal/date/textLength）
- `func-add-comment`: 批注写入 XLSX
- `func-merge-cells`: 真实合并单元格
- `func-find-replace`: 真实查找替换 + 计数
- `func-remove-duplicates`: 真实去重
- `func-create-chart`: SVG 图表生成（bar/pie/line）
- `func-sheet-operation`: add/delete/rename/copy 工作表
- `func-copy-range`: 真实范围复制
- `func-protect-sheet/workbook`: 密码保护配置

### Range Selector Excel 级增强
- **Name Box**: 显示/编辑当前选区地址，输入地址跳转（如 B3、D5:H10）
- **Formula Bar**: 显示当前单元格内容或选区摘要
- **键盘导航**: 方向键移动、Shift+方向键扩展、Tab/Enter 切换、Ctrl+A 全选、Home/End
- **拖拽自动滚动**: 拖拽到边缘时自动滚动，速度与距离成正比
- **多区域选择**: Ctrl+拖拽选多个不连续区域
- **超 Z 列号**: colName() 支持 AA, AB, ... ZZ+
- **选区边框**: 绿色选区边框 + 底部拖拽角手柄
- **Active Cell**: 蓝色轮廓高亮当前活动单元格
- **右键菜单**: 选择整行、选择整列、复制单元格地址
- **列宽调整**: 拖拽列边框调整宽度，双击自适应内容

### 表单设计器预览模式
- 预览模式下控件**不可拖拽但可交互**（输入、选择、点击、切换）
- X6 图表禁用平移/缩放/选择/键盘
- CSS `pointer-events` 精确控制：X6 节点不可拖拽，表单元素可交互
- Switch / Rating / Radio / Checkbox 在预览模式下支持点击交互
- Select 控件在预览模式下渲染为真实 `<select>` 元素
- Button 控件在预览模式下显示 pointer cursor

### 表单可填 + 行为引擎触发
- TestPage 导入项目按钮（离线可用）
- 设计器组件名从 `fieldBinding` 映射（非 `props.name`）
- `numberInput` 类型映射修复
- 行为规则事件名自动映射（onFieldChange → fieldChange）
- 脚本沙箱新增 `formData` getter、`setField` alias、`originalData`
- 表单加载后自动触发 fieldChange（让计算规则执行）
- `setProject` / `initProject` 离线兼容（服务器离线不阻塞）

### Monaco 编辑器浅色主题
- 自定义 `formflow-light` 主题（defineTheme API）
- 完整 Suggest Widget 配色（背景/前景/选中行/高亮/描述/状态栏/文档侧栏）
- Hover Widget 样式
- 语法高亮（keyword/purple, string/green, number/blue, comment/gray）
- 对象/数组类型输入自动使用 Monaco
- 输出预览 Modal 原始数据视图使用只读 Monaco

### 输出端口展开弹窗
- 每个 output-port-row 添加展开按钮 (⤢)
- 点击打开 Modal 显示完整数据
- 根据数据类型定制展示（表格 / JSON / HTML / 工作表）

### 连接端口显示来源信息
- 已连接端口显示来源节点名称（← XLSX读取）
- 已运行时显示传入的实际值（绿色背景 monospace）
- 对象/数组显示 JSON 内容

### 滚动修复
- `.canvas-inspector` / `.schema-config` / `.result-box` 添加 `min-height: 0` + `overflow: auto`
- `.output-port-value` 添加 `max-height: 300px`
- 流程节点预览 `onWheel` 停止传播（防止 React Flow 拦截）
- `overscroll-behavior: contain` 防止滚动链
- `touch-action: manipulation` 应用到所有可滚动容器

### 被动事件监听器修复
- TabBar `onWheel` 改为原生 `addEventListener` + `{ passive: true }`
- X6 容器元素添加 `touch-action: manipulation`
- 预览模式 CSS 锁定阻止 X6 底层拖拽

### 示例项目 proj_new
- 2 个数据表：销售记录（20 行 × 6 列）、员工档案（10 行 × 7 列）
- 4 个流程：数据清洗与聚合、回归分析、图表绘制、信息录入与修改
- 1 个表单设计：员工信息录入表单（11 个组件）
- 1 个行为规则：薪资计算脚本（绩效 ≥ 90 奖金 20%，否则 10%）

---

## [0.1.0] - 2026-06-29

### 初始版本
- 数据预览（AG Grid + 字段类型推断）
- 流程编排（节点画布 + 131 节点）
- 表单设计器（14 种控件 + X6 画布）
- 行为定义（脚本编辑器 + 行为引擎）
- 测试运行（表单预览 + 变更记录 + 导出）
- Monaco 代码编辑器
- Range Selector 基础功能
- Express 后端 + Python ML 后端
