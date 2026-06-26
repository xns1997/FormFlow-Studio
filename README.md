# FormFlow Studio

Excel 表单编排框架 —— 可视化流程编排 + 表单设计器 + 数据预览 + 测试运行

## 功能

- **数据预览**: 上传 Excel/CSV/JSON，自动识别表头、字段类型、数据概览
- **流程编排**: 拖拽式节点画布，68+ 个节点类型，支持数据流传递
- **表单设计**: 所见即所得设计器，14 种控件，支持数据源绑定
- **行为定义**: 脚本编辑器 + 行为引擎，支持条件判断、赋值、校验等
- **测试运行**: 完整的表单预览 + 运行时状态 + 变更记录 + 导出

## 技术栈

- React 19 + TypeScript
- Vite
- @xyflow/react (流程画布)
- AG Grid (数据表格)
- Monaco Editor (代码编辑)
- Zustand (状态管理)
- SheetJS (Excel 读写)

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器 (前端 + 后端)
pnpm dev:all

# 或分别启动
pnpm dev        # 前端 (Vite)
pnpm server     # 后端 (Express)

# 构建
pnpm build

# 类型检查
pnpm typecheck
```

## 项目结构

```
├── src/
│   ├── components/    # 通用组件 (FormRenderer, CodeEditor, RangeSelector...)
│   ├── designer/      # 表单设计器 (控件、画布、属性面板)
│   ├── models/        # TypeScript 类型定义
│   ├── pages/         # 页面组件 (数据预览、流程编排、表单设计...)
│   ├── services/      # 服务层 (流程引擎、行为引擎、校验器...)
│   ├── project/       # 项目管理 (store, types, manager)
│   └── style/         # CSS 样式 (模块化拆分)
├── nodes/
│   ├── registry.ts    # 节点注册表
│   ├── executor-registry.ts  # 执行器注册表
│   ├── port-types.ts  # 27 种端口类型 + 校验器
│   ├── executors/     # 节点执行器 (generic, behavior, func, scenario)
│   ├── generic-*/     # 通用节点 (文件选择器、工作表选择器...)
│   ├── behavior-*/    # 行为节点 (条件、赋值、校验...)
│   ├── func-*/        # 功能节点 (样式、图表、数据操作...)
│   └── xlsx-*/        # XLSX 方法节点
├── server/            # Express 后端 (文件上传、数据查询)
└── dist/              # 构建输出
```

## 节点类型

| 类别 | 数量 | 说明 |
|------|------|------|
| Generic | 8 | 文件选择器、工作表选择器、输入/输出 |
| Behavior | 27 | 触发器、条件、赋值、校验、提交等 |
| Func | 27 | 样式、图表、数据操作、表单控件 |
| Scenario | 5 | 场景封装 (Excel→JSON、导出等) |
| XLSX Method | 100+ | SheetJS 底层方法 |

## 数据流

```
数据预览 → 流程编排 → 表单设计 → 测试运行
   ↓           ↓           ↓          ↓
 上传文件    节点连接    控件绑定    行为触发
 字段识别    数据传递    数据源      变更记录
 数据概览    类型校验    RangeRef    导出结果
```

## License

MIT
