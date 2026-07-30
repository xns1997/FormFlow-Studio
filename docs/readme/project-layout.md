# 技术栈与项目结构

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
| Python + LangGraph + Flask + gRPC | 独立大模型与 Agent Provider |
| PostgreSQL | Agent checkpoint 与分布式任务队列 |

大模型调用已拆分为独立 Provider，Express 继续负责配置、密钥、租户权限和业务工具执行。部署与接口见 [`../llm-provider.md`](../llm-provider.md)。

## 仓库结构

```text
├── ui/                         # React + TypeScript + Vite 8 前端
├── server/                     # Express 后端
├── shared/                     # 共享领域核心
├── llm-provider/               # 独立 Provider 服务
├── python-service/             # Python 数据分析与 ML 服务
├── projects/                   # 项目资产与示例
├── docs/                       # 使用、参考与拆分后的 README / CHANGELOG 文档
├── scripts/                    # 初始化与辅助脚本
├── CODEX.md                    # Codex / MCP 操作约束
└── package.json                # 仓库统一命令入口
```

更细的前端目录、文档系统、节点注册和样式分层，保留在历史说明中；如果后续需要完整树状结构，建议继续维护到本页，而不是再回填到根 `README.md`。

## 节点包约定

Vite 8 通过 `import.meta.glob('./*/schema.json')` 自动识别 `ui/nodes` 下的节点包。新增节点只需创建目录和 `schema.json`，无需再维护手写目录清单；存在 `index.ts` 时执行器按需加载，生产构建输出为独立的 `assets/nodes/<节点包>-<hash>.js` chunk。

## FormFlow v2 项目包约定

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

`project.json` 必须声明 `kind: "formflow-project"` 和 `formatVersion: 2`。浏览器导入导出的 `.zip` 与服务端磁盘目录 `.formflow` 使用相同内容结构，前端通过 ZIP 内部的 `project.json` 识别项目包。
