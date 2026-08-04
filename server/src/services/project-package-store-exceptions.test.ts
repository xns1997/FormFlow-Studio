import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const directory = mkdtempSync(join(tmpdir(), 'formflow-package-exceptions-'));
process.env.FORMFLOW_PROJECTS_DIR = join(directory, 'projects');

const { getTableSheetData, projectPackagePath, readProjectPackage, writeProjectPackage } = await import('./project-package-store');

test.after(() => rmSync(directory, { recursive: true, force: true }));

test('readProjectPackage reports corrupt manifest with a descriptive error', () => {
  const root = projectPackagePath('corrupt_manifest');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'project.json'), '{broken');
  assert.throws(() => readProjectPackage('corrupt_manifest'), /项目包文件损坏/);
});

test('corrupt JSON data file falls back to inline preview rows', () => {
  const project = {
    config: { id: 'corrupt_data', name: '损坏数据', createdAt: '2026-08-03T00:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z' },
    settings: {},
    release: { mode: 'design' },
    srcTable: [{
      id: 't1',
      fileName: 'rows.json',
      fileType: 'json',
      sheets: [{ name: 'Sheet1', headers: ['姓名'], preview: [{ 姓名: '张三' }] }],
    }],
  };
  writeProjectPackage(project as any);
  const dataFile = join(projectPackagePath('corrupt_data'), 'data', 'rows.json');
  writeFileSync(dataFile, '{broken');
  const result = getTableSheetData('corrupt_data', 't1', 'Sheet1');
  assert.ok(result);
  assert.deepEqual(result.data, [{ 姓名: '张三' }]);
});
