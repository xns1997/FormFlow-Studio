import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExpertRegistry, buildSpecialistSystemPrompt, enabledExpertKnowledgePrompt, expertTeamKnowledge, suggestedExpertRole } from './project-agent-expert-registry';
import { defaultCapabilityBundle, validateCapabilityBundle } from './project-agent-v2-store';

test('expert registry exposes effective tools and every knowledge source without release apply', () => {
  const bundle = defaultCapabilityBundle('u'); const form = bundle.agents.find((item) => item.role === 'form')!;
  form.toolMode = 'selected'; form.tools = ['form.get']; form.knowledge = [{ id: 'brand', title: '品牌规范', content: '主色使用蓝色。', enabled: true }];
  const registry = buildExpertRegistry({ ...bundle, status: 'draft', ownerId: 'u' }); const expert = registry.experts.find((item) => item.role === 'form')!;
  assert.equal(registry.bundle.editable, true);
  assert.deepEqual(expert.tools.map((item) => item.name), ['form.get']);
  assert.ok(expert.availableTools.length > expert.tools.length);
  assert.ok(expert.knowledge.some((item) => item.source === 'system'));
  assert.ok(expert.knowledge.some((item) => item.source === 'runtime'));
  assert.ok(expert.knowledge.some((item) => item.source === 'bundle' && item.title === '品牌规范'));
  assert.ok(expert.knowledge.some((item) => item.id === 'runtime:expert-team' && /数据专家/.test(item.content)));
  assert.match(expert.prompt.preview, /运行时注入/);
  assert.match(expert.prompt.preview, /其他领域解决/);
  assert.equal(expert.availableTools.some((item) => item.name === 'release.apply'), false);
});

test('specialists receive the real team registry and can name a temporary helper', () => {
  const bundle = defaultCapabilityBundle('u'); const knowledge = expertTeamKnowledge(bundle, 'form');
  assert.equal(knowledge.peers.some((item) => item.role === 'data' && item.tools.length > 0), true);
  const prompt = buildSpecialistSystemPrompt({ bundle, role: 'form', runtimeContext: '当前任务：创建录入表单' });
  assert.match(prompt, /团队协作知识/); assert.match(prompt, /需要协作专家/); assert.match(prompt, /数据专家/);
  assert.equal(suggestedExpertRole('需要协作专家：behavior；需要补充字段联动规则', 'form'), 'behavior');
  assert.equal(suggestedExpertRole('数据源缺少唯一主键，需要先修正', 'form'), 'data');
});

test('selected tool mode can intentionally disable every tool', () => {
  const bundle = defaultCapabilityBundle('u'); const data = bundle.agents.find((item) => item.role === 'data')!;
  data.toolMode = 'selected'; data.tools = [];
  const expert = buildExpertRegistry(bundle).experts.find((item) => item.role === 'data')!;
  assert.equal(expert.availableTools.length > 0, true); assert.deepEqual(expert.tools, []);
});

test('enabled capability knowledge is injected and invalid registrations are rejected', () => {
  const bundle = defaultCapabilityBundle('u'); const agent = bundle.agents.find((item) => item.role === 'behavior')!;
  agent.knowledge = [{ id: 'terms', title: '业务术语', content: '客户指已完成实名的主体。', enabled: true }, { id: 'off', title: '停用内容', content: '不应注入', enabled: false }];
  const prompt = enabledExpertKnowledgePrompt(agent); assert.match(prompt, /业务术语/); assert.doesNotMatch(prompt, /不应注入/); assert.deepEqual(validateCapabilityBundle(bundle), { valid: true });
  bundle.agents = bundle.agents.filter((item) => item.role !== 'quality'); assert.throws(() => validateCapabilityBundle(bundle), /缺少 quality 专家/);
});
