/**
 * DSL 质量门禁（Phase 4）：统一执行并汇总所有评价标准。
 * 门禁：符合性 100% · 差分分歧 0 · 模糊 0 crash · 变异得分 ≥90% ·
 *       基准（1000 规则 lint ≤2s）· 确定性哈希一致 · 文档一致性。
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { getConformanceCases } from '../shared/formflow-core/behaviorDsl/conformance/cases';
import { evaluateCase, coverageGaps } from '../shared/formflow-core/behaviorDsl/conformance/runner';
import { runFuzz } from '../shared/formflow-core/behaviorDsl/fuzzer';
import { compileBehaviorDsl } from '../shared/formflow-core/behaviorDsl/parser';
import { runMutationHarness } from './mutate-dsl';

const ROOT = resolve(import.meta.dirname, '..');

interface GateResult {
  name: string;
  pass: boolean;
  detail: string;
}

const gates: GateResult[] = [];

function runGate(name: string, fn: () => { pass: boolean; detail: string }) {
  const started = performance.now();
  try {
    const result = fn();
    gates.push({ name, pass: result.pass, detail: `${result.detail}（${Math.round(performance.now() - started)}ms）` });
  } catch (error) {
    gates.push({ name, pass: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

// 1) DSL 单测（符合性 / 差分 / 性质 / 静态分析 / 参考语义 / 模型检查 / 验证快照）
runGate('dsl-tests', () => {
  const executable = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  const result = spawnSync(executable, ['--test', join(ROOT, 'shared/formflow-core/behaviorDsl')], { stdio: 'pipe', encoding: 'utf8' });
  const tail = result.stdout.slice(-1200) + result.stderr.slice(-600);
  const pass = result.status === 0;
  return { pass, detail: pass ? '全部 DSL 单测通过' : `测试失败：${tail}` };
});

// 1b) 运行时差分（formLinkage ↔ 参考语义 + behaviorEngine 守卫/字段过滤）
runGate('runtime-differential', () => {
  const executable = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  const files = [
    join(ROOT, 'ui/src/services/engine/runtimeDifferential.test.ts'),
    join(ROOT, 'ui/src/services/engine/behaviorEngine.test.ts'),
    join(ROOT, 'ui/src/services/engine/formLinkage.test.ts'),
    join(ROOT, 'ui/src/services/engine/behaviorDsl-reference-differential.test.ts'),
  ];
  const result = spawnSync(executable, ['--test', ...files], { stdio: 'pipe', encoding: 'utf8' });
  const tail = result.stdout.slice(-1200) + result.stderr.slice(-600);
  const pass = result.status === 0;
  return { pass, detail: pass ? '运行时差分与 behaviorEngine 测试通过' : `测试失败：${tail}` };
});

// 2) 符合性 100% + FFR 覆盖
runGate('conformance', () => {
  const cases = getConformanceCases();
  const failed = cases.filter((def) => !evaluateCase(def).passed);
  const gaps = coverageGaps();
  return {
    pass: failed.length === 0 && gaps.length === 0,
    detail: `${cases.length} 个用例，失败 ${failed.length}，FFR 覆盖缺口 ${gaps.length}${failed.length ? `：${failed.map((item) => item.id).join('、')}` : ''}`,
  };
});

// 3) 模糊 + 差分：5,000 合法 + 1,000 变异，0 分歧 / 0 crash
runGate('fuzz-differential', () => {
  const summary = runFuzz(5000, 1000, 20260806);
  return {
    pass: summary.divergences.length === 0 && summary.crashes.length === 0,
    detail: `${summary.generated} 合法 + ${summary.mutated} 变异，分歧 ${summary.divergences.length}，crash ${summary.crashes.length}`,
  };
});

// 4) 变异得分 ≥ 90%
runGate('mutation', () => {
  const result = runMutationHarness();
  return {
    pass: result.score >= 0.9,
    detail: `变异得分 ${(result.score * 100).toFixed(1)}%（${result.killed}/${result.total}）${result.survived.length ? `，幸存 ${result.survived.map((item) => `${item.mutator}#${item.baseIndex}`).join('、')}` : ''}`,
  };
});

// 5) 基准：1000 条规则 lint ≤ 2000ms
runGate('benchmark', () => {
  const lines: string[] = [];
  for (let index = 0; index < 1000; index += 1) lines.push(`when $f${index} == ${index} -> set($g${index}, ${index + 1})`);
  const fields = [...Array.from({ length: 1000 }, (_, index) => `f${index}`), ...Array.from({ length: 1000 }, (_, index) => `g${index}`)];
  const started = performance.now();
  compileBehaviorDsl(lines.join('\n'), { fields });
  const elapsed = performance.now() - started;
  return { pass: elapsed <= 2000, detail: `1000 规则 lint 耗时 ${elapsed.toFixed(1)}ms（预算 2000ms）` };
});

// 6) 确定性：重复编译 byte 级一致
runGate('determinism', () => {
  const sample = 'when $部门 == "技术部" -> show(@tech); require($技术栈)\nelse -> hide(@tech); clear($技术栈)\ncompute $合计 = $数量 * $单价 watch($数量, $单价)';
  const first = createHash('sha256').update(JSON.stringify(compileBehaviorDsl(sample))).digest('hex');
  for (let index = 0; index < 20; index += 1) {
    const next = createHash('sha256').update(JSON.stringify(compileBehaviorDsl(sample))).digest('hex');
    if (next !== first) return { pass: false, detail: '编译产物哈希不一致' };
  }
  return { pass: true, detail: '20 次重复编译哈希一致' };
});

// 7) 文档一致性：EBNF 标注派生自 grammar.ts，FFR304-309 已入文档
runGate('docs-consistency', () => {
  const doc = readFileSync(join(ROOT, 'docs/behavior-rule-syntax.md'), 'utf8');
  const checks = [
    ['grammar.ts', doc.includes('grammar.ts')],
    ['FFR304', doc.includes('FFR304')],
    ['FFR305', doc.includes('FFR305')],
    ['FFR306', doc.includes('FFR306')],
    ['FFR307', doc.includes('FFR307')],
    ['FFR308', doc.includes('FFR308')],
    ['FFR309', doc.includes('FFR309')],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return { pass: missing.length === 0, detail: missing.length ? `文档缺少：${missing.join('、')}` : 'EBNF 派生标注与 FFR304-309 均已写入文档' };
});

const overallPass = gates.every((gate) => gate.pass);
console.log(JSON.stringify({ gates, overallPass }, null, 2));
process.exit(overallPass ? 0 : 1);
