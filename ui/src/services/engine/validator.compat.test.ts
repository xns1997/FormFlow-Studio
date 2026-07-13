import assert from 'node:assert/strict';
import test from 'node:test';
import { compileComponentValidation, validateField } from './validator';

test('旧 validator/pattern/min/max 编译为统一规则', () => {
  const rules = compileComponentValidation({ required: true, validator: 'pattern', pattern: '^A', patternMessage: '必须以 A 开头', minLength: 2, maxLength: 4 });
  assert.equal(validateField('', rules), '此字段为必填项');
  assert.equal(validateField('BC', rules), '必须以 A 开头');
  assert.equal(validateField('ABCDE', rules), '最多 4 个字符');
  assert.equal(validateField('AB', rules), null);
});

test('新规则支持选择数量和跨字段比较', () => {
  assert.match(validateField(['a'], [{ type: 'minSelect', param: '2', message: '至少两项' }]) || '', /至少两项/);
  assert.equal(validateField(10, [{ type: 'compare', field: 'limit', operator: 'lte', message: '超过限制' }], { limit: 8 }), '超过限制');
});

test('数字控件的仅整数和仅正数配置进入统一校验器', () => {
  const rules = compileComponentValidation({ integer: true, positive: true });
  assert.equal(validateField(1.5, rules), '请输入整数');
  assert.equal(validateField(-1, rules), '请输入正数');
  assert.equal(validateField(2, rules), null);
});
