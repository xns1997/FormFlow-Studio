import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROJECT_TEMPLATES,
  createBlankProject,
  createProjectFromTemplate,
  createProjectFromZip,
  parseTagInput,
} from './creation';

const repositoryRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

test('blank project creation generates a new id and applies meta fields', () => {
  const project = createBlankProject({
    name: '客户台账',
    description: '客户跟踪项目',
    author: 'Alice',
    tags: ['销售', '录入'],
  });
  assert.match(project.config.id, /^proj_/);
  assert.equal(project.config.name, '客户台账');
  assert.equal(project.config.description, '客户跟踪项目');
  assert.equal(project.config.author, 'Alice');
  assert.deepEqual(project.config.tags, ['销售', '录入']);
});

test('tag parsing keeps stable trimmed tags', () => {
  assert.deepEqual(parseTagInput(' 销售, 审批, , 报表 '), ['销售', '审批', '报表']);
});

test('template creation keeps skeleton and rewrites meta', () => {
  const project = createProjectFromTemplate('approval_flow', {
    name: '费用审批',
    description: '审批模板',
    author: 'Bob',
    tags: ['审批'],
  });
  assert.equal(project.config.name, '费用审批');
  assert.equal(project.config.author, 'Bob');
  assert.equal(project.workflows.length, 1);
  assert.equal(project.behaviors.length, 1);
  assert.equal(project.designs.length, 1);
});

test('all built-in templates produce valid project structures', () => {
  for (const template of PROJECT_TEMPLATES) {
    const project = createProjectFromTemplate(template.id, {
      name: template.name,
      description: template.description,
      author: 'system',
      tags: [template.kind],
    });
    assert.match(project.config.id, /^proj_/);
    assert.ok(project.designs.length >= 1);
  }
});

test('zip import creation regenerates id instead of keeping original one', async () => {
  const buffer = readFileSync(join(repositoryRoot, 'projects', 'example_sales_approval.zip'));
  const file = new File([buffer], 'example_sales_approval.zip', { type: 'application/zip' });
  const project = await createProjectFromZip(file, {
    name: '导入后的项目',
    description: '来自 zip',
    author: 'Carol',
    tags: ['导入'],
  });
  assert.equal(project.config.name, '导入后的项目');
  assert.notEqual(project.config.id, 'example_sales_approval');
  assert.equal(project.config.author, 'Carol');
});
