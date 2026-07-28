import assert from 'node:assert/strict';
import test from 'node:test';
import { OPERATION_TEMPLATES } from '../../../../server/src/services/template-operation-center';
import { buildTemplateAuditMatrix, assertTemplateAuditMatrix } from './templateAuditMatrix';
import type { OperationTemplateCatalogItem } from './operationTemplateClient';

test('template audit matrix is derived from all production registries', () => {
  const matrix = assertTemplateAuditMatrix(buildTemplateAuditMatrix(OPERATION_TEMPLATES as unknown as OperationTemplateCatalogItem[]));
  assert.equal(matrix.length, 27);
  assert.equal(matrix.filter((item) => item.kind === 'designer').length, 4);
  assert.equal(matrix.filter((item) => item.kind === 'operation').length, 19);
  assert.equal(matrix.filter((item) => item.kind === 'project').length, 4);
  assert.equal(matrix.find((item) => item.id === 'single-table-batch-update')?.successDestination, 'data');
  assert.equal(matrix.find((item) => item.id === 'trend-analysis')?.successDestination, 'results');
  assert.equal(matrix.find((item) => item.id === 'basic-entry')?.primaryAction, '填写并保存表单');
});

test('template audit matrix rejects duplicate or incomplete entries', () => {
  assert.throws(() => assertTemplateAuditMatrix([
    { id: 'same', name: 'A', kind: 'designer', category: 'create', requiredInput: '字段', primaryAction: '保存', successDestination: 'designer', recoveryAction: '返回' },
    { id: 'same', name: 'B', kind: 'operation', category: 'entry', requiredInput: '字段', primaryAction: '保存', successDestination: 'designer', recoveryAction: '返回' },
  ]));
});
