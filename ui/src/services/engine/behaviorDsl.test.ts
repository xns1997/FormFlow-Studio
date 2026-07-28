import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyBehaviorDslToComponents, behaviorRulesToNaturalLanguage, compileBehaviorDsl, naturalLanguageToBehaviorDsl } from './behaviorDsl';
import { BEHAVIOR_DSL_ACTIONS, BEHAVIOR_DSL_OPERATORS, BEHAVIOR_DSL_STATEMENTS } from './behaviorDslLanguage';

test('rule DSL compiles conditional UI and otherwise branches', () => {
  const result = compileBehaviorDsl(`
when $部门 == "技术部" -> show(@技术栈); require($技术栈)
else -> hide(@技术栈); clear($技术栈)
  `);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.rules.length, 2);
  assert.equal(result.rules[0].trigger.fieldName, '部门');
  assert.equal(result.rules[0].conditions[0].operator, '==');
  assert.deepEqual(result.rules[0].actions.map((action) => action.type), ['setVisible', 'setRequired']);
  assert.equal(result.rules[1].conditions[0].operator, '!=');
});

test('rule DSL compiles computed fields and lifecycle actions', () => {
  const result = compileBehaviorDsl(`
compute $总价 = $数量 * $单价 watch($数量, $单价)
before submit -> require($姓名, $手机号); message("正在保存", info); run()
  `);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.rules.length, 3);
  assert.equal(result.rules[0].actions[0].expression, '$数量 * $单价');
  assert.equal(result.rules[2].trigger.type, 'beforeSubmit');
  assert.ok(result.rules[2].actions.some((action) => action.type === 'runWorkflow'));
  assert.ok(behaviorRulesToNaturalLanguage(result.rules)[0].includes('数量'));
});

test('rule DSL compiles guard actions, button guards, and field-to-field conditions', () => {
  const result = compileBehaviorDsl(`
when $结束日期 >= $开始日期 -> message("日期顺序正确", success)
before click("lookup") -> requireAny($教师ID, $姓名)
before submit -> validate($邮箱, email); range($年龄, 18, 60); length($姓名, 2, 20); requireDirty($姓名)
  `);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.rules[0].conditions[0].sourceField, '开始日期');
  assert.equal(result.rules[1].trigger.type, 'buttonClick');
  assert.equal(result.rules[1].trigger.buttonName, 'lookup');
  assert.equal(result.rules[1].actions[0].type, 'assertAny');
  const guardActions = result.rules[2].actions;
  assert.deepEqual(guardActions.map((action) => action.type), ['assertValidator', 'assertRange', 'assertLength', 'assertDirty']);
  const compare = compileBehaviorDsl('before submit -> compare($结束日期, \">=\", $开始日期)');
  assert.deepEqual(compare.diagnostics, []);
  assert.equal(compare.rules[0].actions[0].type, 'assertCompare');
  assert.equal(compare.rules[0].actions[0].sourceField, '开始日期');
});

test('rule DSL returns line diagnostics instead of accepting arbitrary text', () => {
  const result = compileBehaviorDsl('do whatever you want');
  assert.equal(result.rules.length, 0);
  assert.equal(result.diagnostics[0].line, 1);
});

test('compiled DSL attaches executable linkage rules to the source component', () => {
  const components = [
    { id: 'department', type: 'select', x: 0, y: 0, width: 200, height: 60, fieldBinding: '部门', props: { name: '部门' } },
    { id: 'tech', type: 'input', x: 0, y: 80, width: 200, height: 60, fieldBinding: '技术栈', props: { name: '技术栈' } },
  ];
  const result = applyBehaviorDslToComponents(components, 'when $部门 == "技术部" -> show(@tech); require($技术栈)');
  assert.deepEqual(result.unapplied, []);
  const rules = result.components[0].props.linkageRules.onChange;
  assert.equal(rules[0].conditions[0].operator, 'equals');
  assert.deepEqual(rules[0].actions.map((action: { type: string }) => action.type), ['setVisible', 'setRequired']);
});

test('DSL action targets resolve field names and labels to executable component ids', () => {
  const components = [
    { id: 'department', type: 'select', x: 0, y: 0, width: 200, height: 60, fieldBinding: '部门', props: { name: '部门' } },
    { id: 'tech-stack-control', type: 'input', x: 0, y: 80, width: 200, height: 60, fieldBinding: '技术栈', props: { name: 'techStack', label: '技术栈' } },
  ];
  const result = applyBehaviorDslToComponents(components, 'when $部门 == "技术部" -> show(@技术栈)');
  assert.deepEqual(result.unapplied, []);
  assert.equal(result.components[0].props.linkageRules.onChange[0].actions[0].targetComponentId, 'tech-stack-control');
  const missing = applyBehaviorDslToComponents(components, 'when $部门 == "技术部" -> show(@不存在控件)');
  assert.match(missing.unapplied[0], /找不到动作控件/);
});

test('guard DSL attaches lookup button click and cross-field conditions to executable linkage rules', () => {
  const components = [
    { id: 'start', type: 'datePicker', x: 0, y: 0, width: 200, height: 60, fieldBinding: '开始日期', props: { name: '开始日期' } },
    { id: 'end', type: 'datePicker', x: 0, y: 70, width: 200, height: 60, fieldBinding: '结束日期', props: { name: '结束日期' } },
    { id: 'lookup_button', type: 'button', x: 0, y: 140, width: 120, height: 48, props: { name: 'lookup', label: '查询' } },
  ];
  const result = applyBehaviorDslToComponents(components as any, `
when $结束日期 >= $开始日期 -> message("ok", success)
before click("lookup") -> requireAny($开始日期, $结束日期)
  `);
  assert.deepEqual(result.unapplied, []);
  assert.equal(result.components[1].props.linkageRules.onChange[0].conditions[0].valueSource, 'field');
  assert.equal(result.components[1].props.linkageRules.onChange[0].conditions[0].sourceField, '开始日期');
  assert.equal(result.components[2].props.linkageRules.onClick[0].actions[0].type, 'assertAny');
});

test('Chinese business phrases translate to controlled DSL before compilation', () => {
  const translated = naturalLanguageToBehaviorDsl('部门是技术部时显示技术栈；提交前姓名和手机号必填');
  assert.deepEqual(translated.diagnostics, []);
  assert.match(translated.dsl, /when \$部门 == "技术部" -> show\(@技术栈\)/);
  assert.match(translated.dsl, /before submit -> require\(\$姓名, \$手机号\)/);
  assert.deepEqual(compileBehaviorDsl(translated.dsl).diagnostics, []);
});

test('rule DSL compiles cascade option refresh into an executable linkage action', () => {
  const source = 'on change($省份) -> options($城市, "city_dict", "省份", $value)';
  const compiled = compileBehaviorDsl(source);
  assert.deepEqual(compiled.diagnostics, []);
  assert.equal(compiled.rules[0].actions[0].type, 'setOptions');
  const components = [
    { id: 'province', type: 'select', x: 0, y: 0, width: 100, height: 40, fieldBinding: '省份', props: { name: '省份' } },
    { id: 'city', type: 'select', x: 0, y: 50, width: 100, height: 40, fieldBinding: '城市', props: { name: '城市' } },
  ];
  const applied = applyBehaviorDslToComponents(components, source);
  assert.equal(applied.components[0].props.linkageRules.onChange[0].actions[0].type, 'setOptions');
});

test('text operators survive compilation into executable linkage conditions', () => {
  const starts = compileBehaviorDsl('when $编号 starts with "CN" -> message("国内编号", info)\nelse -> message("其他编号", info)');
  assert.deepEqual(starts.diagnostics, []);
  assert.equal(starts.rules[0].conditions[0].operator, 'startsWith');
  assert.equal(starts.rules[1].conditions[0].operator, 'notStartsWith');
  const components = [
    { id: 'code', type: 'input', x: 0, y: 0, width: 100, height: 40, fieldBinding: '编号', props: { name: '编号' } },
  ];
  const applied = applyBehaviorDslToComponents(components, 'when $编号 not contains "-" -> message("格式正确", success)');
  assert.equal(applied.components[0].props.linkageRules.onChange[0].conditions[0].operator, 'notContains');
});

test('lint uses project context and distinguishes warnings from errors', () => {
  const result = compileBehaviorDsl('on change($数量) -> set($数量, $数量 + 1); run("missing-flow")', { fields: ['数量'], workflows: [{ id: 'known', name: '已知流程' } as never] });
  assert.ok(result.diagnostics.some((item) => item.code === 'FFR302' && item.severity === 'warning'));
  assert.ok(result.diagnostics.some((item) => item.code === 'FFR205' && item.severity === 'error'));
});

test('legacy syntax remains readable but receives migration diagnostics', () => {
  const result = compileBehaviorDsl('when 部门 == "技术部" -> show 技术栈\notherwise -> hide 技术栈');
  assert.equal(result.rules.length, 2);
  assert.ok(result.diagnostics.every((item) => item.severity === 'warning'));
  assert.ok(result.diagnostics.some((item) => item.code === 'FFR100'));
  assert.ok(result.diagnostics.some((item) => item.code === 'FFR101'));
});

test('hash characters inside message strings are not treated as comments', () => {
  const result = compileBehaviorDsl('on load -> message("订单 #123", info) # 真实注释');
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.rules[0].actions[0].message, '订单 #123');
});

test('dedicated syntax reference covers the shared language definition', () => {
  const reference = readFileSync('docs/behavior-rule-syntax.md', 'utf8');
  for (const statement of BEHAVIOR_DSL_STATEMENTS) assert.ok(reference.includes(statement.syntax.split(' ')[0]), statement.syntax);
  for (const operator of BEHAVIOR_DSL_OPERATORS) assert.ok(reference.includes(`\`${operator.syntax}\``), operator.syntax);
  for (const action of BEHAVIOR_DSL_ACTIONS) assert.ok(reference.includes(`\`${action.name}(`), action.name);
});
