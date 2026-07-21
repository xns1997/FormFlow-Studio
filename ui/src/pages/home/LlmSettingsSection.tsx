import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, InputNumber, Select, Switch, message } from 'antd';
import { llmApi } from '../../services/io/api';
import { useAppInteraction } from '../../components/AppInteractionProvider';

type ProviderKind = 'openai' | 'openai_compatible' | 'anthropic' | 'gemini' | 'ollama' | 'lmstudio';
type Capability = 'chat' | 'stream' | 'tools' | 'structured_output' | 'embedding';

interface ProviderView {
  id: string; name: string; kind: ProviderKind; baseUrl: string; timeoutMs: number; enabled: boolean;
  apiKeyConfigured?: boolean; apiKeyMasked?: string;
}

interface ModelProfileView {
  id: string; name: string; capabilities: Capability[]; defaults: { temperature?: number; maxTokens?: number };
  routes: Array<{ providerId: string; model: string }>; enabled: boolean;
}

interface AgentView {
  id: string; name: string; version: number; scope: 'global' | 'tenant' | 'project'; tenantId?: string; projectId?: string;
  modelProfileId: string; definition: Record<string, unknown>; enabled: boolean;
}
interface CapabilityBundleView { id: string; bundleId: string; version: number; ownerId: string; name: string; description: string; status: 'draft' | 'published'; agents: unknown[]; context: { recentMessages: number; maxSummaryChars: number }; budget: { maxParallelReads: number; maxAttempts: number; maxToolSteps: number }; }

export interface ProviderDraft { id?: string; name: string; kind: ProviderKind; baseUrl: string; apiKey: string; timeoutMs: number; enabled: boolean; }
export interface ProfileDraft { id?: string; name: string; capabilities: Capability[]; temperature: number; maxTokens?: number; routes: Array<{ providerId: string; model: string }>; enabled: boolean; }

const providerDefaults: Record<ProviderKind, string> = {
  openai: 'https://api.openai.com/v1', openai_compatible: '', anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com/v1beta', ollama: 'http://localhost:11434', lmstudio: 'http://localhost:1234/v1',
};

const providerOptions = [
  { value: 'openai', label: 'OpenAI' }, { value: 'openai_compatible', label: 'OpenAI Compatible' },
  { value: 'anthropic', label: 'Anthropic' }, { value: 'gemini', label: 'Gemini' },
  { value: 'ollama', label: 'Ollama' }, { value: 'lmstudio', label: 'LM Studio' },
];

const capabilityOptions: Array<{ value: Capability; label: string }> = [
  { value: 'chat', label: 'Chat' }, { value: 'stream', label: '流式输出' }, { value: 'tools', label: '工具调用' },
  { value: 'structured_output', label: '结构化输出' }, { value: 'embedding', label: 'Embedding' },
];

export function createProviderDraft(): ProviderDraft { return { name: '', kind: 'openai', baseUrl: providerDefaults.openai, apiKey: '', timeoutMs: 60_000, enabled: true }; }
export function providerToDraft(provider: ProviderView): ProviderDraft { return { id: provider.id, name: provider.name, kind: provider.kind, baseUrl: provider.baseUrl, apiKey: '', timeoutMs: provider.timeoutMs, enabled: provider.enabled }; }
export function createProfileDraft(providerId = ''): ProfileDraft { return { name: '', capabilities: ['chat', 'stream'], temperature: 0.2, routes: [{ providerId, model: '' }], enabled: true }; }
export function profileToDraft(profile: ModelProfileView): ProfileDraft { return { id: profile.id, name: profile.name, capabilities: [...profile.capabilities], temperature: profile.defaults.temperature ?? 0.2, maxTokens: profile.defaults.maxTokens, routes: profile.routes.map((route) => ({ ...route })), enabled: profile.enabled }; }

export default function LlmSettingsSection() {
  const { confirm } = useAppInteraction();
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [profiles, setProfiles] = useState<ModelProfileView[]>([]);
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [plugins, setPlugins] = useState<Array<{ id: string; version: string; enabled: boolean }>>([]);
  const [health, setHealth] = useState<{ status?: string; version?: string; checkpointStoreReady?: boolean; checkpointStore?: string }>({});
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(() => createProviderDraft());
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() => createProfileDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ruleAgent, setRuleAgent] = useState({ enabled: true, profileId: 'default-cloud', maxIterations: 12 });
  const [projectAgentProfileId, setProjectAgentProfileId] = useState('default-cloud');
  const [capabilityBundles, setCapabilityBundles] = useState<CapabilityBundleView[]>([]);
  const [defaultBundleId, setDefaultBundleId] = useState(() => { try { return localStorage.getItem('formflow.projectAgent.bundle') || 'cap_default_v1'; } catch { return 'cap_default_v1'; } });
  const [bundleDraft, setBundleDraft] = useState({ id: '', name: '', description: '', agentsJson: '[]', maxParallelReads: 4, maxAttempts: 3, maxToolSteps: 32 });

  const refresh = useCallback(async () => {
    setLoading(true);
    const [providerResult, profileResult, agentResult, pluginResult, healthResult, ruleAgentResult, bundleResult] = await Promise.allSettled([
        llmApi.providers.list(), llmApi.profiles.list(), llmApi.agents.list(), llmApi.plugins(), llmApi.health(), llmApi.ruleAgent.settings(), llmApi.projectAgent.capabilityBundles.list(),
    ]);
    const failures = [providerResult, profileResult, agentResult].filter((result) => result.status === 'rejected');
    if (providerResult.status === 'fulfilled') {
      const nextProviders = providerResult.value || [];
      setProviders(nextProviders);
      setProfileDraft((current) => {
        if (current.routes[0]?.providerId || !nextProviders.length) return current;
        return { ...current, routes: [{ ...current.routes[0], providerId: nextProviders[0].id }, ...current.routes.slice(1)] };
      });
    }
    if (profileResult.status === 'fulfilled') setProfiles(profileResult.value || []);
    if (agentResult.status === 'fulfilled') {
      const nextAgents = agentResult.value || [];
      setAgents(nextAgents);
      setProjectAgentProfileId(nextAgents.find((item: AgentView) => item.id === 'project-orchestrator-agent')?.modelProfileId || 'default-cloud');
    }
    if (pluginResult.status === 'fulfilled') setPlugins(pluginResult.value?.plugins || pluginResult.value?.data || []);
    else setPlugins([]);
    if (healthResult.status === 'fulfilled') setHealth(healthResult.value || {});
    else setHealth({ status: 'unavailable' });
    if (ruleAgentResult.status === 'fulfilled') setRuleAgent(ruleAgentResult.value);
    if (bundleResult.status === 'fulfilled') { const nextBundles = bundleResult.value || []; setCapabilityBundles(nextBundles); if (!nextBundles.some((item: CapabilityBundleView) => item.id === defaultBundleId && item.status === 'published')) setDefaultBundleId(nextBundles.find((item: CapabilityBundleView) => item.status === 'published')?.id || 'cap_default_v1'); }
    if (failures.length) {
      const reason = failures[0].status === 'rejected' ? failures[0].reason : undefined;
      message.error(reason instanceof Error ? reason.message : '部分大模型配置加载失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const providerChoices = useMemo(() => providers.map((provider) => ({ value: provider.id, label: `${provider.name} · ${provider.kind}` })), [providers]);

  async function saveProvider() {
    if (!providerDraft.name.trim() || !providerDraft.baseUrl.trim()) return message.warning('请填写 Provider 名称和 Base URL');
    setSaving(true);
    try {
      const payload = { ...providerDraft, name: providerDraft.name.trim(), baseUrl: providerDraft.baseUrl.trim(), scope: 'global' };
      if (providerDraft.id) await llmApi.providers.update(providerDraft.id, payload); else await llmApi.providers.save(payload);
      message.success('Provider 已保存'); setProviderDraft(createProviderDraft()); await refresh();
    } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  }

  async function removeProvider(provider: ProviderView) {
    if (!await confirm({ title: '删除 Provider？', message: `确定删除“${provider.name}”？`, detail: '依赖此 Provider 的模型路由可能无法使用。', confirmLabel: '删除 Provider', destructive: true })) return;
    try { await llmApi.providers.remove(provider.id); message.success('Provider 已删除'); if (providerDraft.id === provider.id) setProviderDraft(createProviderDraft()); await refresh(); }
    catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
  }

  async function testProvider(provider: ProviderView) {
    const model = profiles.flatMap((profile) => profile.routes).find((route) => route.providerId === provider.id)?.model;
    try { const result = await llmApi.providers.test(provider.id, model); message.success(`连接成功，发现 ${(result.models || []).length} 个模型`); }
    catch (error) { message.error(`连接失败：${error instanceof Error ? error.message : String(error)}`); }
  }

  async function saveProfile() {
    if (!profileDraft.name.trim() || !profileDraft.routes.length || profileDraft.routes.some((route) => !route.providerId || !route.model.trim())) return message.warning('请填写 Profile 名称，并补全每一条模型路由');
    setSaving(true);
    try {
      const payload = { name: profileDraft.name.trim(), scope: 'global', capabilities: profileDraft.capabilities, defaults: { temperature: profileDraft.temperature, maxTokens: profileDraft.maxTokens }, routes: profileDraft.routes.map((route) => ({ ...route, model: route.model.trim() })), enabled: profileDraft.enabled };
      if (profileDraft.id) await llmApi.profiles.update(profileDraft.id, payload); else await llmApi.profiles.save(payload);
      message.success('模型 Profile 已保存'); setProfileDraft(createProfileDraft(providers[0]?.id)); await refresh();
    } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  }

  async function removeProfile(profile: ModelProfileView) {
    if (!await confirm({ title: '删除模型 Profile？', message: `确定删除“${profile.name}”？`, detail: '依赖此 Profile 的智能体配置可能无法运行。', confirmLabel: '删除 Profile', destructive: true })) return;
    try { await llmApi.profiles.remove(profile.id); message.success('Profile 已删除'); if (profileDraft.id === profile.id) setProfileDraft(createProfileDraft(providers[0]?.id)); await refresh(); }
    catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
  }

  async function saveRuleAgent() {
    setSaving(true);
    try { setRuleAgent(await llmApi.ruleAgent.saveSettings(ruleAgent)); message.success('规则语法智能体设置已保存'); }
    catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  }

  async function saveProjectAgent() {
    const agent = agents.find((item) => item.id === 'project-orchestrator-agent');
    if (!agent) return message.error('项目编排智能体配置不存在');
    if (!profiles.some((item) => item.id === projectAgentProfileId && item.enabled)) return message.warning('请选择已启用的模型 Profile');
    setSaving(true);
    try {
      await llmApi.agents.update(agent.id, { name: agent.name, scope: agent.scope, tenantId: agent.tenantId, projectId: agent.projectId, modelProfileId: projectAgentProfileId, definition: agent.definition, enabled: agent.enabled });
      message.success('项目编排智能体模型已保存，新会话将使用该 Profile'); await refresh();
    } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  }

  function editBundle(bundle?: CapabilityBundleView) { setBundleDraft(bundle ? { id: bundle.id, name: bundle.name, description: bundle.description, agentsJson: JSON.stringify(bundle.agents, null, 2), ...bundle.budget } : { id: '', name: '', description: '', agentsJson: '[]', maxParallelReads: 4, maxAttempts: 3, maxToolSteps: 32 }); }
  async function saveBundle() {
    let agents: unknown[]; try { agents = JSON.parse(bundleDraft.agentsJson); if (!Array.isArray(agents)) throw new Error(); } catch { return message.warning('智能体配置必须是 JSON 数组'); }
    if (!bundleDraft.name.trim()) return message.warning('请填写能力包名称'); setSaving(true);
    try { const payload = { name: bundleDraft.name.trim(), description: bundleDraft.description, agents, budget: { maxParallelReads: bundleDraft.maxParallelReads, maxAttempts: bundleDraft.maxAttempts, maxToolSteps: bundleDraft.maxToolSteps }, context: { recentMessages: 8, maxSummaryChars: 6000 } }; const saved = bundleDraft.id ? await llmApi.projectAgent.capabilityBundles.update(bundleDraft.id, payload) : await llmApi.projectAgent.capabilityBundles.create(payload); await llmApi.projectAgent.capabilityBundles.validate(saved.id); message.success('能力包草稿已保存并通过校验'); editBundle(); await refresh(); }
    catch (error) { message.error(error instanceof Error ? error.message : String(error)); } finally { setSaving(false); }
  }
  async function publishBundle(bundle: CapabilityBundleView) { if (!await confirm({ title: '发布能力包？', message: `发布“${bundle.name}”v${bundle.version}？`, detail: '发布后的版本不可修改，新会话可以选择使用。', confirmLabel: '发布版本' })) return; try { await llmApi.projectAgent.capabilityBundles.publish(bundle.id); message.success('能力包版本已发布，新会话可以选择使用'); await refresh(); } catch (error) { message.error(error instanceof Error ? error.message : String(error)); } }

  return <div className="settings-card-stack llm-settings">
    <section className="settings-card llm-runtime-card">
      <div className="settings-card-header"><div className="settings-card-title"><h3>Provider 服务</h3><p>前端只连接 Express；模型密钥加密保存在服务端，Python Provider 不持久化凭据。</p></div><Button size="small" loading={loading} onClick={() => void refresh()}>刷新</Button></div>
      <div className="settings-kpi-row"><span className={`settings-kpi-chip ${health.status === 'ok' ? 'is-success' : 'is-warning'}`}><strong>{health.status === 'ok' ? '在线' : '不可用'}</strong> Provider {health.version || '--'}</span><span className="settings-kpi-chip"><strong>{providers.length}</strong> 连接</span><span className="settings-kpi-chip"><strong>{profiles.length}</strong> 模型 Profile</span><span className="settings-kpi-chip"><strong>{health.checkpointStoreReady ? '已连接' : '降级'}</strong> {health.checkpointStore === 'postgresql' ? 'PostgreSQL checkpoint' : '内存 checkpoint'}</span></div>
    </section>

    <section className="settings-card llm-config-card">
      <div className="settings-card-header"><div className="settings-card-title"><h3>模型 Provider</h3><p>配置云端服务、Ollama 或 LM Studio。编辑时 API Key 留空表示保留原密钥。</p></div><Button size="small" onClick={() => setProviderDraft(createProviderDraft())}>新建 Provider</Button></div>
      <div className="llm-settings-split"><div className="llm-settings-list">{providers.map((provider) => <div className={`llm-settings-item ${providerDraft.id === provider.id ? 'active' : ''}`} key={provider.id}><button type="button" onClick={() => setProviderDraft(providerToDraft(provider))}><strong>{provider.name}</strong><span>{provider.kind} · {provider.apiKeyConfigured ? '密钥已配置' : '无密钥'}</span></button><div><Button size="small" onClick={() => void testProvider(provider)}>测试</Button><Button size="small" danger onClick={() => void removeProvider(provider)}>删除</Button></div></div>)}</div>
        <div className="settings-form llm-settings-form"><div className="settings-grid"><label><span>名称</span><Input value={providerDraft.name} onChange={(event) => setProviderDraft({ ...providerDraft, name: event.target.value })} placeholder="例如：生产 OpenAI" /></label><label><span>类型</span><Select value={providerDraft.kind} options={providerOptions} onChange={(kind: ProviderKind) => setProviderDraft({ ...providerDraft, kind, baseUrl: providerDefaults[kind] })} /></label><label className="llm-settings-wide"><span>Base URL</span><Input value={providerDraft.baseUrl} onChange={(event) => setProviderDraft({ ...providerDraft, baseUrl: event.target.value })} /></label><label><span>API Key</span><Input.Password autoComplete="new-password" value={providerDraft.apiKey} onChange={(event) => setProviderDraft({ ...providerDraft, apiKey: event.target.value })} placeholder={providerDraft.id ? '留空以保留现有密钥' : '本地模型可留空'} /></label><label><span>超时（毫秒）</span><InputNumber min={1000} max={600000} value={providerDraft.timeoutMs} onChange={(value) => setProviderDraft({ ...providerDraft, timeoutMs: Number(value) || 60000 })} /></label></div><div className="llm-settings-actions"><label><Switch checked={providerDraft.enabled} onChange={(enabled) => setProviderDraft({ ...providerDraft, enabled })} /> 启用</label><Button type="primary" loading={saving} onClick={() => void saveProvider()}>保存 Provider</Button></div></div>
      </div>
    </section>

    <section className="settings-card llm-config-card">
      <div className="settings-card-header"><div className="settings-card-title"><h3>模型 Profile</h3><p>业务调用只引用 Profile；路由按顺序尝试，后续条目作为首个输出前的 fallback。</p></div><Button size="small" onClick={() => setProfileDraft(createProfileDraft(providers[0]?.id))}>新建 Profile</Button></div>
      <div className="llm-settings-split"><div className="llm-settings-list">{profiles.map((profile) => <div className={`llm-settings-item ${profileDraft.id === profile.id ? 'active' : ''}`} key={profile.id}><button type="button" onClick={() => setProfileDraft(profileToDraft(profile))}><strong>{profile.name}</strong><span>{profile.routes.map((route) => route.model).join(' → ')}</span></button><Button size="small" danger onClick={() => void removeProfile(profile)}>删除</Button></div>)}</div>
        <div className="settings-form llm-settings-form"><div className="settings-grid"><label><span>名称</span><Input value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} /></label><label><span>Temperature</span><InputNumber min={0} max={2} step={0.1} value={profileDraft.temperature} onChange={(value) => setProfileDraft({ ...profileDraft, temperature: Number(value) || 0 })} /></label><label><span>最大输出 Token</span><InputNumber min={1} max={1000000} value={profileDraft.maxTokens} placeholder="使用模型默认值" onChange={(value) => setProfileDraft({ ...profileDraft, maxTokens: value == null ? undefined : Number(value) })} /></label><label className="llm-settings-wide"><span>能力声明</span><Select mode="multiple" value={profileDraft.capabilities} options={capabilityOptions} onChange={(capabilities: Capability[]) => setProfileDraft({ ...profileDraft, capabilities })} /></label></div><div className="llm-route-list">{profileDraft.routes.map((route, index) => <div className="llm-route-row" key={`${index}:${route.providerId}`}><span>{index === 0 ? '主路由' : `Fallback ${index}`}</span><Select value={route.providerId || undefined} options={providerChoices} placeholder="选择 Provider" onChange={(providerId) => setProfileDraft({ ...profileDraft, routes: profileDraft.routes.map((item, itemIndex) => itemIndex === index ? { ...item, providerId } : item) })} /><Input value={route.model} placeholder="模型 ID" onChange={(event) => setProfileDraft({ ...profileDraft, routes: profileDraft.routes.map((item, itemIndex) => itemIndex === index ? { ...item, model: event.target.value } : item) })} />{profileDraft.routes.length > 1 && <Button size="small" danger onClick={() => setProfileDraft({ ...profileDraft, routes: profileDraft.routes.filter((_item, itemIndex) => itemIndex !== index) })}>移除</Button>}</div>)}</div><div className="llm-settings-actions"><Button size="small" disabled={!providers.length} onClick={() => setProfileDraft({ ...profileDraft, routes: [...profileDraft.routes, { providerId: providers[0]?.id || '', model: '' }] })}>添加 Fallback</Button><label><Switch checked={profileDraft.enabled} onChange={(enabled) => setProfileDraft({ ...profileDraft, enabled })} /> 启用</label><Button type="primary" loading={saving} onClick={() => void saveProfile()}>保存 Profile</Button></div></div>
      </div>
    </section>

    <section className="settings-card llm-config-card"><div className="settings-card-header"><div className="settings-card-title"><h3>规则语法智能体</h3><p>为规则编辑器的统筹与代码编辑指定独立模型；语法检查、测试和状态读取不使用模型。</p></div></div><div className="settings-form"><div className="settings-grid"><label><span>模型 Profile</span><Select value={ruleAgent.profileId} options={profiles.filter((item) => item.enabled).map((item) => ({ value: item.id, label: item.name }))} onChange={(profileId) => setRuleAgent({ ...ruleAgent, profileId })} /></label><label><span>最大迭代步数</span><InputNumber min={2} max={32} value={ruleAgent.maxIterations} onChange={(value) => setRuleAgent({ ...ruleAgent, maxIterations: Number(value) || 12 })} /></label></div><div className="llm-settings-actions"><label><Switch checked={ruleAgent.enabled} onChange={(enabled) => setRuleAgent({ ...ruleAgent, enabled })} /> 启用</label><Button type="primary" loading={saving} onClick={() => void saveRuleAgent()}>保存智能体设置</Button></div></div></section>

    <section className="settings-card llm-config-card"><div className="settings-card-header"><div className="settings-card-title"><h3>项目编排智能体</h3><p>V2 会话会锁定创建时选择的模型 Profile 与已发布能力包版本，运行中不会漂移。</p></div></div><div className="settings-form"><div className="settings-grid"><label><span>模型 Profile</span><Select value={projectAgentProfileId} options={profiles.filter((item) => item.enabled).map((item) => ({ value: item.id, label: item.name }))} onChange={setProjectAgentProfileId} /></label><label><span>新会话默认能力包</span><Select value={defaultBundleId} options={capabilityBundles.filter((item) => item.status === 'published').map((item) => ({ value: item.id, label: `${item.name} v${item.version}` }))} onChange={(id) => { setDefaultBundleId(id); localStorage.setItem('formflow.projectAgent.bundle', id); }} /></label></div><div className="llm-settings-actions"><Button type="primary" loading={saving} onClick={() => void saveProjectAgent()}>保存项目智能体设置</Button></div></div></section>

    <section className="settings-card llm-config-card"><div className="settings-card-header"><div className="settings-card-title"><h3>我的能力包</h3><p>用户级草稿可配置角色指令、模型与工具子集；服务端会强制收敛到角色白名单并永久禁用 release.apply。</p></div><Button size="small" onClick={() => editBundle()}>新建草稿</Button></div><div className="llm-settings-split"><div className="llm-settings-list">{capabilityBundles.map((bundle) => <div className={`llm-settings-item ${bundleDraft.id === bundle.id ? 'active' : ''}`} key={bundle.id}><button type="button" onClick={() => editBundle(bundle)}><strong>{bundle.name} v{bundle.version}</strong><span>{bundle.status === 'published' ? '已发布' : '草稿'} · {bundle.ownerId === 'system' ? '系统' : '我的'}</span></button>{bundle.status === 'draft' && <Button size="small" onClick={() => void publishBundle(bundle)}>发布</Button>}</div>)}</div><div className="settings-form llm-settings-form"><div className="settings-grid"><label><span>名称</span><Input value={bundleDraft.name} onChange={(event) => setBundleDraft({ ...bundleDraft, name: event.target.value })} /></label><label><span>只读并发</span><InputNumber min={1} max={4} value={bundleDraft.maxParallelReads} onChange={(value) => setBundleDraft({ ...bundleDraft, maxParallelReads: Number(value) || 1 })} /></label><label><span>最大尝试</span><InputNumber min={1} max={3} value={bundleDraft.maxAttempts} onChange={(value) => setBundleDraft({ ...bundleDraft, maxAttempts: Number(value) || 1 })} /></label><label><span>工具步数预算</span><InputNumber min={1} max={96} value={bundleDraft.maxToolSteps} onChange={(value) => setBundleDraft({ ...bundleDraft, maxToolSteps: Number(value) || 32 })} /></label><label className="llm-settings-wide"><span>说明</span><Input value={bundleDraft.description} onChange={(event) => setBundleDraft({ ...bundleDraft, description: event.target.value })} /></label><label className="llm-settings-wide"><span>智能体配置 JSON</span><Input.TextArea rows={12} value={bundleDraft.agentsJson} onChange={(event) => setBundleDraft({ ...bundleDraft, agentsJson: event.target.value })} placeholder='[{"role":"coordinator","name":"统筹","instructions":"...","tools":[]}]' /></label></div><div className="llm-settings-actions"><Button type="primary" loading={saving} disabled={!bundleDraft.name.trim()} onClick={() => void saveBundle()}>保存并校验草稿</Button></div></div></div></section>

    <section className="settings-card llm-runtime-card"><div className="settings-card-header"><div className="settings-card-title"><h3>Agent 与插件</h3><p>Agent 定义仍由 Express 管理；Python 插件只能由管理员在部署目录安装。</p></div></div><div className="settings-kpi-row"><span className="settings-kpi-chip"><strong>{agents.length}</strong> Agent</span><span className="settings-kpi-chip"><strong>{agents.filter((item) => item.enabled).length}</strong> 已启用</span><span className="settings-kpi-chip"><strong>{plugins.length}</strong> 已安装插件</span></div>{plugins.length > 0 && <div className="llm-plugin-list">{plugins.map((plugin) => <span key={plugin.id}>{plugin.id} <small>v{plugin.version}</small></span>)}</div>}</section>
  </div>;
}
