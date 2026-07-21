import assert from 'node:assert/strict';
import test from 'node:test';
import { compileDataToolArguments, dataFailureFingerprint, hasRepeatedDataFailure } from './data-tool-preflight';

const base = { projectId: 'device-project', id: 'devices', baseRevision: 'revision-1', idempotencyKey: 'operation-1' };

test('data preflight safely normalizes nested sheet config and column aliases', () => {
  const result = compileDataToolArguments('data_source.create', { ...base, rows: [{ device_id: 'D-1', name: '设备一' }], config: { sheets: [{ name: 'Sheet1', config: { editable: true, primaryKey: ['device_id'], columns: [{ id: 'device_id', dataType: 'text' }] } }] } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.arguments.config.keyFields, ['device_id']);
  assert.equal(result.arguments.config.readOnly, false);
  assert.deepEqual(result.arguments.config.columns, [{ name: 'device_id', type: 'string' }]);
  assert.ok(result.normalizations.length >= 4);
});

test('data preflight rejects field definitions used as rows and returns a canonical suggestion', () => {
  const result = compileDataToolArguments('data_source.create', { ...base, rows: [{ fieldId: 'device_id', title: '设备编号', type: 'string', isKey: true }, { fieldId: 'name', title: '设备名称', type: 'string' }] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, 'DATA_ROWS_LOOK_LIKE_SCHEMA');
  assert.deepEqual((result.error.suggestedArguments as any).config.keyFields, ['device_id']);
  assert.deepEqual((result.error.suggestedArguments as any).config.columns.map((item: any) => item.name), ['device_id', 'name']);
});

test('data preflight validates source, columns and initial key integrity', () => {
  const missingSource = compileDataToolArguments('data_source.create', { ...base, config: { keyFields: ['id'] } });
  assert.equal(missingSource.ok, false); if (!missingSource.ok) assert.equal(missingSource.error.code, 'DATA_SOURCE_INPUT_REQUIRED');
  const empty = compileDataToolArguments('data_source.create', { ...base, rows: [], config: { keyFields: ['id'] } });
  assert.equal(empty.ok, false); if (!empty.ok) assert.equal(empty.error.code, 'DATA_COLUMNS_REQUIRED');
  const missingKey = compileDataToolArguments('data_source.create', { ...base, rows: [{ name: 'A' }], config: {} });
  assert.equal(missingKey.ok, false); if (!missingKey.ok) assert.equal(missingKey.error.code, 'DATA_KEY_REQUIRED');
  const unknownKey = compileDataToolArguments('data_source.create', { ...base, rows: [{ id: '1' }], config: { keyFields: ['missing'] } });
  assert.equal(unknownKey.ok, false); if (!unknownKey.ok) assert.equal(unknownKey.error.code, 'DATA_KEY_FIELD_MISSING');
  const blank = compileDataToolArguments('data_source.create', { ...base, rows: [{ id: '' }], config: { keyFields: ['id'] } });
  assert.equal(blank.ok, false); if (!blank.ok) assert.equal(blank.error.code, 'DATA_KEY_VALUE_EMPTY');
  const duplicate = compileDataToolArguments('data_source.create', { ...base, rows: [{ id: '1' }, { id: '1' }], config: { keyFields: ['id'] } });
  assert.equal(duplicate.ok, false); if (!duplicate.ok) assert.equal(duplicate.error.code, 'DATA_KEY_VALUE_DUPLICATE');
});

test('historical data-source failure shapes normalize or fail once with actionable guidance', () => {
  const corpus = [
    { rows: [{ device_id: 'D-1' }], config: { sheets: [{ name: 'Sheet1', config: { keyFields: ['device_id'], editable: true } }] } },
    { config: { columns: [{ name: '设备编号', type: 'string' }], primaryKey: ['设备编号'] } },
    { rows: [{ fieldId: 'device_id', title: '设备编号', type: 'string', isKey: true }] },
    { rows: [], config: { sheets: [{ name: 'Sheet1', config: { keyFields: ['device_id'] } }] } },
    { rows: [{ device_id: 'D-1' }], config: { sheets: [{ keyFields: ['设备编号'] }] } },
  ];
  const results = corpus.map((value, index) => compileDataToolArguments('data_source.create', { ...base, idempotencyKey: `history-${index}`, ...value }));
  assert.deepEqual(results.map((result) => result.ok ? 'ok' : result.error.code), ['ok', 'ok', 'DATA_ROWS_LOOK_LIKE_SCHEMA', 'DATA_COLUMNS_REQUIRED', 'DATA_KEY_FIELD_MISSING']);
  for (const result of results.filter((item) => !item.ok)) assert.ok(result.error.expectedShape && result.error.receivedShape);
});

test('sheet and batch preflight normalize safely and enforce bounded changes', () => {
  const sheet = compileDataToolArguments('data_sheet.configure', { config: { primaryKey: 'id', isEditable: false } });
  assert.equal(sheet.ok, true); assert.deepEqual(sheet.arguments.config.keyFields, ['id']); assert.equal(sheet.arguments.config.readOnly, true);
  const empty = compileDataToolArguments('data_rows.batch', { adds: [], updates: [], deletes: [] });
  assert.equal(empty.ok, false); if (!empty.ok) assert.equal(empty.error.code, 'DATA_BATCH_EMPTY');
  const tooMany = compileDataToolArguments('data_rows.batch', { adds: Array.from({ length: 1001 }, (_, id) => ({ id })) });
  assert.equal(tooMany.ok, false); if (!tooMany.ok) assert.equal(tooMany.error.code, 'DATA_BATCH_LIMIT_EXCEEDED');
});

test('data failure fingerprints collapse values but distinguish argument structure', () => {
  const first = dataFailureFingerprint('data_source.create', { code: 'DATA_KEY_REQUIRED', path: 'config.keyFields' }, { rows: [{ id: '1' }], config: {} });
  const sameShape = dataFailureFingerprint('data_source.create', { code: 'DATA_KEY_REQUIRED', path: 'config.keyFields' }, { rows: [{ id: '2' }], config: {} });
  const changed = dataFailureFingerprint('data_source.create', { code: 'DATA_KEY_REQUIRED', path: 'config.keyFields' }, { rows: [{ id: '2' }], config: { columns: [] } });
  assert.equal(first.value, sameShape.value); assert.notEqual(first.value, changed.value);
  assert.equal(hasRepeatedDataFailure([{ data: { taskId: 'data-task', failureFingerprint: first.value } }], 'data-task', first.value), true);
  assert.equal(hasRepeatedDataFailure([{ data: { taskId: 'other', failureFingerprint: first.value } }], 'data-task', first.value), false);
});
