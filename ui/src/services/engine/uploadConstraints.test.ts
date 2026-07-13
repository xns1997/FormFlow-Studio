import assert from 'node:assert/strict';
import test from 'node:test';
import { validateImageDimensions, validateUploadCandidate } from './uploadConstraints';

test('上传约束在文件进入状态前检查类型、大小与数量', () => {
  const constraints = { accept: '.pdf,image/*', maxFileSizeMb: 1, maxCount: 2 };
  assert.equal(validateUploadCandidate({ name: 'a.pdf', size: 100, type: 'application/pdf' }, 0, constraints), null);
  assert.match(validateUploadCandidate({ name: 'a.exe', size: 100, type: 'application/octet-stream' }, 0, constraints) || '', /类型/);
  assert.match(validateUploadCandidate({ name: 'a.pdf', size: 2 * 1024 * 1024, type: 'application/pdf' }, 0, constraints) || '', /1 MB/);
  assert.match(validateUploadCandidate({ name: 'a.pdf', size: 100, type: 'application/pdf' }, 2, constraints) || '', /最多/);
});

test('图片尺寸上下界检查', () => {
  assert.match(validateImageDimensions(300, 200, { minImageWidth: 400 }) || '', /400px/);
  assert.equal(validateImageDimensions(800, 600, { minImageWidth: 400, maxImageWidth: 1200 }), null);
});
