# FormFlow Studio v1.9.0

**Excel 表单编排框架** —— 数据驱动表单生成、流程编排、表单设计与运行时一体化工作台。

> 将 Excel / CSV / JSON / TSV / XML / Parquet 数据表转化为可交互的表单应用，支持数据库直连和 API 数据源，通过拖拽式节点编排数据处理流程，无需编写后端代码。

本仓库当前发布版本为 **1.9.0**。`main` 分支继续推进文档勘误与后续增强；详细变更见 [`CHANGELOG.md`](./CHANGELOG.md)。

## 先看这里

- 产品与能力概览：[`docs/readme/overview.md`](./docs/readme/overview.md)
- 带配图的新手教程：[`docs/readme/beginner-tutorial.md`](./docs/readme/beginner-tutorial.md)
- 安装、自有数据快速上手、FAQ 与使用场景：[`docs/readme/getting-started.md`](./docs/readme/getting-started.md)
- 智能体 / MCP / 离线项目包编辑：[`docs/readme/ai-project-editing.md`](./docs/readme/ai-project-editing.md)
- 技术栈、目录结构与项目包格式：[`docs/readme/project-layout.md`](./docs/readme/project-layout.md)
- 按大版本拆分的更新记录：[`docs/changelog/README.md`](./docs/changelog/README.md)

## v1.9.0 版本亮点

- **编辑器模式切换优化**：工作区标签统一为「数据 / 表单 / 规则 / 流程 / 测试 / 设置」，切换时保留面板上下文；规则与流程画布新增字段引用面板；`Cmd/Ctrl+1/2/3` 与 `Cmd/Ctrl+,` 快捷键。
- **编辑器引导与调试 UX**：诊断面板、组件检查器、数据流追踪、新手指引与空状态引导。
- **流程绑定 V2**：事件配置内直接选择流程并编辑输入/输出映射；稳定 I/O 字段 ID 支持字段改名不断链；映射完成度与风险显式展示，输出整体校验后原子回写。
- **统一数据变更入口**：REST、MCP 和表格批量写回共用 revision、幂等、访问控制和破坏性确认语义。
- **共享领域核心**：行为 DSL、属性表达式、字段推断、表单脚手架和事件契约集中到 `shared/formflow-core`。
- **文档中心升级**：多场景 Playground 与事件交叉引用、设计令牌统一、highlight.js 代码高亮；任务教程按“先校正文案语义，再验截图连续性”整改，规则语法 DSL Reference 完整化。
- **稳健性与可部署构建**：全面错误加固（前后端不因单个错误崩溃）、前端恢复与服务器监督；独立 TypeScript 边界生产构建；jsonrepair 自动修复畸形 JSON。

## 主开发分支（尚未发布）

- **文档全量审查与勘误**：按源码复核全部手册，修正节点数量（219 个节点包、11 个版本化宏）、项目包结构、MCP/LLM 端点与健康检查语义；补全分卷 changelog 缺失的 1.3.0–1.8.0 版本与操作模板目录；同步修正 CLAUDE.md / CODEX.md 中已移除的旧接口。

## 快速开始

macOS / Linux：

```bash
# 统一初始化 Node、pnpm、Python venv 和依赖
bash scripts/init-env.sh

# 启动开发服务器（前端 + 后端）
pnpm dev:all

# 完整校验（类型检查 + 单元/集成测试 + UI/Server 生产构建）
pnpm verify
```

Windows PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/init-env.ps1
pnpm dev:all
```

更多命令、首次使用流程和常见问题见 [`docs/readme/getting-started.md`](./docs/readme/getting-started.md)。

## 文档导航

- MCP / HTTP 工具说明：[`docs/llm-tools-mcp.md`](./docs/llm-tools-mcp.md)
- 项目编排规范：[`docs/project-creation-spec.md`](./docs/project-creation-spec.md)
- 行为事件参考：[`docs/behavior-event-reference.md`](./docs/behavior-event-reference.md)
- 规则语法参考：[`docs/behavior-rule-syntax.md`](./docs/behavior-rule-syntax.md)
- Mermaid 流程图规范：[`docs/readme/mermaid-flowchart-guidelines.md`](./docs/readme/mermaid-flowchart-guidelines.md)
- 大模型 Provider：[`docs/llm-provider.md`](./docs/llm-provider.md)
- pgvector 检索：[`docs/pgvector.md`](./docs/pgvector.md)

## License

MIT
