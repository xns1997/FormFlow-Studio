import assert from 'node:assert/strict';
import test from 'node:test';
import { compileBehaviorDsl, parenBalance, structuralDiagnostics } from '.';

test('FFR105 reports when/else/lifecycle lines missing the arrow', () => {
  const diagnostics = compileBehaviorDsl('when $部门 == "技术部"\nelse\non load').diagnostics;
  assert.ok(diagnostics.some((item) => item.code === 'FFR105' && item.line === 1), 'when 行缺 ->');
  assert.ok(diagnostics.some((item) => item.code === 'FFR105' && item.line === 2), 'else 行缺 ->');
  assert.ok(diagnostics.some((item) => item.code === 'FFR105' && item.line === 3), 'on load 行缺 ->');
  assert.ok(diagnostics.every((item) => item.code !== 'FFR000'), '结构诊断应替代无法识别的 FFR000');
});

test('compute lines without an arrow are not misreported as FFR105', () => {
  const diagnostics = compileBehaviorDsl('compute $合计 = $数量 * $单价 watch($数量, $单价)').diagnostics;
  assert.ok(diagnostics.every((item) => item.code !== 'FFR105'));
});

test('FFR106 reports unbalanced parentheses with a suggestion', () => {
  const missing = compileBehaviorDsl('on change($省份) -> options($城市, "city_table", "省份", $省份').diagnostics;
  assert.ok(missing.some((item) => item.code === 'FFR106' && item.suggestion?.endsWith(')')));
  const extra = compileBehaviorDsl('when $部门 == "技术部" -> show(@技术栈))').diagnostics;
  assert.ok(extra.some((item) => item.code === 'FFR106' && /多余的右括号/.test(item.message)));
});

test('parenBalance counts parentheses outside strings', () => {
  assert.equal(parenBalance('set($字段, "a(b")'), 0, '字符串内的括号不计入深度');
  assert.equal(parenBalance('message("a)b")'), 0);
  assert.equal(parenBalance('show(@a); require($b)'), 0);
  assert.equal(parenBalance('when $x == "y" -> show(@a'), 1);
});

test('structuralDiagnostics stays quiet on balanced non-statement lines', () => {
  assert.deepEqual(structuralDiagnostics(1, '未知文本'), []);
});
