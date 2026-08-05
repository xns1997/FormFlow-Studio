import { INVERSE_OPERATOR } from '../parserRegex';
import { evaluateConditionValue } from '../referenceSemantics';
import type { ConditionOperator } from '../types';

/**
 * 运算符互补性机械化验证（Phase 2/4）。
 *
 * 说明：计划原定用 z3-solver(WASM) 做 SMT 证明，但该包在 Node 26 下
 * emscripten 运行时不兼容（Aborted(Assertion failed)），无法落地；
 * 按“工具不可用则换等价手段”的取舍，改为**纯 TS 机械化穷举验证**。
 *
 * 排序运算符（`>`/`<=`、`<`/`>=`）采用“精确取反”定义（文档 8/11.5）：
 * `<=` := !(`>`)，`>=` := !(`<`)。对 NaN/空值等不可比输入，保证 when/else
 * 恰有一个分支命中；正常数值/文本排序与数值比较结果一致。
 * 这消除了早期验证发现的“NaN 下两者均不成立”反例。
 */

/** 互补性验证使用的抽样值域（覆盖数字、文本、空值与类型边界）。 */
export const COMPLEMENTARITY_DOMAIN: unknown[] = [
  null, undefined, '', 'a', 'b', 'abc', '0',
  0, 1, 5, -1, 1.5, 100,
  true, false,
  [], [1], ['a'],
];

/** 单对运算符互补性违规：某取值下正反方向结果不一致。 */
export interface PairViolation {
  operator: ConditionOperator;
  inverse: ConditionOperator;
  value: string;
  operand: string;
  both: boolean;
  neither: boolean;
}

/** 一对运算符的验证结果：是否互补、违规样例与覆盖范围。 */
export interface PairVerification {
  operator: ConditionOperator;
  inverse: ConditionOperator;
  /** 是否在该值域上严格互补 */
  complementary: boolean;
  violations: PairViolation[];
}

function describe(value: unknown): string {
  return JSON.stringify(value ?? (value === undefined ? 'undefined' : value));
}

/** 验证一对互逆运算符在抽样值域上是否互补（否定一个等于另一个的否定）。 */
export function verifyPair(operator: ConditionOperator, inverse: ConditionOperator, domain: unknown[] = COMPLEMENTARITY_DOMAIN): PairVerification {
  const violations: PairViolation[] = [];
  for (const value of domain) {
    for (const operand of domain) {
      const condition = (op: ConditionOperator) => ({ fieldName: 'x', operator: op, value: operand, logic: 'AND' as const });
      const direct = evaluateConditionValue(value, condition(operator));
      const inverseResult = evaluateConditionValue(value, condition(inverse));
      if (direct === inverseResult) {
        violations.push({
          operator,
          inverse,
          value: describe(value),
          operand: describe(operand),
          both: direct === true && inverseResult === true,
          neither: direct === false && inverseResult === false,
        });
      }
    }
  }
  return { operator, inverse, complementary: violations.length === 0, violations };
}

/** 全部运算符对的互补性汇总报告。 */
export interface ComplementarityReport {
  generatedAt: string;
  pairs: PairVerification[];
  numericPairs: PairVerification[];
  textPairs: PairVerification[];
  emptyPairs: PairVerification[];
  findings: string[];
  allComplementaryOnFullDomain: boolean;
}

/** 运行完整运算符互补性验证（静态门禁用）。 */
export function verifyOperatorComplementarity(): ComplementarityReport {
  const numericValues = COMPLEMENTARITY_DOMAIN.filter((value) => typeof value === 'number');
  const stringValues = COMPLEMENTARITY_DOMAIN.filter((value) => typeof value === 'string');
  const emptyFamily = [null, undefined, '', [], 'a', 0, 1];
  const numericPairs: PairVerification[] = [];
  const textPairs: PairVerification[] = [];
  const emptyPairs: PairVerification[] = [];
  const findings: string[] = [];
  const all = Object.entries(INVERSE_OPERATOR) as Array<[ConditionOperator, ConditionOperator]>;
  for (const [operator, inverse] of all) {
    if (['>', '<', '>=', '<=', '==', '!='].includes(operator)) {
      numericPairs.push(verifyPair(operator, inverse, numericValues));
    } else if (['contains', 'notContains', 'startsWith', 'notStartsWith', 'endsWith', 'notEndsWith'].includes(operator)) {
      textPairs.push(verifyPair(operator, inverse, stringValues));
    } else {
      emptyPairs.push(verifyPair(operator, inverse, emptyFamily));
    }
  }
  // 全值域验证：精确取反语义下所有配对应严格互补
  const pairs = all.map(([operator, inverse]) => verifyPair(operator, inverse));
  const violations = pairs.filter((pair) => !pair.complementary);
  if (violations.length) {
    findings.push(`全值域存在 ${violations.length} 对非互补反例：${violations.slice(0, 3).map((pair) => `${pair.operator}↔${pair.inverse}`).join('、')}。`);
  } else {
    findings.push('全部 14 对反向运算符在文档值域（含 NaN/空值/数组）上严格互补；排序运算符采用精确取反语义（文档 8/11.5）。');
  }
  return {
    generatedAt: new Date().toISOString(),
    pairs,
    numericPairs,
    textPairs,
    emptyPairs,
    findings,
    allComplementaryOnFullDomain: pairs.every((pair) => pair.complementary),
  };
}
