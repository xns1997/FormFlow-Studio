# 智能体评测语料与基线（Agent Eval）

> 目的：用可重复的任务量化 v4 项目智能体的「智能程度与自主性」，
> 支撑先测后改、基线后定标的迭代验收。

## 运行方式（双轨）

1. **Mock 双轨（CI 确定性）**：`scripts/e2e-agent-run.mjs` 使用脚本化/模拟 provider 跑 `corpus.json`，
   断言事件流与项目终态；不依赖真实模型，每次提交可跑。
2. **真实模型轨（基线/验收）**：对 `corpus.json` 每项用真实 mimo（default-cloud）跑一遍，
   把完整 transcript（事件流 + 指标 + 项目终态）保存到 `transcripts/<taskId>-<yyyyMMdd>.json`，
   并更新 `baseline.md`。transcript 是仓库资产，用于对比迭代前后。

## 指标口径

来自线程 `turnMetrics` 与事件流（`server/sql/006_agent_metrics.sql`）：

- 一次完成率：单个任务在 0 次人工接管下 `completed` 的比例；
- 无进展暂停次数 / 写任务；
- 无效工具调用比：`invalidToolCalls / toolCalls`；
- 写计划完成前测试执行率：final gates 内 `project_test.run` 是否执行（事件 `gate_evidence` 含 scenario_result）；
- 自动恢复次数（`recovery_retry`）、上下文压缩次数（`context_compacted`）、审批触发/拒绝。

## 能力探针（mimo 下限）

在跑基线前，用 `scripts/probe-model.mjs`（可选用真实连接）实测：

- 结构化 JSON 可靠性：同 prompt 重复 20 次，统计解析/校验失败率（目标 <5%）；
- 长上下文稳定性：40k+ 字符上下文下决策输出是否稳定；
- 原生工具调用：`tools` 能力是否可用、参数质量（决定是否开启 native tool calling）。

## 验收定标

基线报告冻结后按建议区间验收：

- golden 一次完成率 ≥80% 或较基线 +15pp（取更严）；
- 无进展暂停 ≤1 次/写任务；
- 无效工具调用比 ≤15%；
- 写计划完成前测试执行率 100%；
- 上下文压缩后回归无退化；检查点可恢复。
