import assert from 'node:assert/strict';
import test from 'node:test';
import { compileRegex, REGEX_EXAMPLES, testRegex } from './regexTester';

test('正则范例可编译并返回逐行匹配结果', async () => {
  for (const example of REGEX_EXAMPLES) assert.equal(compileRegex(example.pattern), null);
  const result = await testRegex('^\\d+$', ['123', 'abc']);
  assert.equal(result.ok, true);
  assert.deepEqual(result.results.map((item) => item.matched), [true, false]);
});

test('正则语法错误不会覆盖有效配置', async () => {
  const result = await testRegex('[', ['sample']);
  assert.equal(result.ok, false);
  assert.match(result.error || '', /Invalid regular expression|unterminated/i);
});

test('Worker 超时会终止高风险正则测试', async () => {
  let terminated = false;
  const result = await testRegex('(a+)+$', ['a'.repeat(100)], '', 5, () => ({
    onmessage: null,
    onerror: null,
    postMessage: () => undefined,
    terminate: () => { terminated = true; },
  }));
  assert.equal(result.timedOut, true);
  assert.equal(terminated, true);
});
