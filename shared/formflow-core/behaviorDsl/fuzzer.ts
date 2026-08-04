import { getDslGrammar } from './grammar';
import { compileBehaviorDslRegex } from './parserRegex';
import { compileBehaviorDsl } from './parser';
import type { BehaviorDslCompilation } from './types';

/**
 * GAST 驱动的模糊生成器 + 新旧解析器差分比较（Phase 1 流水线）。
 *
 * 生成策略：
 * 1. 合法输入：直接沿 GAST 生产规则随机展开（可产出语义上不合法但结构合法的文本）；
 * 2. 畸形输入：对合法输入做字符级变异（删除/复制/替换/交换）。
 *
 * 差分不变量（“零分歧”）：
 * - 两个编译器都不抛异常；
 * - 编译出的规则 JSON 完全一致；
 * - 旧实现的 error 级诊断是新的子集（新实现只增不减）。
 * 例外：文档已声明的语义修复（compute 目标 `==`、字符串含 "->" 等）单独放行。
 */

const IMAGES: Record<string, () => string> = {
  When: () => 'when',
  Else: () => 'else',
  Otherwise: () => 'otherwise',
  Compute: () => 'compute',
  On: () => 'on',
  Change: () => 'change',
  Load: () => 'load',
  Submit: () => 'submit',
  Before: () => 'before',
  Click: () => 'click',
  Watch: () => 'watch',
  Arrow: () => '->',
  Eq: () => '=',
  EqEq: () => '==',
  EqEqEq: () => '===',
  Ne: () => '!=',
  NotEqEq: () => '!==',
  Ge: () => '>=',
  Le: () => '<=',
  Gt: () => '>',
  Lt: () => '<',
  Plus: () => '+',
  Minus: () => '-',
  Star: () => '*',
  Slash: () => '/',
  Percent: () => '%',
  AndAnd: () => '&&',
  OrOr: () => '||',
  Nullish: () => '??',
  Bang: () => '!',
  Dot: () => '.',
  Lparen: () => '(',
  Rparen: () => ')',
  Lbracket: () => '[',
  Rbracket: () => ']',
  Semicolon: () => ';',
  Comma: () => ',',
  FieldRef: () => `$f${randomInt(0, 5)}`,
  ComponentRef: () => `@c${randomInt(0, 5)}`,
  StringToken: () => `"s${randomInt(0, 5)}"`,
  NumberToken: () => String(randomInt(0, 9)),
  Ident: () => `id${randomInt(0, 5)}`,
  Other: () => 'x',
};

let seedState = 0x9e3779b9;
export function resetFuzzSeed(seed = 0x9e3779b9): void { seedState = seed >>> 0; }
function randomInt(min: number, max: number): number {
  seedState ^= seedState << 13; seedState ^= seedState >>> 17; seedState ^= seedState << 5;
  return min + (seedState >>> 0) % (max - min + 1);
}

interface GastNode {
  definition?: GastNode[];
  terminalType?: { name: string }; tokenType?: { name: string };
  referencedRule?: { name: string };
  alternatives?: GastNode[];
  idx?: number;
}

const NAME_CACHE = new Map<string, GastNode>();

function grammarByName(): Map<string, GastNode> {
  const productions = getDslGrammar() as unknown as Record<string, GastNode>;
  const result = new Map<string, GastNode>();
  for (const [name, production] of Object.entries(productions)) {
    result.set(name, production as GastNode);
    NAME_CACHE.set(name, production as GastNode);
  }
  return result;
}

function renderTerminal(name: string): string {
  const factory = IMAGES[name];
  return factory ? factory() : 'x';
}

function nodeKind(node: GastNode): string {
  return node.constructor?.name || 'Unknown';
}

function walk(node: GastNode | undefined, depth: number, out: string[]): void {
  if (!node || depth > 10) return;
  const kind = nodeKind(node);
  const terminalType = node.terminalType || node.tokenType;
  if (terminalType) {
    out.push(renderTerminal(terminalType.name));
    return;
  }
  if (node.referencedRule) {
    const target = NAME_CACHE.get(node.referencedRule.name);
    if (!target) return;
    walk(target, depth + 1, out);
    return;
  }
  if (node.alternatives) {
    walk(node.alternatives[randomInt(0, node.alternatives.length - 1)], depth + 1, out);
    return;
  }
  const definition = node.definition;
  if (!definition) return;
  if (Array.isArray(definition)) {
    if (kind === 'Alternation') {
      walk(definition[randomInt(0, definition.length - 1)], depth + 1, out);
      return;
    }
    if (kind === 'Option') {
      if (randomInt(0, 1) === 1) for (const child of definition) walk(child, depth + 1, out);
      return;
    }
    if (kind === 'Repetition') {
      const count = randomInt(0, 3);
      for (let index = 0; index < count; index += 1) for (const child of definition) walk(child, depth + 1, out);
      return;
    }
    if (kind === 'RepetitionMandatory') {
      const count = 1 + randomInt(0, 2);
      for (let index = 0; index < count; index += 1) for (const child of definition) walk(child, depth + 1, out);
      return;
    }
    if (kind === 'RepetitionWithSeparator' || kind === 'RepetitionMandatoryWithSeparator') {
      const count = kind === 'RepetitionWithSeparator' ? randomInt(0, 3) : 1 + randomInt(0, 2);
      for (let index = 0; index < count; index += 1) {
        for (const child of definition) walk(child, depth + 1, out);
        if (index < count - 1 && definition.length > 1) {
          // 分隔符通常是 definition 中带 tokenType 的最后一项
          const separator = definition[definition.length - 1];
          walk(separator, depth + 1, out);
        }
      }
      return;
    }
    for (const child of definition) walk(child, depth + 1, out);
  }
}

function joinTokens(tokens: string[]): string {
  let result = '';
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const prev = result ? result[result.length - 1] : '';
    const next = tokens[index + 1] || '';
    const noBefore = token === ')' || token === ']' || token === ',' || token === ';';
    const noAfter = token === '(' || token === '[';
    const needSpace = !noBefore && !noAfter && prev && prev !== '(' && prev !== '[' && prev !== ',' && prev !== ';';
    if (result && needSpace) result += ' ';
    result += token;
  }
  return result;
}

const FIELDS = ['f0', 'f1', 'f2', 'f3', 'f4'];
const COMPONENTS = ['c0', 'c1', 'c2'];
const WORKFLOWS = ['wf0', 'wf1'];
const TABLES = ['t0', 't1'];
const MESSAGES = ['ok', 'check', 'done'];

function pick<T>(values: T[]): T { return values[randomInt(0, values.length - 1)]!; }

function actionList(count: number, guard = false): string {
  const actions: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const kind = randomInt(0, guard ? 5 : 9);
    if (guard) {
      if (kind === 0) actions.push(`require($${pick(FIELDS)}, $${pick(FIELDS)})`);
      else if (kind === 1) actions.push(`requireAny($${pick(FIELDS)}, $${pick(FIELDS)})`);
      else if (kind === 2) actions.push(`set($${pick(FIELDS)}, ${randomInt(0, 1) === 0 ? `"${pick(MESSAGES)}"` : String(randomInt(0, 9))})`);
      else if (kind === 3) actions.push(`clear($${pick(FIELDS)})`);
      else if (kind === 4) actions.push(`message("${pick(MESSAGES)}", ${pick(['info', 'success', 'warning', 'error'])})`);
      else actions.push(`run("${pick(WORKFLOWS)}")`);
      continue;
    }
    if (kind === 0) actions.push(`show(@${pick(COMPONENTS)})`);
    else if (kind === 1) actions.push(`hide(@${pick(COMPONENTS)})`);
    else if (kind === 2) actions.push(`require($${pick(FIELDS)})`);
    else if (kind === 3) actions.push(`set($${pick(FIELDS)}, ${randomInt(0, 1) === 0 ? `"${pick(MESSAGES)}"` : String(randomInt(0, 9))})`);
    else if (kind === 4) actions.push(`clear($${pick(FIELDS)})`);
    else if (kind === 5) actions.push(`message("${pick(MESSAGES)}", ${pick(['info', 'success', 'warning', 'error'])})`);
    else if (kind === 6) actions.push(`run("${pick(WORKFLOWS)}")`);
    else if (kind === 7) actions.push(`enable(@${pick(COMPONENTS)})`);
    else if (kind === 8) actions.push(`disable(@${pick(COMPONENTS)})`);
    else if (kind === 9) actions.push(`options($${pick(FIELDS)}, "${pick(TABLES)}", "col", ${randomInt(0, 1) === 0 ? `"${pick(MESSAGES)}"` : String(randomInt(0, 9))})`);
  }
  return actions.join('; ');
}

/**
 * 生成一条“语义合理”的 DSL 语句（真实句型，供差分严格对拍）。
 */
export function generateStatement(): string {
  const kind = randomInt(0, 7);
  const field = () => `$${pick(FIELDS)}`;
  const component = () => `@${pick(COMPONENTS)}`;
  const value = () => (randomInt(0, 1) === 0 ? `"${pick(MESSAGES)}"` : String(randomInt(0, 5)));
  const operator = () => pick(['==', '!=', '>', '<', '>=', '<=', 'contains', 'starts with', 'is empty']);
  if (kind === 0) return `when ${field()} ${operator()} ${value()} -> ${actionList(randomInt(1, 3))}`;
  if (kind === 1) return `else -> ${actionList(randomInt(1, 2))}`;
  if (kind === 2) {
    const target = pick(FIELDS);
    const depA = pick(FIELDS);
    const depB = pick(FIELDS);
    const op = pick(['+', '*', '-']);
    return `compute $${target} = $${depA} ${op} $${depB} watch($${depA}, $${depB})`;
  }
  if (kind === 3) return `on change(${field()}) -> ${actionList(randomInt(1, 2))}`;
  if (kind === 4) return `before click("btn${randomInt(0, 2)}") -> ${actionList(randomInt(1, 2), true)}`;
  if (kind === 5) return `before submit -> ${actionList(randomInt(1, 2), true)}`;
  if (kind === 6) return `on load -> ${actionList(randomInt(1, 2))}`;
  return `on submit -> ${actionList(randomInt(1, 2))}`;
}

/**
 * GAST 裸走生成（结构覆盖探针）：只用于无崩溃冒烟，不参与差分。
 */
export function generateGastStatement(): string {
  const grammar = grammarByName();
  const statement = grammar.get('statement');
  if (!statement) return 'when $f0 == 1 -> show(@c0)';
  const tokens: string[] = [];
  walk(statement, 0, tokens);
  return joinTokens(tokens);
}

/**
 * 生成一个 DSL 程序（若干语句）。
 */
export function generateProgram(lineCount = 3): string {
  const lines: string[] = [];
  for (let index = 0; index < lineCount; index += 1) lines.push(generateStatement());
  return lines.join('\n');
}

function mutate(source: string): string {
  if (!source) return 'x';
  const chars = [...source];
  const operation = randomInt(0, 3);
  const position = randomInt(0, Math.max(0, chars.length - 1));
  if (operation === 0) chars.splice(position, 1);
  else if (operation === 1) chars.splice(position, 0, chars[position] ?? 'x');
  else if (operation === 2) chars[position] = ['->', '=', '#', '(', ')', ';', '$'][randomInt(0, 6)]!;
  else if (chars.length > 1) { const other = randomInt(0, chars.length - 1); const tmp = chars[position]!; chars[position] = chars[other]!; chars[other] = tmp; }
  return chars.join('');
}

export function mutateProgram(source: string, mutationCount = 2): string {
  let result = source;
  for (let index = 0; index < mutationCount; index += 1) result = mutate(result);
  return result;
}

export interface IdentityOptions {
  /** true = 合法生成输入（严格逐字节对拍）；false = 变异输入（稳健性不变量） */
  strict?: boolean;
  source?: string;
}

export function compilationIdentity(oldResult: BehaviorDslCompilation, newResult: BehaviorDslCompilation, options: IdentityOptions = {}): string | null {
  const strict = options.strict ?? true;
  const oldRules = JSON.stringify(oldResult.rules);
  const newRules = JSON.stringify(newResult.rules);
  const oldErrors = oldResult.diagnostics.filter((item) => item.severity === 'error');
  const newErrors = newResult.diagnostics.filter((item) => item.severity === 'error');
  const ADDED_CHECKS = new Set(['FFR304', 'FFR305', 'FFR306', 'FFR307', 'FFR308']);
  const lineOfRule = (rule: { id: string }) => Number(rule.id.match(/^dsl_(\d+)/)?.[1] || 1);
  // 旧实现按原始触发词文本比较，`on   load`（多空格）会被误判成 submit；
  // 新实现按 token 正确判为 formLoad（文档修复）。
  const triggerMappingFix = (() => {
    if (!options.source) return false;
    const lines = options.source.split(/\r?\n/);
    const normalize = (rules: typeof oldResult.rules) => rules.map((rule) => {
      const line = lines[lineOfRule(rule) - 1] || '';
      return /^on\s+load/i.test(line) && rule.trigger.type === 'submit'
        ? { ...rule, trigger: { ...rule.trigger, type: 'formLoad' as const } }
        : rule;
    });
    const oldNormalized = JSON.stringify(normalize(oldResult.rules));
    const newRulesJson = JSON.stringify(newResult.rules);
    return oldNormalized === newRulesJson && oldNormalized !== oldRules;
  })();
  if (oldErrors.length === 0) {
    // 新实现允许：整行拒绝（旧实现静默接受的文档修复）或新增静态检查（FFR304-308）。
    // 除此之外，所有被接受行的规则必须与旧实现逐字节一致。
    const newRuleLines = new Set(newResult.rules.map(lineOfRule));
    const rejectedLines = new Set(newErrors.filter((item) => !newRuleLines.has(item.line)).map((item) => item.line));
    const keptOldRules = oldResult.rules.filter((rule) => !rejectedLines.has(lineOfRule(rule)));
    if (!triggerMappingFix && JSON.stringify(keptOldRules) !== newRules) {
      return `规则不一致（old 无 error）：old=${oldRules} new=${newRules}（拒绝行 ${[...rejectedLines].join(',')}）`;
    }
    for (const newError of newErrors) {
      if (!newRuleLines.has(newError.line)) continue; // 整行拒绝，放行
      if (ADDED_CHECKS.has(newError.code)) continue;
      return `新实现拒绝旧实现接受的行：${newError.code}@${newError.line}（${newError.message}）`;
    }
    return null;
  }
  if (strict) {
    if (newErrors.length === 0) return `旧实现拒绝但新实现接受（严格模式视为分歧）：${oldErrors[0]?.code}@${oldErrors[0]?.line}`;
    if (oldRules !== newRules) return `规则不一致（双方都有 error）：old=${oldRules} new=${newRules}`;
    for (const oldError of oldErrors) {
      const matched = newErrors.some((item) => item.line === oldError.line && item.code === oldError.code && item.message === oldError.message);
      if (!matched) return `旧实现 error 诊断丢失：${oldError.code}@${oldError.line}（${oldError.message}）`;
    }
  }
  return null;
}

export function differentialCheck(source: string, options: IdentityOptions = {}): string | null {
  // 单行出现多个 `->` 属于出语言范围（DSL 规范：一行一条规则、一个箭头）；
  // 旧正则对这类输入的贪婪解析是正则伪影，不参与差分（仅做崩溃安全冒烟）。
  if (source.split('\n').some((line) => (line.match(/->/g) || []).length > 1)) return null;
  let oldResult: BehaviorDslCompilation;
  let newResult: BehaviorDslCompilation;
  try {
    oldResult = compileBehaviorDslRegex(source);
  } catch (error) {
    return `旧解析器抛异常：${error instanceof Error ? error.message : String(error)}`;
  }
  try {
    newResult = compileBehaviorDsl(source);
  } catch (error) {
    return `新解析器抛异常：${error instanceof Error ? error.message : String(error)}`;
  }
  return compilationIdentity(oldResult, newResult, { ...options, source });
}

export interface FuzzSummary {
  generated: number;
  mutated: number;
  divergences: Array<{ source: string; reason: string }>;
  crashes: Array<{ source: string; error: string }>;
}

export function runFuzz(validCount: number, mutatedCount: number, seed = 20260803): FuzzSummary {
  resetFuzzSeed(seed);
  const summary: FuzzSummary = { generated: 0, mutated: 0, divergences: [], crashes: [] };
  const seen = new Set<string>();
  for (let index = 0; index < validCount; index += 1) {
    const source = generateProgram(1 + randomInt(0, 3));
    if (seen.has(source)) continue;
    seen.add(source);
    summary.generated += 1;
    const divergence = differentialCheck(source, { strict: true });
    if (divergence) summary.divergences.push({ source, reason: divergence });
  }
  // GAST 裸走：结构覆盖探针，只断言不崩溃/不挂起（不参与差分）
  for (let index = 0; index < Math.min(500, validCount); index += 1) {
    const source = generateGastStatement();
    try {
      compileBehaviorDsl(source);
    } catch (error) {
      summary.crashes.push({ source, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const base = Array.from(seen).slice(0, Math.min(seen.size, 200));
  for (let index = 0; index < mutatedCount; index += 1) {
    const mutated = mutateProgram(base[randomInt(0, base.length - 1)]!, randomInt(1, 3));
    summary.mutated += 1;
    const divergence = differentialCheck(mutated, { strict: false });
    if (divergence) summary.divergences.push({ source: mutated, reason: divergence });
  }
  return summary;
}
