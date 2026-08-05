import { compileBehaviorDsl } from '../parser';
import { CONFORMANCE_CASES, CONFORMANCE_FFR_CODES, type ConformanceCase } from './cases';
import type { BehaviorDslCompilation } from '../types';

/** 单个用例执行结果：DSL 编译/求值输出与预期对比。 */
export interface ConformanceResult {
  passed: boolean;
  problems: string[];
  compilation: BehaviorDslCompilation;
}

/** 执行单个一致性用例（输入 → 编译/求值 → 与期望断言）。 */
export function evaluateCase(def: ConformanceCase): ConformanceResult {
  const compilation = compileBehaviorDsl(def.source, def.context);
  const problems: string[] = [];
  const errors = compilation.diagnostics.filter((item) => item.severity === 'error');
  const warnings = compilation.diagnostics.filter((item) => item.severity === 'warning');
  if (def.expect.ok) {
    if (errors.length) problems.push(`期望无 error，实际 ${errors.map((item) => `${item.code}@${item.line}`).join('、')}`);
  }
  for (const code of def.expect.errorCodes || []) {
    if (!errors.some((item) => item.code === code)) problems.push(`缺少 error 诊断 ${code}`);
  }
  for (const code of def.expect.warningCodes || []) {
    if (!warnings.some((item) => item.code === code)) problems.push(`缺少 warning 诊断 ${code}`);
  }
  if (def.expect.ruleCount !== undefined && compilation.rules.length !== def.expect.ruleCount) {
    problems.push(`规则数期望 ${def.expect.ruleCount}，实际 ${compilation.rules.length}`);
  }
  return { passed: problems.length === 0, problems, compilation };
}

/**
 * 符合性覆盖：每个 FFR 码至少一个用例（FFR004/FFR309 无法经 DSL 文本触达，
 * 由静态分析单测覆盖；FFR004 为防御性死代码）。
 */
/** 返回尚未被一致性用例覆盖的 FFR 代码列表。 */
export function coverageGaps(): string[] {
  const covered = new Set<string>();
  for (const def of CONFORMANCE_CASES) {
    for (const code of [...(def.expect.errorCodes || []), ...(def.expect.warningCodes || [])]) covered.add(code);
  }
  const exempt = new Set(['FFR004', 'FFR309']);
  return CONFORMANCE_FFR_CODES.filter((code) => !covered.has(code) && !exempt.has(code));
}
