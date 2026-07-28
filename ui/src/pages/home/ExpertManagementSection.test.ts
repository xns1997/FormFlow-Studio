import assert from 'node:assert/strict';
import test from 'node:test';
import { replaceExpert, selectedToolNames, type ExpertConfigDraft } from './ExpertManagementSection';

const agents: ExpertConfigDraft[] = [
  { role: 'data', name: '数据专家', description: '', instructions: 'data', tools: [], toolMode: 'all' },
  { role: 'form', name: '表单专家', description: '', instructions: 'form', tools: [], toolMode: 'selected' },
];
const tools = [
  { name: 'form.get', title: '读取表单', description: '', risk: 'read' as const, ownerRole: 'form' },
  { name: 'form.update', title: '更新表单', description: '', risk: 'write' as const, ownerRole: 'form' },
];

test('expert draft updates only the selected registration', () => {
  const next = replaceExpert(agents, 'form', { instructions: 'updated' });
  assert.equal(next[0].instructions, 'data'); assert.equal(next[1].instructions, 'updated'); assert.equal(agents[1].instructions, 'form');
});

test('tool authorization distinguishes all tools from an intentionally empty whitelist', () => {
  assert.deepEqual(selectedToolNames({ ...agents[0], role: 'form' }, tools), ['form.get', 'form.update']);
  assert.deepEqual(selectedToolNames(agents[1], tools), []);
});
