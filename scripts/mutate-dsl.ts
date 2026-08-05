/**
 * DSL 级变异测试（Phase 4）：对合法 DSL 程序做“语义变异”
 * （运算符反转、watch 字段删除、else 删除、引用替换、动作替换、参数删除），
 * 用编译结果（规则 JSON + 诊断码）作为 oracle：
 * - 变异后输出与基线不同 → 被杀死（killed）；
 * - 输出相同 → 幸存（survived），即测试/校验盲区。
 * 目标：DSL 核心变异得分 ≥ 90%。
 */

import { compileBehaviorDsl } from '../shared/formflow-core/behaviorDsl/parser';
import type { BehaviorDslCompilation } from '../shared/formflow-core/behaviorDsl/types';
import { pathToFileURL } from 'node:url';

const BASES: string[] = [
  'when $部门 == "技术部" -> show(@tech); require($技术栈)\nelse -> hide(@tech); clear($技术栈)',
  'compute $合计 = $数量 * $单价 watch($数量, $单价)',
  'on change($省份) -> options($城市, "city_table", "省份", $省份)',
  'before submit -> require($姓名, $手机号); validate($邮箱, email); length($姓名, 2, 20)',
  'before click("lookup") -> requireAny($教师ID, $姓名)',
  'on load -> set($状态, "草稿"); set($创建方式, "手动录入")',
  'on submit -> run("save_employee"); message("提交完成", success)',
  'when $编号 starts with "CN" -> message("国内编号", info)\nelse -> message("其他编号", info)',
];

type Mutator = (source: string) => string | null;

function swapIn(source: string, before: string, after: string): string | null {
  if (!source.includes(before)) return null;
  return source.split(before).join(after);
}

function replacePattern(source: string, pattern: RegExp, replacement: string): string | null {
  if (!pattern.test(source)) return null;
  return source.replace(pattern, replacement);
}

const MUTATORS: Array<{ name: string; apply: Mutator }> = [
  { name: 'operator-flip-eq', apply: (s) => swapIn(s, '==', '!=') },
  { name: 'operator-flip-contains', apply: (s) => swapIn(s, 'contains', 'not contains') },
  { name: 'operator-flip-starts', apply: (s) => swapIn(s, 'starts with', 'not starts with') },
  { name: 'watch-drop-one', apply: (s) => replacePattern(s, /watch\((\$[^,\)]+),\s*(\$[^\)]+)\)/, 'watch($1)') },
  { name: 'else-remove', apply: (s) => (s.includes('\nelse') ? s.split('\nelse')[0] : null) },
  { name: 'ref-swap-department-stack', apply: (s) => (s.includes('$部门') && s.includes('$技术栈') ? swapIn(swapIn(s, '$部门', '\u0000'), '$技术栈', '$部门')?.split('\u0000').join('$技术栈') ?? null : null) },
  { name: 'action-show-to-hide', apply: (s) => swapIn(s, 'show(', 'hide(') },
  { name: 'action-hide-to-show', apply: (s) => swapIn(s, 'hide(', 'show(') },
  { name: 'action-require-to-optional', apply: (s) => swapIn(s, 'require($', 'optional($') },
  { name: 'action-set-to-clear', apply: (s) => swapIn(s, 'set(', 'clear(') },
  { name: 'action-run-to-message', apply: (s) => swapIn(s, 'run(', 'message(') },
  { name: 'action-requireany-to-require', apply: (s) => swapIn(s, 'requireAny(', 'require(') },
  { name: 'arg-drop-show', apply: (s) => replacePattern(s, /show\(([^,)]+),\s*([^)]+)\)/, 'show($1)') },
  { name: 'arg-drop-watch', apply: (s) => replacePattern(s, /watch\((\$[^,\)]+),\s*(\$[^\)]+)\)/, 'watch($1)') },
  { name: 'keyword-arrow-corrupt', apply: (s) => swapIn(s, '->', '=>') },
  { name: 'condition-value-corrupt', apply: (s) => replacePattern(s, /==\s*"技术部"/, '== "产品部"') },
  { name: 'message-level-corrupt', apply: (s) => swapIn(s, 'info)', 'warning)') },
];

function signature(compilation: BehaviorDslCompilation): string {
  return JSON.stringify({
    rules: compilation.rules,
    codes: compilation.diagnostics.map((item) => `${item.code}@${item.line}:${item.severity}`).sort(),
  });
}

export interface MutationResult {
  total: number;
  killed: number;
  survived: Array<{ baseIndex: number; mutator: string; source: string }>;
  score: number;
}

/** 运行 DSL 变异测试工具（稳健性门禁）。 */
export function runMutationHarness(bases: string[] = BASES): MutationResult {
  const survived: MutationResult['survived'] = [];
  let total = 0;
  let killed = 0;
  bases.forEach((base, baseIndex) => {
    const baseline = signature(compileBehaviorDsl(base));
    for (const mutator of MUTATORS) {
      const mutant = mutator.apply(base);
      if (mutant === null || mutant === base) continue;
      total += 1;
      const mutated = signature(compileBehaviorDsl(mutant));
      if (mutated === baseline) survived.push({ baseIndex, mutator: mutator.name, source: mutant });
      else killed += 1;
    }
  });
  return { total, killed, survived, score: total === 0 ? 1 : killed / total };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runMutationHarness();
  console.log(JSON.stringify({
    total: result.total,
    killed: result.killed,
    score: Number(result.score.toFixed(4)),
    survived: result.survived,
    pass: result.score >= 0.9,
  }, null, 2));
  process.exit(result.score >= 0.9 ? 0 : 1);
}
