# FormFlow Studio v1.2.0

**Excel 表单编排框架** —— 数据驱动表单生成、流程编排、表单设计与运行时一体化工作台。

> 将 Excel / CSV / JSON 数据表转化为可交互的表单应用，通过拖拽式节点编排数据处理流程，无需编写后端代码。

本仓库当前发布版本为 **1.2.0**。本版本完成共享表单控件 Schema、设计预览、运行态表单、模板工作台和七领域 MCP 的交互收口，并为已纳入范围的 TODO 提供单测、服务端和 Playwright 证据；详细变更见 [`CHANGELOG.md`](./CHANGELOG.md)。

## 先看这里

- 产品与能力概览：[`docs/readme/overview.md`](./docs/readme/overview.md)
- 5 分钟上手、FAQ 与使用场景：[`docs/readme/getting-started.md`](./docs/readme/getting-started.md)
- 智能体 / MCP / 离线项目包编辑：[`docs/readme/ai-project-editing.md`](./docs/readme/ai-project-editing.md)
- 技术栈、目录结构与项目包格式：[`docs/readme/project-layout.md`](./docs/readme/project-layout.md)
- 按大版本拆分的更新记录：[`docs/changelog/README.md`](./docs/changelog/README.md)

## v1.2.0 质量收口

- 26 个注册表单控件统一使用可读的 Schema 帮助、默认值、校验、状态文案和高级参数折叠。
- 设计态、预览态和运行态共享属性契约；表单错误保留填写值、聚焦首个错误，失败操作提供就地重试和幂等保护。
- 项目创建、模板推荐、数据预览和分析运行统一空态、冲突、过期、部分成功与恢复入口。
- 质量门禁覆盖 TypeScript、生产构建、控件 Schema lint、服务端 HTTP 幂等测试及 Playwright 多窗口/主题/缩放矩阵。

## 主开发分支（尚未发布）

- **流程绑定 V2**：事件配置内直接选择流程并编辑输入/输出映射；稳定 I/O 字段 ID 支持字段改名不断链。
- **结果可预期**：映射编辑器显式展示完成度、自动匹配、未映射、失效、覆盖和类型风险；输出整体校验后原子回写。
- **统一数据变更入口**：REST、MCP 和表格批量写回共用 revision、幂等、访问控制和破坏性确认语义。
- **共享领域核心**：行为 DSL、属性表达式、字段推断、表单脚手架和事件契约集中到 `shared/formflow-core`。
- **可部署构建**：前端、服务端和测试使用独立 TypeScript 边界；生产构建同时生成 UI 与 Server 产物。

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
- 大模型 Provider：[`docs/llm-provider.md`](./docs/llm-provider.md)
- pgvector 检索：[`docs/pgvector.md`](./docs/pgvector.md)

## License

MIT
