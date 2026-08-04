import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.FORMFLOW_DATABASE_REQUIRED = 'false';
process.env.FORMFLOW_DATABASE_AUTO_START = 'false';
const testRoot = mkdtempSync(join(tmpdir(), 'agent-core-store-'));
process.env.AGENT_THREAD_STORE_PATH = join(testRoot, 'threads.json');
process.env.AGENT_BUNDLE_STORE_PATH = join(testRoot, 'bundles.json');
process.env.FORMFLOW_PROJECTS_DIR = join(testRoot, 'projects');
process.env.FORMFLOW_DATA_DIR = join(testRoot, 'data');

const {
  acquireAgentThreadLease, appendAgentThreadEvent, createAgentThread, defaultCapabilityBundle,
  getAgentThread, getCapabilityBundle, hasAgentThreadLease, initializeAgentStore,
  listCapabilityBundles, releaseAgentThreadLease, saveCapabilityBundleDraft, setAgentThreadMode, validateBundle,
} = await import('./store');

test.after(() => rmSync(testRoot, { recursive: true, force: true }));

test('agent store persists threads, monotonic events and bundles', async () => {
  await initializeAgentStore();
  const bundle = defaultCapabilityBundle();
  assert.deepEqual(validateBundle(bundle), { valid: true });
  assert.ok(listCapabilityBundles('local').some((item) => item.id === 'cap_default_v1'));

  const thread = createAgentThread({ tenantId: 'local', userId: 'local', projectIds: ['p1'], currentProjectId: 'p1', profileId: 'default-cloud' });
  assert.equal(thread.schemaVersion, 1);
  assert.equal(thread.mode, 'plan');
  assert.equal(thread.status, 'idle');
  assert.equal(thread.events.length, 0);

  appendAgentThreadEvent(thread, 'turn_started', {});
  appendAgentThreadEvent(thread, 'plan_proposed', { goal: 'g' });
  assert.equal(thread.events.length, 2);
  assert.equal(thread.events[1].seq, 2);

  const reloaded = getAgentThread(thread.id)!;
  assert.equal(reloaded, thread);
  assert.equal(reloaded.events.at(-1)?.type, 'plan_proposed');

  setAgentThreadMode(thread, 'goal');
  assert.equal(getAgentThread(thread.id)!.mode, 'goal');
  assert.throws(() => setAgentThreadMode(thread, 'auto' as never), /必须是 plan 或 goal/);

  assert.equal(hasAgentThreadLease(thread.id), false);
  assert.equal(await acquireAgentThreadLease(thread.id), true);
  assert.equal(await acquireAgentThreadLease(thread.id), false);
  await releaseAgentThreadLease(thread.id);
  assert.equal(hasAgentThreadLease(thread.id), false);
});

test('bundle drafts round-trip and validate', () => {
  const draft = saveCapabilityBundleDraft({ name: '测试能力包', budget: { maxDecisionSteps: 40, maxAttempts: 3, maxToolSteps: 24, maxRecoveryCycles: 6 } }, 'local');
  assert.equal(draft.status, 'draft');
  const loaded = getCapabilityBundle(draft.id, 'local');
  assert.equal(loaded?.name, '测试能力包');
  assert.throws(() => validateBundle({ ...loaded!, budget: { ...loaded!.budget, maxDecisionSteps: 0 } }), /最大决策步数/);
});
