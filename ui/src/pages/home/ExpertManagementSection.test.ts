import assert from 'node:assert/strict';
import test from 'node:test';
import { scopeSelectedToolNames, type ScopeRole } from './ExpertManagementSection';
import type { ProjectAgentScopeConfig } from '../../components/projectAgentUiModel';

const roles: ScopeRole[] = ['project', 'data', 'form', 'workflow', 'behavior', 'quality', 'delivery'];

function scope(overrides: Partial<ProjectAgentScopeConfig>): ProjectAgentScopeConfig {
  return {
    role: 'form',
    name: '表单',
    description: '',
    instructions: 'form',
    tools: [],
    toolMode: 'all',
    knowledge: [],
    ...overrides,
  };
}

const tools = [
  { name: 'form.get', title: '读取表单', risk: 'read' },
  { name: 'form.update', title: '更新表单', risk: 'write' },
];

test('every capability bundle scope is one of the seven MCP roles', () => {
  assert.equal(roles.length, 7);
  assert.ok(roles.includes('data'));
  assert.ok(roles.includes('delivery'));
  assert.equal((roles as readonly string[]).includes('coordinator'), false);
});

test('tool authorization distinguishes all tools from an intentionally empty whitelist', () => {
  assert.deepEqual(scopeSelectedToolNames(scope({ role: 'form' }), tools), ['form.get', 'form.update']);
  assert.deepEqual(scopeSelectedToolNames(scope({ role: 'form', toolMode: 'selected', tools: [] }), tools), []);
  assert.deepEqual(scopeSelectedToolNames(scope({ role: 'form', toolMode: 'selected', tools: ['form.update'] }), tools), ['form.update']);
});
