import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getStagedUpload, parseSourceBuffer } from './upload-staging';

test('parseSourceBuffer accepts valid JSON data files', () => {
  const result = parseSourceBuffer(Buffer.from(JSON.stringify([{ 姓名: '张三', 分数: 98 }])), 'data.json');
  assert.equal(result.fileType, 'json');
  assert.deepEqual(result.sheets[0].headers, ['姓名', '分数']);
  assert.deepEqual(result.sheets[0].data, [{ 姓名: '张三', 分数: 98 }]);
});

test('parseSourceBuffer reports malformed JSON with a friendly error', () => {
  assert.throws(() => parseSourceBuffer(Buffer.from('{oops'), 'data.json'), /JSON 文件解析失败/);
  assert.throws(() => parseSourceBuffer(Buffer.from('["unclosed'), 'data.json'), /JSON 文件解析失败/);
});

test('getStagedUpload returns null for corrupt metadata', () => {
  const staging = join(tmpdir(), 'formflow-upload-staging');
  mkdirSync(staging, { recursive: true });
  const metaPath = join(staging, 'file_corrupt_meta.json');
  writeFileSync(metaPath, '{not valid json');
  try {
    assert.equal(getStagedUpload('file_corrupt_meta'), null);
  } finally {
    rmSync(metaPath, { force: true });
  }
});
