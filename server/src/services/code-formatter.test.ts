import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCode, FORMAT_LANGUAGES, MAX_FORMAT_CODE_LENGTH } from './code-formatter';

test('code-formatter formats event javascript with oxfmt', async () => {
  assert.ok(FORMAT_LANGUAGES.has('javascript'));
  const result = await formatCode('javascript', 'let a=42;const b={x:1};');
  assert.equal(result.code, 'let a = 42;\nconst b = { x: 1 };\n');
});

test('code-formatter rejects unsupported languages', async () => {
  await assert.rejects(() => formatCode('python', 'x = 1'), /不支持的格式化语言/);
});

test('code-formatter rejects oversized input', async () => {
  await assert.rejects(() => formatCode('javascript', 'x'.repeat(MAX_FORMAT_CODE_LENGTH + 1)), /200KB/);
});
