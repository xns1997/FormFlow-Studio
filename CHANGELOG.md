# Changelog

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
