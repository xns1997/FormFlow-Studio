import { createToken, Lexer, CstParser, EOF, type IToken, type ParserMethod, type CstNode } from 'chevrotain';

/**
 * FormFlow Behavior Rule DSL 1.0 —— 可执行文法（单一事实来源）。
 *
 * 本模块用 Chevrotain 把 `docs/behavior-rule-syntax.md` 的 EBNF 变成可执行文法：
 * - 词法：关键字、运算符、字段/控件引用、字符串、数字、标识符、注释；
 * - 语法：`statement` 覆盖 when / else / otherwise / compute / on change /
 *   before click / before submit / on load / on submit 全部句型；
 * - 条件与动作正文保持“原文捕获”，由 parser.ts 复用既有语义函数
 *   （parseCondition / parseActions）解析，保证语义与旧实现逐字节一致。
 *
 * 结构级语义（else 相邻性、compute 展开、FFR 诊断、引用 lint）不在这里，
 * 而在 parser.ts 的 translate 层与 staticAnalysis.ts。
 */

// ---------------------------------------------------------------------------
// 词法
// ---------------------------------------------------------------------------

const WhiteSpace = createToken({ name: 'WhiteSpace', pattern: /\s+/, group: Lexer.SKIPPED });
const Comment = createToken({ name: 'Comment', pattern: /#[^\n]*/, group: Lexer.SKIPPED });
const NewLine = createToken({ name: 'NewLine', pattern: /\r?\n/ });

const Arrow = createToken({ name: 'Arrow', pattern: /->/ });

// 运算符（“更长优先”；同长时取先定义者）
const EqEqEq = createToken({ name: 'EqEqEq', pattern: /===/ });
const NotEqEq = createToken({ name: 'NotEqEq', pattern: /!==/ });
const EqEq = createToken({ name: 'EqEq', pattern: /==/ });
const Ne = createToken({ name: 'Ne', pattern: /!=/ });
const Ge = createToken({ name: 'Ge', pattern: />=/ });
const Le = createToken({ name: 'Le', pattern: /<=/ });
const Gt = createToken({ name: 'Gt', pattern: />/ });
const Lt = createToken({ name: 'Lt', pattern: /</ });
const Eq = createToken({ name: 'Eq', pattern: /=/ });
const Plus = createToken({ name: 'Plus', pattern: /\+/ });
const Minus = createToken({ name: 'Minus', pattern: /-/ });
const Star = createToken({ name: 'Star', pattern: /\*/ });
const Slash = createToken({ name: 'Slash', pattern: /\// });
const Percent = createToken({ name: 'Percent', pattern: /%/ });
const AndAnd = createToken({ name: 'AndAnd', pattern: /&&/ });
const OrOr = createToken({ name: 'OrOr', pattern: /\|\|/ });
const Nullish = createToken({ name: 'Nullish', pattern: /\?\?/ });
const Bang = createToken({ name: 'Bang', pattern: /!/ });
const Dot = createToken({ name: 'Dot', pattern: /\./ });

const Lparen = createToken({ name: 'Lparen', pattern: /\(/ });
const Rparen = createToken({ name: 'Rparen', pattern: /\)/ });
const Lbracket = createToken({ name: 'Lbracket', pattern: /\[/ });
const Rbracket = createToken({ name: 'Rbracket', pattern: /\]/ });
const Semicolon = createToken({ name: 'Semicolon', pattern: /;/ });
const Comma = createToken({ name: 'Comma', pattern: /,/ });

// 关键字（先于 Ident；大小写不敏感，与旧实现 /i 一致）
const When = createToken({ name: 'When', pattern: /when/i });
const Else = createToken({ name: 'Else', pattern: /else/i });
const Otherwise = createToken({ name: 'Otherwise', pattern: /otherwise/i });
const Compute = createToken({ name: 'Compute', pattern: /compute/i });
const On = createToken({ name: 'On', pattern: /on/i });
const Change = createToken({ name: 'Change', pattern: /change/i });
const Load = createToken({ name: 'Load', pattern: /load/i });
const Submit = createToken({ name: 'Submit', pattern: /submit/i });
const Before = createToken({ name: 'Before', pattern: /before/i });
const Click = createToken({ name: 'Click', pattern: /click/i });
const Watch = createToken({ name: 'Watch', pattern: /watch/i });

const FieldRef = createToken({ name: 'FieldRef', pattern: /\$form\.[\w一-鿿.-]+|\$[\w一-鿿.-]+/ });
const ComponentRef = createToken({ name: 'ComponentRef', pattern: /@[\w一-鿿.-]+/ });
const StringToken = createToken({ name: 'StringToken', pattern: /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/ });
const NumberToken = createToken({ name: 'NumberToken', pattern: /\d+(?:\.\d+)?/ });
const Ident = createToken({ name: 'Ident', pattern: /[\w一-鿿][\w一-鿿]*/ });
const Other = createToken({ name: 'Other', pattern: /./ });

export const DSL_TOKENS = [
  WhiteSpace, Comment, NewLine,
  Arrow,
  EqEqEq, NotEqEq, EqEq, Ne, Ge, Le, Gt, Lt, Eq,
  Plus, Minus, Star, Slash, Percent, AndAnd, OrOr, Nullish, Bang, Dot,
  Lparen, Rparen, Lbracket, Rbracket, Semicolon, Comma,
  When, Else, Otherwise, Compute, On, Change, Load, Submit, Before, Click, Watch,
  FieldRef, ComponentRef, StringToken, NumberToken, Ident, Other,
] as const;

export const dslLexer = new Lexer([...DSL_TOKENS], { positionTracking: 'full' });

// 可被“任意正文捕获”规则消费的 token（排除结构 token：Arrow / Eq / NewLine / EOF）
const CATCH_ALL_TOKENS = [
  Eq, EqEqEq, NotEqEq, EqEq, Ne, Ge, Le, Gt, Lt,
  Plus, Minus, Star, Slash, Percent, AndAnd, OrOr, Nullish, Bang, Dot,
  Lparen, Rparen, Lbracket, Rbracket, Semicolon, Comma,
  When, Else, Otherwise, Compute, On, Change, Load, Submit, Before, Click, Watch,
  FieldRef, ComponentRef, StringToken, NumberToken, Ident, Other,
] as const;

function isEndToken(token: IToken | undefined) {
  return !token || token.tokenType === EOF || token.tokenType === NewLine;
}

// ---------------------------------------------------------------------------
// 语法（CST）——每个语句把关键 token 记录到字段上，供语义层取原文
// ---------------------------------------------------------------------------

export interface WhenLine {
  kind: 'when';
  conditionText: string;
  actionsText: string;
}

export interface ElseLine {
  kind: 'else';
  actionsText: string;
  legacyOtherwise: boolean;
}

export interface ComputeLine {
  kind: 'compute';
  targetText: string;
  exprText: string;
  watchMarker: 'watch' | 'on change';
  fieldsText: string;
}

export interface OnChangeLine {
  kind: 'onChange';
  legacy: boolean;
  fieldText: string;
  actionsText: string;
}

export interface BeforeClickLine {
  kind: 'beforeClick';
  buttonName: string;
  actionsText: string;
}

export interface LifecycleLine {
  kind: 'lifecycle';
  event: 'formLoad' | 'submit' | 'beforeSubmit';
  /** 触发器原文（如 `on  submit`），规则名与旧实现保持一致 */
  rawName: string;
  actionsText: string;
}

export type StatementLine =
  | WhenLine
  | ElseLine
  | ComputeLine
  | OnChangeLine
  | BeforeClickLine
  | LifecycleLine;

export interface ParsedLine {
  /** 规范化（trim 后）的单行文本；语义层用它计算列号与旧语法对齐 */
  normalized: string;
  /** 解析出的语句结构；null 表示该行不是可识别的 DSL 语句（FFR000） */
  statement: StatementLine | null;
}

/** token 之后必须是空白（对应旧正则 `when\s+` / `compute\s+` / `on\s+` / `before\s+`） */
function hasWhitespaceBoundary(source: string, token: IToken): boolean {
  const next = source[(token.endOffset ?? (token.startOffset ?? 0) + token.image.length - 1) + 1];
  return next === undefined || /\s/.test(next);
}

/** Chevrotain 类型中 endOffset 可选；实际解析时恒有值，这里保守兜底 */
function tokenEnd(token: IToken): number {
  return token.endOffset ?? (token.startOffset ?? 0) + token.image.length - 1;
}

function tokenStart(token: IToken): number {
  return token.startOffset ?? tokenEnd(token) - token.image.length + 1;
}

class BehaviorDslCstParser extends CstParser {
  // Chevrotain 的 RULE(...) 在构造期把规则方法挂到实例上（带 ruleName），
  // 这里用「字段 + 明确赋值断言」只做类型声明，不参与运行时。
  statement!: ParserMethod<[], CstNode>;
  whenRule!: ParserMethod<[], CstNode>;
  elseRule!: ParserMethod<[], CstNode>;
  otherwiseRule!: ParserMethod<[], CstNode>;
  computeRule!: ParserMethod<[], CstNode>;
  onChangeRule!: ParserMethod<[], CstNode>;
  beforeRule!: ParserMethod<[], CstNode>;
  lifecycleRule!: ParserMethod<[], CstNode>;
  rawAny!: ParserMethod<[], CstNode>;
  rawAnyDup!: ParserMethod<[], CstNode>;
  rawAnyExceptChange!: ParserMethod<[], CstNode>;
  rawAnyLegacyOnChange!: ParserMethod<[], CstNode>;
  rawUntilArrow!: ParserMethod<[], CstNode>;
  rawUntilEq!: ParserMethod<[], CstNode>;
  rawUntilWatch!: ParserMethod<[], CstNode>;
  rawUntilRparen!: ParserMethod<[], CstNode>;
  rawUntilChange!: ParserMethod<[], CstNode>;
  rawTail!: ParserMethod<[], CstNode>;

  // 供 parseLine 读取的结构 token
  whenToken: IToken | null = null;
  elseToken: IToken | null = null;
  otherwiseToken: IToken | null = null;
  computeToken: IToken | null = null;
  computeEqToken: IToken | null = null;
  watchMarkerToken: IToken | null = null;
  computeLparenToken: IToken | null = null;
  computeRparenToken: IToken | null = null;
  onToken: IToken | null = null;
  changeToken: IToken | null = null;
  onChangeLparenToken: IToken | null = null;
  onChangeRparenToken: IToken | null = null;
  onChangeCanonical: boolean | null = null;
  beforeToken: IToken | null = null;
  clickToken: IToken | null = null;
  clickNameToken: IToken | null = null;
  lifecycleKind: 'formLoad' | 'submit' | 'beforeSubmit' | null = null;
  arrowToken: IToken | null = null;

  resetCaptureTokens(): void {
    this.whenToken = null;
    this.elseToken = null;
    this.otherwiseToken = null;
    this.computeToken = null;
    this.computeEqToken = null;
    this.watchMarkerToken = null;
    this.computeLparenToken = null;
    this.computeRparenToken = null;
    this.onToken = null;
    this.changeToken = null;
    this.onChangeLparenToken = null;
    this.onChangeRparenToken = null;
    this.onChangeCanonical = null;
    this.beforeToken = null;
    this.clickToken = null;
    this.clickNameToken = null;
    this.lifecycleKind = null;
    this.arrowToken = null;
  }

  constructor() {
    super([...DSL_TOKENS]);
    // 正文捕获子规则（先于 statement 定义，避免 occurrence 冲突）
    this.RULE('rawAny', () => {
      this.OR(CATCH_ALL_TOKENS.map((token) => ({ ALT: () => { this.CONSUME(token); } })));
    });
    this.RULE('rawAnyDup', () => {
      this.OR(CATCH_ALL_TOKENS.map((token) => ({ ALT: () => { this.CONSUME(token); } })));
    });
    this.RULE('rawAnyExceptChange', () => {
      this.OR(CATCH_ALL_TOKENS.filter((token) => token !== Change).map((token) => ({ ALT: () => { this.CONSUME(token); } })));
    });
    // 旧式 on <字段> change 的首 token 集合：排除 Change/Load/Submit，
    // 与 canonical on change（Change）和 on load/on submit（Load/Submit）在 LL(2) 上分离。
    this.RULE('rawAnyLegacyOnChange', () => {
      this.OR(CATCH_ALL_TOKENS.filter((token) => token !== Change && token !== Load && token !== Submit).map((token) => ({ ALT: () => { this.CONSUME(token); } })));
    });
    this.RULE('rawUntilArrow', () => {
      this.MANY({ GATE: () => this.LA(1).tokenType !== Arrow && !isEndToken(this.LA(1)), DEF: () => this.SUBRULE(this.rawAny) });
    });
    this.RULE('rawUntilEq', () => {
      this.MANY({ GATE: () => this.LA(1).tokenType !== Eq && this.LA(1).tokenType !== EqEq && !isEndToken(this.LA(1)), DEF: () => this.SUBRULE(this.rawAny) });
    });
    this.RULE('rawUntilWatch', () => {
      this.MANY({ GATE: () => this.LA(1).tokenType !== Watch && this.LA(1).tokenType !== On && !isEndToken(this.LA(1)), DEF: () => this.SUBRULE(this.rawAny) });
    });
    this.RULE('rawUntilRparen', () => {
      this.MANY({ GATE: () => this.LA(1).tokenType !== Rparen && !isEndToken(this.LA(1)), DEF: () => this.SUBRULE(this.rawAny) });
    });
    this.RULE('rawUntilChange', () => {
      this.MANY({ GATE: () => this.LA(1).tokenType !== Change && !isEndToken(this.LA(1)), DEF: () => this.SUBRULE(this.rawAny) });
    });
    this.RULE('rawTail', () => {
      this.MANY({ GATE: () => !isEndToken(this.LA(1)), DEF: () => this.SUBRULE(this.rawAny) });
    });

    this.RULE('statement', () => {
      this.OR([
        { ALT: () => this.SUBRULE(this.whenRule) },
        { ALT: () => this.SUBRULE(this.elseRule) },
        { ALT: () => this.SUBRULE(this.otherwiseRule) },
        { ALT: () => this.SUBRULE(this.computeRule) },
        { ALT: () => this.SUBRULE(this.onChangeRule) },
        { ALT: () => this.SUBRULE(this.beforeRule) },
        { ALT: () => this.SUBRULE(this.lifecycleRule) },
      ]);
    });

    this.RULE('whenRule', () => {
      this.whenToken = this.CONSUME(When);
      this.SUBRULE(this.rawAny);
      this.SUBRULE(this.rawUntilArrow);
      this.arrowToken = this.CONSUME(Arrow);
      this.SUBRULE(this.rawTail);
    });

    this.RULE('elseRule', () => {
      this.elseToken = this.CONSUME(Else);
      this.arrowToken = this.CONSUME(Arrow);
      this.SUBRULE(this.rawTail);
    });

    this.RULE('otherwiseRule', () => {
      this.otherwiseToken = this.CONSUME(Otherwise);
      this.arrowToken = this.CONSUME(Arrow);
      this.SUBRULE(this.rawTail);
    });

    this.RULE('computeRule', () => {
      this.computeToken = this.CONSUME(Compute);
      this.SUBRULE(this.rawAny);
      this.SUBRULE(this.rawUntilEq);
      this.computeEqToken = this.CONSUME(Eq);
      this.SUBRULE(this.rawUntilWatch);
      this.watchMarkerToken = this.OR([
        { ALT: () => this.CONSUME(Watch) },
        { ALT: () => { const on = this.CONSUME(On); this.CONSUME(Change); return on; } },
      ]);
      this.computeLparenToken = this.CONSUME(Lparen);
      this.SUBRULE(this.rawAnyDup);
      this.SUBRULE(this.rawUntilRparen);
      this.computeRparenToken = this.CONSUME(Rparen);
    });

    this.RULE('onChangeRule', () => {
      this.onToken = this.CONSUME(On);
      this.OR([
        {
          ALT: () => {
            this.changeToken = this.CONSUME(Change);
            this.onChangeLparenToken = this.CONSUME(Lparen);
            this.SUBRULE(this.rawAnyDup);
            this.SUBRULE(this.rawUntilRparen);
            this.onChangeRparenToken = this.CONSUME(Rparen);
            this.arrowToken = this.CONSUME(Arrow);
            this.SUBRULE(this.rawTail);
            this.onChangeCanonical = true;
          },
        },
        {
          ALT: () => {
            // 旧式：on <字段> change -> ...（首 token 不能是 change 关键字）
            this.SUBRULE(this.rawAnyLegacyOnChange);
            this.SUBRULE(this.rawUntilChange);
            this.changeToken = this.CONSUME1(Change);
            this.arrowToken = this.CONSUME1(Arrow);
            this.SUBRULE1(this.rawTail);
            this.onChangeCanonical = false;
          },
        },
      ]);
    });

    this.RULE('beforeRule', () => {
      this.beforeToken = this.CONSUME(Before);
      this.OR([
        {
          ALT: () => {
            this.clickToken = this.CONSUME(Click);
            this.CONSUME(Lparen);
            this.clickNameToken = this.CONSUME(StringToken);
            this.CONSUME(Rparen);
            this.arrowToken = this.CONSUME(Arrow);
            this.SUBRULE(this.rawTail);
            this.lifecycleKind = null;
          },
        },
        {
          ALT: () => {
            this.CONSUME(Submit);
            this.arrowToken = this.CONSUME1(Arrow);
            this.SUBRULE1(this.rawTail);
            this.lifecycleKind = 'beforeSubmit';
          },
        },
      ]);
    });

    this.RULE('lifecycleRule', () => {
      this.onToken = this.CONSUME(On);
      this.OR([
        { ALT: () => { this.CONSUME(Load); this.lifecycleKind = 'formLoad'; } },
        { ALT: () => { this.CONSUME(Submit); this.lifecycleKind = 'submit'; } },
      ]);
      this.arrowToken = this.CONSUME(Arrow);
      this.SUBRULE(this.rawTail);
    });

    this.performSelfAnalysis();
  }
}

export const dslParser = new BehaviorDslCstParser();

/**
 * 解析单行 DSL 文本。
 * - 返回 null：空行（语义层先用 stripComment 处理，这里只兜底）；
 * - statement 为 null：无法识别该行（对应 FFR000）。
 * 语义层保证：旧实现能接受的行，这里也能识别（除文档明确修复的缺陷外）。
 */
export function parseLine(source: string): ParsedLine | null {
  const normalized = source.trim();
  if (!normalized) return null;
  const result = dslLexer.tokenize(normalized);
  if (result.errors.length > 0) return { normalized, statement: null };

  const parser = dslParser;
  parser.input = result.tokens;
  parser.resetCaptureTokens();

  try {
    parser.statement();
  } catch {
    return { normalized, statement: null };
  }
  if (parser.errors.length > 0) {
    parser.errors.length = 0;
    return { normalized, statement: null };
  }
  parser.errors.length = 0;

  const arrow = parser.arrowToken;
  const actionsText = arrow ? normalized.slice(tokenEnd(arrow) + 1).trim() : '';

  if (parser.computeToken) {
    const compute = parser.computeToken;
    const eq = parser.computeEqToken;
    const marker = parser.watchMarkerToken;
    const open = parser.computeLparenToken;
    const close = parser.computeRparenToken;
    if (!compute || !eq || !marker || !open || !close) return { normalized, statement: null };
    if (!hasWhitespaceBoundary(normalized, compute)) return { normalized, statement: null };
    // 旧实现要求 `\s+(watch|on change)\s*\(`：标记前必须有空白
    if (tokenStart(marker) > 0 && !/\s/.test(normalized[tokenStart(marker) - 1])) return { normalized, statement: null };
    const targetText = normalized.slice(tokenEnd(compute) + 1, tokenStart(eq)).trim();
    if (!targetText) return { normalized, statement: null };
    const exprText = normalized.slice(tokenEnd(eq) + 1, tokenStart(marker)).trim();
    const fieldsText = normalized.slice(tokenEnd(open) + 1, tokenStart(close)).trim();
    // 旧实现要求 `\)\s*$`：右括号后不能再有内容
    if (normalized.slice(tokenEnd(close) + 1).trim()) return { normalized, statement: null };
    return {
      normalized,
      statement: {
        kind: 'compute',
        targetText,
        exprText,
        watchMarker: marker.image.toLowerCase() === 'watch' ? 'watch' : 'on change',
        fieldsText,
      },
    };
  }

  if (!arrow) return { normalized, statement: null };
  if (!actionsText) return { normalized, statement: null };

  if (parser.beforeToken) {
    if (parser.clickNameToken) {
      const raw = parser.clickNameToken.image.slice(1, -1);
      return { normalized, statement: { kind: 'beforeClick', buttonName: raw, actionsText } };
    }
    if (parser.lifecycleKind === 'beforeSubmit') {
      const rawName = normalized.slice(0, tokenStart(arrow)).trim();
      return { normalized, statement: { kind: 'lifecycle', event: 'beforeSubmit', rawName, actionsText } };
    }
    return { normalized, statement: null };
  }

  if (parser.onChangeCanonical !== null && parser.onToken) {
    const on = parser.onToken;
    if (!hasWhitespaceBoundary(normalized, on)) return { normalized, statement: null };
    if (parser.onChangeCanonical) {
      const close = parser.onChangeRparenToken;
      const open = parser.onChangeLparenToken;
      if (!open || !close) return { normalized, statement: null };
      const fieldText = normalized.slice(tokenEnd(open) + 1, tokenStart(close)).trim();
      return { normalized, statement: { kind: 'onChange', legacy: false, fieldText, actionsText } };
    }
    const change = parser.changeToken;
    if (!change) return { normalized, statement: null };
    const fieldText = normalized.slice(tokenEnd(on) + 1, tokenStart(change)).trim();
    if (!fieldText) return { normalized, statement: null };
    return { normalized, statement: { kind: 'onChange', legacy: true, fieldText, actionsText } };
  }

  if (parser.lifecycleKind && parser.onToken) {
    const on = parser.onToken;
    if (!hasWhitespaceBoundary(normalized, on)) return { normalized, statement: null };
    const rawName = normalized.slice(0, tokenStart(arrow)).trim();
    return { normalized, statement: { kind: 'lifecycle', event: parser.lifecycleKind, rawName, actionsText } };
  }

  if (parser.whenToken) {
    const when = parser.whenToken;
    if (!hasWhitespaceBoundary(normalized, when)) return { normalized, statement: null };
    const conditionText = normalized.slice(tokenEnd(when) + 1, tokenStart(arrow)).trim();
    if (!conditionText) return { normalized, statement: null };
    return { normalized, statement: { kind: 'when', conditionText, actionsText } };
  }

  if (parser.elseToken) {
    return { normalized, statement: { kind: 'else', actionsText, legacyOtherwise: false } };
  }

  if (parser.otherwiseToken) {
    return { normalized, statement: { kind: 'else', actionsText, legacyOtherwise: true } };
  }

  return { normalized, statement: null };
}

/** 供模糊生成器消费的 GAST 生产规则 */
export function getDslGrammar() {
  return dslParser.getGAstProductions();
}
