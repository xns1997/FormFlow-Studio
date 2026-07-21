import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const directory = mkdtempSync(join(tmpdir(), 'formflow-llm-management-'));
process.env.LLM_MANAGEMENT_STORE_PATH = join(directory, 'llm-management.json');
process.env.LLM_CONFIG_MASTER_KEY = 'test-master-key-with-at-least-32-characters';
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_BASE_URL;

const { decryptLlmSecret, encryptLlmSecret, llmManagement } = await import('./llm-management');

test.after(() => rmSync(directory, { recursive: true, force: true }));

test('LLM secrets use authenticated encryption and public configs stay masked', () => {
  const encrypted = encryptLlmSecret('secret-value');
  assert.ok(encrypted?.startsWith('v1.'));
  assert.equal(decryptLlmSecret(encrypted), 'secret-value');
  const saved = llmManagement.saveProvider({ name: 'Tenant OpenAI', kind: 'openai', scope: 'tenant', tenantId: 'tenant-a', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-private' }, { tenantId: 'tenant-a' });
  assert.equal(saved.apiKeyMasked, '••••••••');
  assert.equal('encryptedApiKey' in saved, false);
  const raw = readFileSync(process.env.LLM_MANAGEMENT_STORE_PATH!, 'utf8');
  assert.equal(raw.includes('sk-private'), false);
});

test('tenant and project scopes are isolated while globals remain visible', () => {
  llmManagement.saveProvider({ name: 'Project Local', kind: 'ollama', scope: 'project', tenantId: 'tenant-a', projectId: 'project-a', baseUrl: 'http://localhost:11434' }, { tenantId: 'tenant-a', projectId: 'project-a' });
  const visibleA = llmManagement.listProviders({ tenantId: 'tenant-a', projectId: 'project-a' });
  const visibleB = llmManagement.listProviders({ tenantId: 'tenant-b', projectId: 'project-b' });
  assert.ok(visibleA.some((item) => item.name === 'Project Local'));
  assert.equal(visibleB.some((item) => item.name === 'Project Local'), false);
  assert.ok(visibleA.some((item) => item.id === 'provider-ollama-default'));
  assert.ok(visibleB.some((item) => item.id === 'provider-ollama-default'));
});

test('profiles validate provider references and protect referenced providers', () => {
  const provider = llmManagement.listProviders({ tenantId: 'tenant-a' }).find((item) => item.name === 'Tenant OpenAI')!;
  const profile = llmManagement.saveProfile({ name: 'Tenant Profile', scope: 'tenant', tenantId: 'tenant-a', capabilities: ['chat'], defaults: { temperature: 0.1 }, routes: [{ providerId: provider.id, model: 'gpt-test' }] }, { tenantId: 'tenant-a' });
  assert.equal(llmManagement.resolveProfile(profile.id, { tenantId: 'tenant-a' }).routes[0].model, 'gpt-test');
  assert.throws(() => llmManagement.removeProvider(provider.id, { tenantId: 'tenant-a' }), /仍被模型 Profile 引用/);
});

test('agent definitions are validated and versioned by Express management', () => {
  const profile = llmManagement.listProfiles({ tenantId: 'tenant-a' }).find((item) => item.name === 'Tenant Profile')!;
  const first = llmManagement.saveAgent({ name: 'Approval Agent', scope: 'tenant', tenantId: 'tenant-a', modelProfileId: profile.id, definition: { entrypoint: 'model', nodes: [{ id: 'model', type: 'model' }, { id: 'done', type: 'end' }], edges: [{ source: 'model', target: 'done' }] } }, { tenantId: 'tenant-a' });
  const second = llmManagement.saveAgent({ ...first, name: first.name, definition: first.definition }, { tenantId: 'tenant-a' });
  assert.equal(first.version, 1);
  assert.equal(second.version, 2);
  assert.throws(() => llmManagement.saveAgent({ name: 'Invalid', scope: 'tenant', tenantId: 'tenant-a', modelProfileId: profile.id, definition: { entrypoint: 'missing', nodes: [{ id: 'done', type: 'end' }], edges: [] } }, { tenantId: 'tenant-a' }), /entrypoint 不存在/);
});

test('rule syntax agent has a dedicated configurable model profile', () => {
  const initial = llmManagement.getRuleAgentSettings({});
  assert.equal(initial.enabled, true);
  const saved = llmManagement.saveRuleAgentSettings({ enabled: false, profileId: 'default-local', maxIterations: 40 }, {});
  assert.equal(saved.enabled, false);
  assert.equal(saved.profileId, 'default-local');
  assert.equal(saved.maxIterations, 32);
});

test('project agent profile follows the configured orchestrator agent', () => {
  const context = {};
  const agent = llmManagement.getAgent('project-orchestrator-agent', context)!;
  assert.equal(llmManagement.getProjectAgentProfileId(context), 'default-cloud');
  llmManagement.saveAgent({ ...agent, name: agent.name, scope: agent.scope, modelProfileId: 'default-local', definition: agent.definition }, context);
  assert.equal(llmManagement.getProjectAgentProfileId(context), 'default-local');
});
