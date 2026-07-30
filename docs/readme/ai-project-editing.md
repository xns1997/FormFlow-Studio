# 智能体项目创建与编辑

## 七领域 MCP

在线项目创建与编辑由七个专职 MCP 提供：

- `project`
- `data`
- `form`
- `workflow`
- `behavior`
- `quality`
- `delivery`

HTTP 使用 `/mcp/<role>`，stdio 使用 `formflow-mcp --role <role>`。原无角色聚合入口已移除。完整接口说明见 [`../llm-tools-mcp.md`](../llm-tools-mcp.md)。

仓库级调用约束、revision、幂等、确认与发布门禁，统一以根目录 [`../../CODEX.md`](../../CODEX.md) 为准。

## Codex 内置 skill

仓库内置了面向 Codex 的 FormFlow v2 skill：[`../../.codex/skills/formflow-project-editor/`](../../.codex/skills/formflow-project-editor/)。

它把“紧凑 YAML 意图”转换成规范化的 `.formflow` 目录和 ZIP，适合用于：

- 创建新项目
- 编辑现有项目
- 校验引用关系
- 确定性打包与解包

核心能力：

- `inspect`：读取目录或 ZIP，输出项目摘要、数据表、表单、行为、流程和引用关系
- `create`：根据 YAML 创建规范化 FormFlow v2 项目，并可同时输出 ZIP
- `normalize`：把现有项目映射到冻结的 v2 结构后，再按稳定 ID 应用增删改
- `validate`：检查 schema、ID、索引、引用、数据 key、流程端口和交付门禁
- `pack` / `unpack`：确定性打包和解包

常用命令：

```bash
node .codex/skills/formflow-project-editor/scripts/formflow-project.mjs \
  create ./project-spec.yaml \
  --out ./my-project.formflow

node .codex/skills/formflow-project-editor/scripts/formflow-project.mjs \
  validate ./my-project.formflow \
  --json

node .codex/skills/formflow-project-editor/scripts/formflow-project.mjs \
  inspect ./my-project.formflow
```

相关格式与规范：

- [`../../.codex/skills/formflow-project-editor/references/authoring-spec.md`](../../.codex/skills/formflow-project-editor/references/authoring-spec.md)
- [`../../.codex/skills/formflow-project-editor/references/v2-format.md`](../../.codex/skills/formflow-project-editor/references/v2-format.md)
- [`../../.codex/skills/formflow-project-editor/references/validation.md`](../../.codex/skills/formflow-project-editor/references/validation.md)

## 内置模板与示例项目

项目向导与 MCP `project.initialize` 共用四套可运行行业模板：

| 模板 ID | 名称 | 主路径 |
|---|---|---|
| `game_analytics` | 游戏数据分析 | 玩家、事件、付费与活动录入分析 |
| `flexible_employment` | 灵活就业分析 | 从业、工时、结算与保障分析 |
| `china_population_forecast` | 中国人口预测 | 历史口径与多情景预测 |
| `check_valve_selection` | 止回阀选型 | 工况录入、规则选型与结果看板 |

旧模板 ID `blank_form`、`data_entry`、`query_edit`、`approval_flow`、`data_dashboard` 会兼容映射到上述行业模板。

仓库默认不再携带批量生成的行业演示项目和 ZIP，以避免将大体积运行数据混入源码。`projects/data/equipment-inspection-fault-closed-loop-management.formflow/` 仅作为质量诊断的负向回归基线，不应作为生产模板导入。
