# Changelog

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
