import assert from 'node:assert/strict';
import test from 'node:test';
import { compactAgentToolResult, compactToolObservation, toolFailureGuidance } from './project-agent-v2-context';

test('small tool results remain unchanged', () => {
  const value = { ok: true, data: { revision: 'r1' } };
  assert.equal(compactAgentToolResult(value), value);
});

test('large tool results are bounded and explicitly marked', () => {
  const value = { ok: true, data: { rows: Array.from({ length: 500 }, (_, index) => ({ id: index, value: '\\"'.repeat(500) })) } };
  const compacted = compactAgentToolResult(value, 8_000) as Record<string, unknown>;
  assert.equal(compacted.__formflowTruncated, true);
  assert.ok(JSON.stringify(compacted).length <= 8_000);
  assert.ok(Number(compacted.originalChars) > 8_000);
});

test('tool observations keep useful handles and remove orchestration noise', () => {
  const value = compactToolObservation('form.create', { ok: true, data: { id: 'employee-form', name: '员工表单', revision: 'secret-revision', artifactId: 'artifact-1' }, meta: { requestId: 'request-1' } });
  assert.match(JSON.stringify(value), /employee-form/);
  assert.doesNotMatch(JSON.stringify(value), /secret-revision|artifact-1|request-1/);
});

test('failed tool observations tell the current expert how to diagnose instead of blindly retrying', () => {
  const missing: any = compactToolObservation('form.get', { ok: false, error: { code: 'FORM_NOT_FOUND', message: '表单不存在', path: 'id', retryable: false } });
  assert.match(missing.error.nextStep, /先使用 list\/get\/inspect/);
  assert.match(toolFailureGuidance({ code: 'INVALID_ARGUMENT', path: 'item.type' }), /item.type/);
  assert.match(toolFailureGuidance({ code: 'INVALID_ARGUMENT' }, true), /不要重放同一工具/);
});

test('parameter failures return exact correction context to the same expert', () => {
  const observation: any = compactToolObservation('form.update', { ok: false, error: { code: 'REQUIRED_ARGUMENT', message: '缺少参数 item', path: 'item', retryable: false, details: { expectedShape: 'object', receivedShape: 'missing', issues: [{ path: 'item', code: 'REQUIRED_ARGUMENT' }], suggestedArguments: { projectId: 'p1' }, correctionInstruction: '只修正本次工具参数，不要重启任务。' } } });
  assert.equal(observation.error.expected, 'object'); assert.equal(observation.error.received, 'missing'); assert.deepEqual(observation.error.suggestedArguments, { projectId: 'p1' }); assert.match(observation.error.correctionInstruction, /不要重启任务/); assert.match(observation.error.nextStep, /只纠正本次工具参数/);
});
