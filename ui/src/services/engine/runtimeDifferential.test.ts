import assert from 'node:assert/strict';
import test from 'node:test';
import { generateProgram, resetFuzzSeed } from '../../../../shared/formflow-core/behaviorDsl/fuzzer';
import { compileBehaviorDsl } from '../../../../shared/formflow-core/behaviorDsl';
import { runRuntimeDifferential, type RuntimeDifferentialEvent } from './runtimeDifferential';

test('runtime differential: doc 12.x use cases match between reference semantics and formLinkage', async () => {
  const cases: Array<{ source: string; initial: Record<string, unknown>; events: RuntimeDifferentialEvent[] }> = [
    {
      source: 'when $部门 == "技术部" -> show(@tech-stack); set($技术栈, "React")\nelse -> hide(@tech-stack); clear($技术栈)',
      initial: { 部门: '产品部' },
      events: [{ type: 'fieldChange', field: '部门', value: '技术部' }],
    },
    {
      source: 'compute $合计 = $数量 * $单价 watch($数量, $单价)',
      initial: { 数量: 2, 单价: 3 },
      events: [{ type: 'fieldChange', field: '单价', value: 4 }],
    },
    {
      source: 'on change($省份) -> options($城市, "city_table", "省份", $省份)',
      initial: { 省份: '浙江' },
      events: [{ type: 'fieldChange', field: '省份', value: '上海' }],
    },
    {
      source: 'on load -> set($状态, "草稿"); set($创建方式, "手动录入")',
      initial: {},
      events: [{ type: 'formLoad' }],
    },
    {
      source: 'before submit -> require($姓名, $手机号); message("请检查必填项", warning)',
      initial: {},
      events: [{ type: 'beforeSubmit' }],
    },
    {
      source: 'before submit -> require($姓名, $手机号); validate($邮箱, email); length($姓名, 2, 20)',
      initial: { 姓名: '张', 手机号: '13800138000', 邮箱: 'bad-email' },
      events: [{ type: 'beforeSubmit' }],
    },
    {
      source: 'before click("lookup") -> requireAny($教师ID, $姓名)',
      initial: {},
      events: [{ type: 'buttonClick', buttonName: 'lookup' }],
    },
    {
      source: 'before submit -> compare($结束日期, ">=", $开始日期)',
      initial: { 结束日期: '2026-01-01', 开始日期: '2026-06-01' },
      events: [{ type: 'beforeSubmit' }],
    },
    {
      source: 'on submit -> run("save_employee"); message("提交完成", success)',
      initial: {},
      events: [{ type: 'submit' }],
    },
    {
      source: 'on change($数量) -> set($合计, $数量 * 2)',
      initial: { 数量: 3 },
      events: [{ type: 'fieldChange', field: '数量', value: 5 }],
    },
  ];
  for (const [index, def] of cases.entries()) {
    const result = await runRuntimeDifferential(def.source, def.initial, def.events);
    assert.deepEqual(result.differences, [], `用例 ${index}（${def.source.split('\n')[0]}）：${result.differences.join('；')}`);
  }
});

test('runtime differential: guard failure counts align (formLinkage throw vs reference guardFailures)', async () => {
  const source = 'before submit -> require($姓名, $手机号)';
  const result = await runRuntimeDifferential(source, {}, [{ type: 'beforeSubmit' }]);
  assert.deepEqual(result.differences, []);
});

test('runtime differential: generated programs stay aligned between reference semantics and formLinkage', async () => {
  resetFuzzSeed(20260810);
  let checked = 0;
  let diverged = 0;
  for (let index = 0; index < 120; index += 1) {
    const source = generateProgram(1 + (index % 3));
    const { rules } = compileBehaviorDsl(source);
    const fields = [...new Set(rules.flatMap((rule) => [
      rule.trigger.fieldName,
      ...rule.actions.map((action) => action.targetField),
      ...rule.conditions.map((condition) => condition.fieldName),
    ].filter(Boolean)))];
    const events: RuntimeDifferentialEvent[] = [
      ...fields.slice(0, 3).map((field) => ({ type: 'fieldChange' as const, field, value: ['x', 1, 0][index % 3] })),
      { type: 'formLoad' },
      { type: 'beforeSubmit' },
      { type: 'submit' },
    ];
    const result = await runRuntimeDifferential(source, {}, events);
    checked += 1;
    if (!result.pass) {
      diverged += 1;
      if (diverged <= 3) {
        assert.fail(`生成程序分歧：\n${source}\n${result.differences.join('\n')}`);
      }
    }
  }
  assert.equal(diverged, 0, `${diverged}/${checked} 个生成程序在运行时差分中分歧`);
});
