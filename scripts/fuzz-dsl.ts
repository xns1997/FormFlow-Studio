/**
 * GAST 驱动的 DSL 模糊测试（Phase 1 流水线）：
 * 合法输入 10,000 条 + 变异输入 2,000 条，断言 0 crash / 0 差分分歧。
 */

import { runFuzz } from '../shared/formflow-core/behaviorDsl/fuzzer';

const validCount = Number(process.env.DSL_FUZZ_VALID || 10_000);
const mutatedCount = Number(process.env.DSL_FUZZ_MUTATED || 2_000);
const started = Date.now();
const summary = runFuzz(validCount, mutatedCount);
const elapsedMs = Date.now() - started;
console.log(JSON.stringify({
  generated: summary.generated,
  mutated: summary.mutated,
  divergences: summary.divergences.slice(0, 10),
  crashes: summary.crashes.slice(0, 10),
  elapsedMs,
  pass: summary.divergences.length === 0 && summary.crashes.length === 0,
}, null, 2));
process.exit(summary.divergences.length === 0 && summary.crashes.length === 0 ? 0 : 1);
