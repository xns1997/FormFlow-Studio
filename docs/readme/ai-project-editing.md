# 智能体项目创建与编辑

## 项目智能体（V4 单循环）

在线智能体采用**单一主循环**（类 Codex 架构），端点挂载于 `/api/ai/project-agent/v4`：

- `POST /threads` 建立线程，`POST /threads/:id/turns` 发起一轮（plan 或执行），`POST /threads/:id/plan/confirm|reject` 确认/拒绝目标契约，`POST /threads/:id/operations/:operationId/decision` 处理破坏性操作确认，`POST /threads/:id/control` 与 `/steer` 控制暂停/停止/转向，`GET /threads/:id/events` 以 SSE 或 JSON 读取带单调 `seq` 的事件流。
- 线程持有单一活跃计划（goal、successCriteria、任务清单）。每个任务归属一个 MCP 角色作用域；智能体每次迭代选择一个作用域内的工具执行，写前自动刷新 revision，删除/覆盖等待用户确认。
- 七个领域以 skill 形式组织（项目/数据/表单/流程/行为/质量/交付），决策提示词先展示 skill 目录，进入某领域后注入该 skill 全文与实时工具目录；能力包中的 agents 降级为作用域配置（指令 + 工具白名单 + 知识）。
- 确定性门禁：写任务通过前必须 `project.validate`；线程完成必须通过结构校验与计划包含的质量/交付预检（`release.preview`）；`release.apply` 永远不可调用。
- 终止语义：连续两步无进展暂停提问；同一阻塞条件连续三次标记 blocked；决策步预算超限暂停。
- 自主与可靠性增强（v2.7+）：一步决策可批量并行最多 3 个只读工具（`batchReads`）；瞬时错误与 revision 冲突自动恢复（消耗 `maxRecoveryCycles`）；执行中可 `replan` 只重规划剩余任务；大工具结果转存 artifact 并可用 `context.read_artifact` 分段回读；超长提示词触发结构化上下文压缩；写任务首次执行前自动建检查点，暂停/受阻后可一键恢复到最近检查点；写计划完成前必须运行回归测试（预存失败不阻塞、引入失败必须修复）并通过模型自审；每 turn 记录运行指标（模型调用/工具/无效比/重试/压缩/暂停），线程页状态栏与管理员 `/metrics` 可见。

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

```mermaid
flowchart TD
  A["确认目标契约"] --> B["选择专职 MCP 角色"]
  B --> C["读取项目与 revision"]
  C --> D["执行领域修改"]
  D --> E["质量校验 / 打包预检"]
```

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
