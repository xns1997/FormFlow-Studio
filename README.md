# FormFlow Studio v1.7.0

**Excel 表单编排框架** —— 数据驱动表单生成、流程编排、表单设计与运行时一体化工作台。

> 将 Excel / CSV / JSON / TSV / XML / Parquet 数据表转化为可交互的表单应用，支持数据库直连和 API 数据源，通过拖拽式节点编排数据处理流程，无需编写后端代码。

本仓库当前发布版本为 **1.7.0**。本版本全面增强数据预览功能：新增多种文件类型支持、AG Grid 虚拟滚动性能优化、筛选交互中文化、数据概览图表可视化、配置 UI 重组；详细变更见 [`CHANGELOG.md`](./CHANGELOG.md)。

## 先看这里

- 产品与能力概览：[`docs/readme/overview.md`](./docs/readme/overview.md)
- 5 分钟上手、FAQ 与使用场景：[`docs/readme/getting-started.md`](./docs/readme/getting-started.md)
- 智能体 / MCP / 离线项目包编辑：[`docs/readme/ai-project-editing.md`](./docs/readme/ai-project-editing.md)
- 技术栈、目录结构与项目包格式：[`docs/readme/project-layout.md`](./docs/readme/project-layout.md)
- 按大版本拆分的更新记录：[`docs/changelog/README.md`](./docs/changelog/README.md)

## v1.7.0 数据预览增强

- **多格式支持**：新增 TSV、XML、Parquet 文件解析；支持 MySQL/PostgreSQL 数据库直连和 REST API 数据源，连接信息加密存储。
- **虚拟滚动**：AG Grid 切换到 Server-Side Row Model，支持大数据量（10万+行）流畅浏览；服务端索引/缓存加速筛选排序。
- **筛选优化**：新增工具栏下方筛选条，筛选类型纯中文显示并按数据类型分组，支持双向管理筛选条件。
- **数据概览**：顶部自动生成洞察式摘要；新增质量雷达图、缺失值分布、箱线图、饼图、相关性热力图等 7 种图表。
- **配置重组**：配置面板分组为可折叠 sections，新增列宽变更追踪（仅记录手动拖拽），支持重置单列/全部列宽。

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
