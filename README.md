# FormFlow Studio v1.14.0

**Excel 表单编排框架** —— 数据驱动表单生成、流程编排、表单设计与运行时一体化工作台。

> 将 Excel / CSV / JSON / TSV / XML / Parquet 数据表转化为可交互的表单应用，支持数据库直连和 API 数据源，通过拖拽式节点编排数据处理流程，无需编写后端代码。

本仓库当前版本为 **1.14.0**（已发布 tag `v1.14.0`）。详细变更见 [`CHANGELOG.md`](./CHANGELOG.md) 与 [`docs/changelog/`](./docs/changelog/README.md)。

## 先看这里

- 产品与能力概览：[`docs/readme/overview.md`](./docs/readme/overview.md)
- 带配图的新手教程：[`docs/readme/beginner-tutorial.md`](./docs/readme/beginner-tutorial.md)
- 安装、自有数据快速上手、FAQ 与使用场景：[`docs/readme/getting-started.md`](./docs/readme/getting-started.md)
- 智能体 / MCP / 离线项目包编辑：[`docs/readme/ai-project-editing.md`](./docs/readme/ai-project-editing.md)
- 技术栈、目录结构与项目包格式：[`docs/readme/project-layout.md`](./docs/readme/project-layout.md)
- 按大版本拆分的更新记录：[`docs/changelog/README.md`](./docs/changelog/README.md)

## v1.14.0 版本亮点

- **Monaco 编辑器升级为 IDE 级辅助编程**：规则 DSL 新增悬停文档、参数提示、快速修复（旧式语法/无效引用/结构问题）、大纲与折叠、全量格式化、规则驱动内联补全（ghost text）与语义高亮；事件 JS 补齐字符串参数内上下文补全（字段/控件/表/流程/消息级别）、中文文档、ghost text、`await`/引用修复，并接入服务端 oxfmt 格式化（`POST /api/ai/code-format`）。
- **流程节点端口契约审计加固**（1.13.0 起持续）：外露端点与执行器消费/产出全部声明、动态端口按完整运行时类型系统解析（不再降级为 `any`）、真实项目全部工作流连线可被端口 schema 采纳的常驻审计。
- **智能体 V4 单循环与执行稳定性**（1.10.0–1.11.0）：`batchReads` 并行只读、瞬时错误/revision 冲突自动恢复、`replan`、artifact 转存与分段回读、上下文压缩、写任务检查点、回归测试门禁与模型自审、运行指标；模型路由按用途（plan/decision/summarize/verify）选路；新增一步建表 MCP 工具与全量工具示例。
- **数据工作台编辑自由度**（1.11.0）：自绘右键菜单、多行批量操作、拖拽行序、标签页内撤销/重做、自动保存开关；筛选入口移入列头并按数据类型提供专用输入与快捷操作（1.12.x）。
- **修复与稳定性**：流程画布 Monaco 空模型崩溃（本地装配 monaco + 每实例独立 model path）、节点 schema 与执行器契约清理（无用字段/行业定制字段）、CI 样例项目审计门槛与实际入库样例对齐；错误边界与运行时诊断支持可执行的「刷新/重试/修复」。

## 更新记录

最新开发变更记录在 [`docs/changelog/unreleased.md`](./docs/changelog/unreleased.md)；历史版本见 [`docs/changelog/v1.md`](./docs/changelog/v1.md)。

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
