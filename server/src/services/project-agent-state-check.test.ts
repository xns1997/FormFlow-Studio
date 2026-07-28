import assert from 'node:assert/strict';
import test from 'node:test';
import { compactProjectStateCheck, createProjectStateCheckSummary, summarizeCheckedProject } from './project-agent-state-check';

test('fixed project check keeps business facts and drops full project payload', () => {
  const item = summarizeCheckedProject({ projectId: 'p1', current: true, previousRevision: 'r1',
    inspect: { ok: true, data: { project: { name: '报销管理' }, data: [{ id: 'ds', sheets: [{ name: '员工', columns: ['id'] }] }], forms: [{ id: 'f', name: '录入表单', components: 12 }], workflows: [{ id: 'w', name: '审批', nodes: 4 }], behaviors: { global: 1, sheets: 2, forms: 3 }, outputs: [{ id: 'o' }], testing: { suites: 2, latestPassed: true } } },
    validation: { ok: true, data: { valid: false, errors: [{ message: '缺少主键' }, { message: '引用无效' }] } },
    loaded: { ok: true, data: { revision: 'r2', project: { huge: 'must-not-leak' } } } });
  const summary = createProjectStateCheckSummary('before_question', [item], '2026-07-22T00:00:00.000Z');
  const compact = compactProjectStateCheck(summary); const serialized = JSON.stringify(compact);
  assert.equal(item.revisionChanged, true); assert.equal(item.business.behaviors, 6); assert.equal(item.validation.issueCount, 2);
  assert.match(serialized, /报销管理/); assert.doesNotMatch(serialized, /must-not-leak|"revision"|"projectId"/);
});

test('fixed project check has a stable bounded overview', () => {
  const forms = Array.from({ length: 30 }, (_, index) => ({ id: `f${index}`, name: `表单${index}`, components: index }));
  const item = summarizeCheckedProject({ projectId: 'p', current: true, inspect: { ok: true, data: { forms } }, validation: { ok: true, data: { valid: true } }, loaded: { ok: true, data: { revision: 'r' } } });
  assert.equal(item.business.forms, 30); assert.equal(item.business.formOverview.length, 8);
  assert.ok(JSON.stringify(compactProjectStateCheck(createProjectStateCheckSummary('initial_grounding', [item]))).length < 5000);
});
