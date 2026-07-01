# FormFlow Studio

**Excel 表单编排框架** —— 可视化流程编排 + 表单设计器 + 数据预览 + 测试运行

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
- **133+ 节点** 全部可执行（无 stub）：
  - **Generic (44)**: 输入输出、筛选排序、分组聚合、数据清洗、缺失值处理、类型转换、正则提取、编码解码、校验
  - **Behavior (26)**: 表单事件触发、条件分支、赋值、计算、校验、提交、JS 脚本
  - **Func (23)**: 样式、图表（SVG）、工作表操作、表单控件、查找替换、去重、合并单元格
  - **ML (18)**: 归一化、标准化、PCA、K-Means、KNN、决策树、随机森林、朴素贝叶斯、SVM、异常检测、线性回归、相关性分析
  - **Scenario (5)**: Excel→JSON、JSON→XLSX 导出、追加行、预览、地址工具
- 27 种端口类型 + 类型校验器
- 节点间真实数据传递（topological sort + 依赖执行）
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
- 脚本沙箱（getValue / setValue / formData / setField / showMessage / querySheet）
- 事件名自动映射（onFieldChange → fieldChange）
- 行为日志实时追踪

### 测试运行
- 完整表单预览 + 运行时状态面板
- 行切换（上一行 / 下一行）+ 行为规则触发
- 变更记录追踪 + 提交 / 导出（JSON / Excel / CSV）
- 表单控件事件执行（onChange / onBlur / onClick）
- 流程触发器（控件事件 → 调用编排流程）
- **表单可填**：字段自动填充、行为规则自动计算

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

## 快速开始

```bash
# 安装依赖
pnpm install

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
```

## 示例项目

`proj_new/project.json` 包含 4 个完整流程 + 1 个表单设计：

| 流程 | 节点 | 说明 |
|------|------|------|
| 数据清洗与聚合 | 8 | 筛选 → 排序 → 类型转换 → 缺失值处理 → 分组聚合 → 展示 |
| 回归分析 | 6 | 描述性统计 → 相关性分析 → 线性回归 |
| 图表绘制 | 7 | 按产品分组 → 柱状图 / 饼图 / 折线图 |
| 信息录入与修改 | 9 | 表单校验 → 条件判断 → 奖金计算 → 提交 |

导入方式：打开应用 → 项目列表 → 导入项目 → 选择 `proj_new/project.json`

---

## 技术栈

| 技术 | 用途 |
|------|------|
| React 19 + TypeScript | 前端框架 |
| Vite | 构建工具 |
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
├── src/
│   ├── components/       # 通用组件
│   │   ├── FormRenderer.tsx        # 表单渲染器（支持 Monaco 编辑对象/数组）
│   │   ├── CodeEditor.tsx          # Monaco 编辑器封装（自定义主题 + 智能提示）
│   │   ├── RangeSelector.tsx       # Excel 级选区组件
│   │   ├── TypeDisplayer.tsx       # 27 种类型可视化展示
│   │   ├── OutputPreviewModal.tsx  # 输出预览弹窗（表格 / Monaco / HTML）
│   │   └── ChartWidget.tsx         # 图表组件
│   ├── designer/         # 表单设计器
│   │   ├── useDesigner.tsx         # 设计器 Hook（预览模式锁定拖拽）
│   │   ├── DesignCanvas.tsx        # 画布组件
│   │   ├── PropertyPanel.tsx       # 属性面板（Monaco 事件编辑）
│   │   ├── controls/               # 14 种控件定义（预览模式可交互）
│   │   └── export.ts               # 设计 → ComponentNode 导出
│   ├── pages/
│   │   ├── DataPreviewPage.tsx     # 数据预览
│   │   ├── CanvasPage.tsx          # 流程编排（节点执行器真实运行）
│   │   ├── FormDesignerPage.tsx    # 表单设计器
│   │   ├── TestPage.tsx            # 测试运行（表单可填 + 行为触发）
│   │   └── BehaviorPage.tsx        # 行为定义
│   ├── services/
│   │   ├── flowEngine.ts           # 流程执行引擎
│   │   ├── behaviorEngine.ts       # 行为引擎
│   │   ├── scriptSandbox.ts        # 脚本沙箱（formData / setField）
│   │   └── rangeResolver.ts        # Range 解析器
│   ├── project/
│   │   ├── store.ts                # Zustand store（离线兼容）
│   │   ├── types.ts                # 项目类型定义
│   │   └── manager.ts              # 项目管理 API
│   └── style/                      # 模块化 CSS
│       ├── variables.css           # CSS 变量 + X6 touch-action
│       ├── components.css          # Monaco 浅色主题
│       ├── canvas.css              # 流程画布 + 输出端口
│       ├── form-renderer.css       # 表单渲染器 + Range Selector
│       └── designer.css            # 表单设计器
├── nodes/
│   ├── registry.ts                 # 节点注册表
│   ├── executor-registry.ts        # 执行器注册表
│   ├── port-types.ts               # 27 种端口类型
│   └── executors/                  # 节点执行器（全部可运行）
│       ├── generic.ts              # 44 个通用节点
│       ├── behavior.ts             # 26 个行为节点
│       ├── func.ts                 # 23 个功能节点
│       ├── ml.ts                   # 18 个 ML 节点
│       └── scenario.ts             # 5 个场景节点
├── proj_new/                       # 示例项目
│   ├── project.json                # 4 流程 + 2 数据表 + 1 表单
│   └── import.ts                   # 导入说明
├── server/                         # Express 后端
│   ├── index.ts                    # 服务器入口
│   └── routes/ml.ts                # ML API
└── python/                         # Python ML 后端
    ├── ml_engine.py                # scikit-learn ML 操作
    └── describe.py                 # 数据分析
```

---

## 节点类型

| 类别 | 数量 | 说明 |
|------|------|------|
| Generic | 44 | 输入输出、筛选排序、分组聚合、数据清洗、缺失值处理、类型转换、正则、编码、校验、集成（数据库 / WebSocket / PDF / Email） |
| Behavior | 26 | 表单事件触发、条件分支、赋值、计算、校验、提交、JS 脚本、循环、数据查询 |
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
