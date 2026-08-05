import type { BehaviorDslCompileContext } from '../types';

/**
 * 符合性套件（Phase 0/1）——锚定 docs/behavior-rule-syntax.md 的
 * MUST/MUST NOT 约束、12.x 用例、13.x 反例与全部 FFR 诊断码。
 *
 * exact=false 的用例涉及新增静态检查（FFR304-309）或文档已声明的语义修复，
 * 差分测试时只要求“旧诊断 ⊆ 新诊断 + 规则等价”；其余用例要求逐字节一致。
 */

/** 用例预期：诊断码、规则数与差分严格度。 */
export interface ConformanceExpectation {
  /** 不应存在任何 error 级诊断 */
  ok?: boolean;
  /** 必须出现这些 error 级诊断码 */
  errorCodes?: string[];
  /** 必须出现这些 warning 级诊断码 */
  warningCodes?: string[];
  /** 编译出的规则数（未指定则不校验） */
  ruleCount?: number;
  /** 差分测试是否要求新旧诊断完全一致（默认 true） */
  exact?: boolean;
}

/** 一致性用例：文档引用、源码与预期。 */
export interface ConformanceCase {
  id: string;
  docRef: string;
  source: string;
  context?: BehaviorDslCompileContext;
  expect: ConformanceExpectation;
  note?: string;
}

const techStackComponents = [
  { id: 'tech-stack', type: 'input', x: 0, y: 0, width: 200, height: 60, fieldBinding: '技术栈', props: { name: '技术栈' } },
];

/** 全部一致性用例（锚定 docs/behavior-rule-syntax.md）。 */
export const CONFORMANCE_CASES: ConformanceCase[] = [
  // ---- 12.x 用例（合法，0 诊断） ----
  {
    id: 'doc-12.1-condition-visibility',
    docRef: '12.1 条件显隐',
    source: 'when $部门 == "技术部" -> show(@tech-stack); require($技术栈)\nelse -> hide(@tech-stack); clear($技术栈)',
    expect: { ok: true, ruleCount: 2 },
  },
  {
    id: 'doc-12.2-compute',
    docRef: '12.2 计算字段',
    source: 'compute $合计 = $数量 * $单价 watch($数量, $单价)',
    expect: { ok: true, ruleCount: 2 },
  },
  {
    id: 'doc-12.3-cascade-options',
    docRef: '12.3 级联选项',
    source: 'on change($省份) -> options($城市, "city_table", "省份", $省份)',
    expect: { ok: true, ruleCount: 1 },
  },
  {
    id: 'doc-12.4-load-defaults',
    docRef: '12.4 加载默认值',
    source: 'on load -> set($状态, "草稿"); set($创建方式, "手动录入")',
    expect: { ok: true, ruleCount: 1 },
  },
  {
    id: 'doc-12.5-before-submit-guards',
    docRef: '12.5 提交前校验',
    source: 'before submit -> require($姓名, $手机号); validate($邮箱, email); length($姓名, 2, 20)',
    expect: { ok: true, ruleCount: 1 },
  },
  {
    id: 'doc-12.6-button-guard',
    docRef: '12.6 按钮查询守卫',
    source: 'before click("lookup") -> requireAny($教师ID, $姓名)',
    expect: { ok: true, ruleCount: 1 },
  },
  {
    id: 'doc-12.7-cross-field-compare',
    docRef: '12.7 跨字段比较',
    source: 'before submit -> compare($结束日期, ">=", $开始日期)',
    expect: { ok: true, ruleCount: 1 },
  },
  {
    id: 'doc-12.8-submit-workflow',
    docRef: '12.8 提交流程',
    source: 'on submit -> run("save_employee"); message("提交完成", success)',
    expect: { ok: true, ruleCount: 1 },
  },

  // ---- 5. 语法硬约束 ----
  {
    id: 'must-line-per-rule',
    docRef: '5. 一行一条规则',
    source: 'when $x == 1 -> show(@a) when $y == 2 -> show(@b)',
    expect: { errorCodes: ['FFR000'], ruleCount: 0, exact: false },
    note: '文档修复：旧实现把第二条规则静默吞进动作参数；新实现按“一行一条规则”拒绝（FFR000）',
  },
  {
    id: 'must-semicolon-actions',
    docRef: '5. 动作 ; 分隔',
    source: 'when $部门 == "技术部" -> show(@tech-stack); require($技术栈)',
    context: { components: techStackComponents },
    expect: { ok: true, ruleCount: 1 },
  },
  {
    id: 'must-else-adjacent',
    docRef: '5./13.1 else 必须紧邻 when',
    source: 'when $部门 == "技术部" -> show(@tech-stack)\non load -> set($状态, "草稿")\nelse -> hide(@tech-stack)',
    expect: { errorCodes: ['FFR003'] },
  },
  {
    id: 'must-compute-watch-explicit',
    docRef: '5./13.5 compute watch 显式声明',
    source: 'compute $合计 = $数量 * $单价 watch($数量)',
    expect: { errorCodes: ['FFR305'], exact: false },
  },
  {
    id: 'must-before-click-quoted',
    docRef: '5. before click 按钮名须加引号',
    source: 'before click(lookup) -> requireAny($x)',
    expect: { errorCodes: ['FFR000'] },
  },
  {
    id: 'must-comment-only-line',
    docRef: '5. 整行注释',
    source: '# 这是注释\nwhen $x == 1 -> show(@a)',
    expect: { ok: true, ruleCount: 1 },
  },

  // ---- FFR0xx 语法/参数错误 ----
  {
    id: 'ffr000-unrecognized',
    docRef: '11.8 FFR000-099',
    source: 'do whatever you want',
    expect: { errorCodes: ['FFR000'], ruleCount: 0 },
  },
  {
    id: 'ffr001-bad-condition',
    docRef: 'FFR001',
    source: 'when 123 -> show(@a)',
    expect: { errorCodes: ['FFR001'], ruleCount: 0 },
  },
  {
    id: 'ffr002-unknown-action',
    docRef: 'FFR002',
    source: 'when $x == 1 -> unknownAction($a)',
    expect: { errorCodes: ['FFR002'], ruleCount: 0 },
  },
  {
    id: 'ffr003-else-without-when',
    docRef: 'FFR003',
    source: 'else -> hide(@a)',
    expect: { errorCodes: ['FFR003'], ruleCount: 0 },
  },
  {
    id: 'ffr004-empty-compute-watch',
    docRef: 'FFR004',
    source: 'compute $x = 1 watch()',
    expect: { errorCodes: ['FFR000'], ruleCount: 0 },
    note: 'watch() 空括号不匹配 compute 句型（旧实现同样 FFR000）',
  },

  // ---- FFR1xx 旧语法迁移 ----
  {
    id: 'ffr100-otherwise',
    docRef: '14. otherwise → else',
    source: 'when $部门 == "技术部" -> show(@tech-stack)\notherwise -> hide(@tech-stack)',
    expect: { ok: true, warningCodes: ['FFR100'], ruleCount: 2 },
  },
  {
    id: 'ffr101-legacy-action',
    docRef: '14. show 技术栈 → show(@技术栈)',
    source: 'when 部门 == "技术部" -> show 技术栈',
    expect: { ok: true, warningCodes: ['FFR101', 'FFR102'], ruleCount: 1 },
  },
  {
    id: 'ffr103-legacy-compute',
    docRef: '14. compute ... on change(...) → watch(...)',
    source: 'compute $合计 = $数量 * $单价 on change($数量, $单价)',
    expect: { ok: true, warningCodes: ['FFR103'], ruleCount: 2 },
  },
  {
    id: 'ffr104-legacy-on-change',
    docRef: '14. on 字段 change → on change($字段)',
    source: 'on 省份 change -> options($城市, "city_table", "省份", $省份)',
    expect: { ok: true, warningCodes: ['FFR104'], ruleCount: 1 },
  },

  // ---- FFR2xx 引用校验（需要 context） ----
  {
    id: 'ffr202-unknown-field',
    docRef: 'FFR202',
    source: 'when $不存在字段 == 1 -> show(@tech-stack)',
    context: { fields: ['部门'], components: techStackComponents },
    expect: { ok: true, warningCodes: ['FFR202'], ruleCount: 1 },
  },
  {
    id: 'ffr203-unknown-component',
    docRef: 'FFR203',
    source: 'when $部门 == "技术部" -> show(@不存在的控件)',
    context: { fields: ['部门'], components: techStackComponents },
    expect: { errorCodes: ['FFR203'], ruleCount: 1 },
  },
  {
    id: 'ffr204-unknown-table',
    docRef: 'FFR204',
    source: 'on change($省份) -> options($城市, "missing_table", "省份", $省份)',
    context: { fields: ['省份', '城市'], tables: [{ id: 'city_table', fileName: 'city.csv' }] },
    expect: { errorCodes: ['FFR204'], ruleCount: 1 },
  },
  {
    id: 'ffr205-unknown-workflow',
    docRef: 'FFR205',
    source: 'on change($状态) -> run("missing-flow")',
    context: { fields: ['状态'], workflows: [{ id: 'known', name: '已知流程' }] },
    expect: { errorCodes: ['FFR205'], ruleCount: 1 },
  },

  // ---- FFR3xx 循环 / 行为语义 ----
  {
    id: 'ffr301-duplicate-watch',
    docRef: 'FFR301',
    source: 'compute $合计 = $数量 + $数量 watch($数量, $数量)',
    expect: { ok: true, warningCodes: ['FFR301'], ruleCount: 1 },
  },
  {
    id: 'ffr302-self-write-back',
    docRef: 'FFR302',
    source: 'on change($数量) -> set($数量, $数量 + 1)',
    context: { fields: ['数量'] },
    expect: { ok: true, warningCodes: ['FFR302'], ruleCount: 1 },
  },
  {
    id: 'ffr303-on-submit-resubmit',
    docRef: '13.3 on submit 中再次提交',
    source: 'on submit -> save',
    context: { fields: ['状态'] },
    expect: { errorCodes: ['FFR303'], warningCodes: ['FFR101'], ruleCount: 1 },
  },
  {
    id: 'ffr304-compute-cycle',
    docRef: '13.4 计算规则互相回写',
    source: 'compute $A = $B + 1 watch($B)\ncompute $B = $A + 1 watch($A)',
    expect: { errorCodes: ['FFR304'], exact: false },
  },
  {
    id: 'ffr304-when-write-cycle',
    docRef: 'FFR304（when 互相回写）',
    source: 'when $A == 1 -> set($B, 2)\nwhen $B == 1 -> set($A, 2)',
    expect: { errorCodes: ['FFR304'], exact: false },
  },
  {
    id: 'ffr305-watch-incomplete',
    docRef: '13.5 watch 依赖写不全',
    source: 'compute $合计 = $数量 * $单价 watch($数量)',
    expect: { errorCodes: ['FFR305'], exact: false },
  },
  {
    id: 'ffr306-type-error',
    docRef: 'FFR306 表达式类型',
    source: 'compute $合计 = $数量 * $单价 watch($数量, $单价)',
    context: { fieldTypes: { 数量: 'string', 单价: 'number' } },
    expect: { errorCodes: ['FFR306'], exact: false },
  },
  {
    id: 'ffr306-type-ok',
    docRef: 'FFR306 合法表达式零误报',
    source: 'compute $合计 = $数量 * $单价 watch($数量, $单价)',
    context: { fieldTypes: { 数量: 'number', 单价: 'number' } },
    expect: { ok: true, exact: false },
  },
  {
    id: 'ffr307-wrong-ref-kind',
    docRef: '6.1 show 期待控件引用',
    source: 'when $部门 == "技术部" -> show($技术栈)',
    expect: { errorCodes: ['FFR307'], exact: false },
  },
  {
    id: 'ffr307-run-field-ref',
    docRef: '6.1 run 参数是流程 ID 字符串',
    source: 'on change($状态) -> run($流程ID)',
    expect: { errorCodes: ['FFR307'], exact: false },
  },
  {
    id: 'ffr307-bad-range-number',
    docRef: '10.2 range 使用数字',
    source: 'before submit -> range($年龄, "abc", 5)',
    expect: { errorCodes: ['FFR307'], exact: false },
  },
  {
    id: 'ffr307-bad-compare-operator',
    docRef: '10.2 compare 运算符',
    source: 'before submit -> compare($结束日期, ">>", $开始日期)',
    expect: { errorCodes: ['FFR307'], exact: false },
  },
  {
    id: 'ffr307-bad-pattern',
    docRef: '10.2 pattern(...) 使用引号',
    source: 'before submit -> validate($手机号, pattern(123))',
    expect: { errorCodes: ['FFR307'], exact: false },
  },
  {
    id: 'ffr307-bad-message-level',
    docRef: '6.1 message level 非法（parseCanonicalAction 层拒绝 → FFR002）',
    source: 'on load -> message("hi", nope)',
    expect: { errorCodes: ['FFR002'], ruleCount: 0, exact: false },
  },
  {
    id: 'ffr308-ui-in-guard',
    docRef: 'FFR308 语境矩阵',
    source: 'before submit -> show(@tech-stack)',
    expect: { errorCodes: ['FFR308'], exact: false },
  },
  {
    id: 'ffr308-guard-preparation-ok',
    docRef: 'FFR308 守卫语境允许 set/message',
    source: 'before submit -> set($状态, "草稿"); message("请检查", warning)',
    expect: { ok: true, exact: false },
  },

  // ---- 文档明确的语义修复（旧正则实现与文档冲突的缺陷） ----
  {
    id: 'fix-string-with-arrow',
    docRef: '8. 条件值字符串可含任意字符（修复旧实现按 "->" 切分条件）',
    source: 'when $标题 == "下一步 -> 完成" -> show(@tech-stack)',
    expect: { ok: true, exact: false },
    note: '旧实现把字符串里的 "->" 当作箭头，导致 FFR001；新实现正确解析',
  },
];

/** 一致性套件覆盖的 FFR 诊断码清单。 */
export const CONFORMANCE_FFR_CODES = [
  'FFR000', 'FFR001', 'FFR002', 'FFR003', 'FFR004',
  'FFR100', 'FFR101', 'FFR102', 'FFR103', 'FFR104',
  'FFR202', 'FFR203', 'FFR204', 'FFR205',
  'FFR301', 'FFR302', 'FFR303', 'FFR304', 'FFR305', 'FFR306', 'FFR307', 'FFR308', 'FFR309',
] as const;

/** 返回全部一致性用例（保持定义顺序）。 */
export function getConformanceCases(): ConformanceCase[] {
  return CONFORMANCE_CASES;
}
