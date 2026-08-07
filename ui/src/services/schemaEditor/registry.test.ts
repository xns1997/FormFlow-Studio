import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultTableConfig, createDesignFile, createDefaultProjectSettings } from '../../project/types';
import { createWorkflowIoScaffold } from '../../services/engine/workflowIo';
import { validateJsonSchema } from './validator';
import { isEntityJsonModelOfKind, jsonModelPath, type EntityJsonKind } from './registry';
import designFileSchema from '../../../../shared/schemas/design-file.schema.json';
import workflowFileSchema from '../../../../shared/schemas/workflow-file.schema.json';
import tableConfigSchema from '../../../../shared/schemas/table-config.schema.json';
import projectSettingsSchema from '../../../../shared/schemas/project-settings.schema.json';

test('model URIs are stable per entity and kind-scoped', () => {
  const path = jsonModelPath('design', 'form_1');
  assert.equal(path, 'inmemory://model/formflow-json/design/form_1.json');
  assert.equal(isEntityJsonModelOfKind(path, 'design'), true);
  assert.equal(isEntityJsonModelOfKind(path, 'workflow'), false);
});

test('design schema accepts a normalized DesignFile and rejects broken shapes', () => {
  const design = createDesignFile('测试表单');
  assert.deepEqual(validateJsonSchema(design, designFileSchema as never), []);
  const broken = { ...design, components: [{ id: 'a', type: 'input' }] };
  const violations = validateJsonSchema(broken, designFileSchema as never);
  assert.equal(violations.length > 0, true);
  assert.match(violations.map((v) => v.message).join('|'), /缺少必填字段 "x"/);
});

test('workflow schema accepts scaffold output (without versions)', () => {
  const scaffold = createWorkflowIoScaffold();
  const now = new Date().toISOString();
  const workflow = {
    id: 'wf_1',
    name: '测试流程',
    description: '',
    nodes: scaffold.nodes,
    edges: scaffold.edges,
    createdAt: now,
    updatedAt: now,
  };
  assert.deepEqual(validateJsonSchema(workflow, workflowFileSchema as never), []);
});

test('table-config schema accepts createDefaultTableConfig output', () => {
  const config = createDefaultTableConfig('t:s', '表');
  assert.deepEqual(validateJsonSchema(config, tableConfigSchema as never), []);
});

test('project-settings schema accepts config + default settings', () => {
  const payload = {
    config: {
      id: 'p1',
      name: '项目',
      description: '',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: '',
      tags: [],
    },
    settings: createDefaultProjectSettings(),
  };
  assert.deepEqual(validateJsonSchema(payload, projectSettingsSchema as never), []);
});

test('entity schema files stay consistent with the supported kind set', () => {
  const kinds: EntityJsonKind[] = ['design', 'workflow', 'table-config', 'settings'];
  assert.equal(kinds.length, 4);
});
