# FormFlow Studio v0.4.0

**Excel 表单编排框架** —— 可视化流程编排 + 表单设计器 + 数据预览 + 测试运行 + 行为定义

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
- **24 种事件**：formLoad, formReady, formReset, rowLoad, rowSelect, rowAdd, rowDelete, fieldChange, fieldBlur, fieldFocus, fieldKeyDown, fieldPaste, fieldClear, valueChange, buttonClick, beforeSubmit, submit, submitSuccess, submitError, validate, dataImport, dataExport, dataSourceChange, tabChange
- **16 种动作**：setValue, clearValue, setVisible, setHidden, setEnabled, setDisabled, setRequired, setOptional, showMessage, logMessage, switchTab, executeScript, submitData, callApi, refreshData, navigate
- 脚本沙箱（getValue / setValue / formData / setField / showMessage / querySheet / submit）
- 事件名自动映射（onFieldChange → fieldChange）
- 行为日志实时追踪
- **可视化规则构建器**：触发器/条件/动作 UI，与代码双向同步，自然语言预览
- **行为模板库**：14 个预置模板（联动/计算/校验/查询/提交/UI），一键插入
- **行为测试面板**：模拟数据输入、运行测试、执行日志展示
- **行为导入导出**：JSON 格式导入/导出/下载
- 行为文档中心（全局 `/docs`，支持从项目工作区和项目设置回跳）+ 行为页右侧快速 Reference

### 测试运行
- **智能行切换器**：可搜索下拉行选择器，显示关键字段摘要，支持关键词模糊搜索，↑↓ 快捷键导航
- 完整表单预览 + 运行时状态面板
- **自动聚焦与键盘流**：行切换后自动聚焦首个字段，Enter 跳下一字段，Ctrl+Enter 提交
- **即时校验**：必填项进度条，字段 blur 后内联校验，校验通过绿色对勾动画
- **分步向导模式**：字段 > 6 个时自动启用，步骤条导航，slide 过渡动画
- **卡片式布局**：layout="card" 模式，每 4 个字段自动分组为圆角卡片
- **情感化反馈**：提交成功 toast 通知，dirty 字段橙色竖条标记
- 变更记录追踪 + 提交 / 导出（JSON / Excel / CSV）
- 表单控件事件执行（onChange / onBlur / onClick / onKeyDown / onPaste）
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

# 端到端测试
pnpm test:e2e

# 初始化 Python 服务环境
bash python-service/setup.sh
```

## 示例项目

`projects/example/project.json` 包含 4 个完整流程 + 1 个表单设计：

| 流程 | 节点 | 说明 |
|------|------|------|
| 数据清洗与聚合 | 8 | 筛选 → 排序 → 类型转换 → 缺失值处理 → 分组聚合 → 展示 |
| 回归分析 | 6 | 描述性统计 → 相关性分析 → 线性回归 |
| 图表绘制 | 7 | 按产品分组 → 柱状图 / 饼图 / 折线图 |
| 信息录入与修改 | 9 | 表单校验 → 条件判断 → 奖金计算 → 提交 |

导入方式：打开应用 → 项目列表 → 导入项目 → 选择 `projects/example/project.json`

---

## 行为文档

- 仓库手册：`docs/behavior-event-reference.md`
- 全局文档页：访问 `/docs`
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
│   │   ├── components/        # 通用 UI 与业务组件
│   │   ├── designer/          # 表单设计器、控件和画布
│   │   ├── pages/             # 路由页面
│   │   ├── project/           # 项目状态、类型和持久化客户端
│   │   ├── services/          # 流程、行为、预览和数据服务
│   │   └── style/             # 模块化样式
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
│   │   ├── routes/            # API 路由
│   │   └── index.ts           # 服务入口
│   └── data/                  # 上传、缓存、报告和配置
├── python-service/            # Python 数据分析与 ML 服务
│   ├── src/
│   │   ├── describe.py
│   │   └── ml_engine.py
│   ├── requirements.txt
│   └── setup.sh
├── projects/                  # 项目资产
│   ├── example/               # 可导入示例项目
│   └── data/                  # 后端项目持久化数据
├── docs/                      # 使用与事件参考文档
├── scripts/                   # 项目数据生成脚本
└── package.json               # 仓库统一命令入口
```

### 节点包约定

Vite 8 通过 `import.meta.glob('./*/schema.json')` 自动识别 `ui/nodes` 下的节点包。新增节点只需创建目录和 `schema.json`，无需再维护手写目录清单；存在 `index.ts` 时执行器按需加载，生产构建输出为独立的 `assets/nodes/<节点包>-<hash>.js` chunk。

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
