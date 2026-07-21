import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfileDraft, createProviderDraft, profileToDraft, providerToDraft } from './LlmSettingsSection';

test('new model settings drafts use safe defaults', () => {
  const provider = createProviderDraft();
  const profile = createProfileDraft('provider-1');

  assert.equal(provider.kind, 'openai');
  assert.equal(provider.baseUrl, 'https://api.openai.com/v1');
  assert.equal(provider.apiKey, '');
  assert.deepEqual(profile.routes, [{ providerId: 'provider-1', model: '' }]);
  assert.deepEqual(profile.capabilities, ['chat', 'stream']);
});

test('editing a provider never copies its masked credential into the write field', () => {
  const draft = providerToDraft({
    id: 'provider-1',
    name: 'Production OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    timeoutMs: 30_000,
    enabled: true,
    apiKeyConfigured: true,
    apiKeyMasked: 'sk-****1234',
  });

  assert.equal(draft.apiKey, '');
  assert.equal(draft.id, 'provider-1');
});

test('editing a model profile preserves ordered fallback routes without sharing arrays', () => {
  const source = {
    id: 'profile-1',
    name: 'General chat',
    capabilities: ['chat', 'stream'] as const,
    defaults: { temperature: 0.4, maxTokens: 4096 },
    routes: [
      { providerId: 'provider-1', model: 'primary-model' },
      { providerId: 'provider-2', model: 'fallback-model' },
    ],
    enabled: true,
  };
  const draft = profileToDraft({ ...source, capabilities: [...source.capabilities] });

  assert.equal(draft.maxTokens, 4096);
  assert.deepEqual(draft.routes, source.routes);
  draft.routes[0].model = 'changed';
  assert.equal(source.routes[0].model, 'primary-model');
});
