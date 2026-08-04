import assert from 'node:assert/strict';
import test from 'node:test';
import { compareValues } from './formLinkage';

test('compareValues: ordering operators are exact negations so when/else stay complementary (docs 8/11.5)', () => {
  // 数值域：与数值比较一致
  assert.equal(compareValues(5, 'greaterThan', 3), true);
  assert.equal(compareValues(5, 'lessOrEqual', 3), false);
  assert.equal(compareValues(3, 'lessThan', 5), true);
  assert.equal(compareValues(3, 'greaterOrEqual', 5), false);
  // 不可比输入（NaN / 空值）：`<=` = !(`>`)，`>=` = !(`<`)，恰有一个成立
  for (const value of ['abc', null, undefined, '', []]) {
    const gt = compareValues(value, 'greaterThan', 5);
    const le = compareValues(value, 'lessOrEqual', 5);
    const lt = compareValues(value, 'lessThan', 5);
    const ge = compareValues(value, 'greaterOrEqual', 5);
    assert.notEqual(gt, le, `greaterThan 与 lessOrEqual 对 ${JSON.stringify(value)} 应恰有一个成立`);
    assert.notEqual(lt, ge, `lessThan 与 greaterOrEqual 对 ${JSON.stringify(value)} 应恰有一个成立`);
  }
});
