import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Empty, Input, Select, Spin, Switch, Tabs, Tag, message } from 'antd';
import { DesignerIcon } from '../../designer/icons';
import { llmApi } from '../../services/io/api';
import { useAppInteraction } from '../../components/AppInteractionProvider';

export type ExpertRole = 'coordinator' | 'project' | 'data' | 'form' | 'workflow' | 'behavior' | 'quality' | 'delivery';
export type ExpertKnowledgeDraft = { id: string; title: string; content: string; enabled: boolean };
export type ExpertConfigDraft = { role: ExpertRole; name: string; description: string; instructions: string; profileId?: string; tools: string[]; toolMode?: 'all' | 'selected'; knowledge?: ExpertKnowledgeDraft[] };
type BundleView = { id: string; bundleId: string; version: number; ownerId: string; name: string; description: string; status: 'draft' | 'published'; agents: ExpertConfigDraft[]; context: { recentMessages: number; maxSummaryChars: number }; budget: Record<string, number | undefined> };
type ToolView = { name: string; title: string; description: string; risk: 'read' | 'write' | 'destructive'; ownerRole: string };
type KnowledgeView = ExpertKnowledgeDraft & { source: 'system' | 'runtime' | 'bundle'; editable: boolean };
type PromptRegistration = { mode: 'runtime_template'; note: string; preview: string; layers: Array<{ id: string; title: string; source: 'system' | 'runtime' | 'bundle'; editable: boolean }> };
type RegistryExpert = Omit<ExpertConfigDraft, 'toolMode' | 'tools' | 'knowledge'> & { toolMode: 'none' | 'all' | 'selected'; tools: ToolView[]; availableTools: ToolView[]; knowledge: KnowledgeView[]; prompt: PromptRegistration };
type RegistryView = { bundle: { id: string; name: string; version: number; status: 'draft' | 'published'; ownerId: string; editable: boolean }; experts: RegistryExpert[] };

const roleIcons: Record<ExpertRole, string> = { coordinator: 'workflow', project: 'settings', data: 'data', form: 'design', workflow: 'workflow', behavior: 'behavior', quality: 'test', delivery: 'upload' };
const riskLabels = { read: '只读', write: '写入', destructive: '高风险' } as const;

export function replaceExpert<T extends { role: ExpertRole }>(agents: T[], role: ExpertRole, patch: Partial<T>) {
  return agents.map((agent) => agent.role === role ? { ...agent, ...patch } : agent);
}

export function selectedToolNames(agent: ExpertConfigDraft, availableTools: ToolView[]) {
  const mode = agent.toolMode || (agent.tools.length ? 'selected' : 'all'); return mode === 'all' ? availableTools.map((tool) => tool.name) : agent.tools;
}

export default function ExpertManagementSection() {
  const { confirm } = useAppInteraction();
  const [bundles, setBundles] = useState<BundleView[]>([]);
  const [bundleId, setBundleId] = useState('');
  const [registry, setRegistry] = useState<RegistryView>();
  const [draftAgents, setDraftAgents] = useState<ExpertConfigDraft[]>([]);
  const [selectedRole, setSelectedRole] = useState<ExpertRole>('coordinator');
  const [toolQuery, setToolQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadBundles = useCallback(async (preferredId?: string) => {
    const next = await llmApi.projectAgent.capabilityBundles.list() as BundleView[]; setBundles(next);
    setBundleId((current) => preferredId || (next.some((item) => item.id === current) ? current : next.find((item) => item.status === 'draft')?.id || next.find((item) => item.status === 'published')?.id || ''));
  }, []);

  useEffect(() => { void loadBundles().catch((error) => message.error(error instanceof Error ? error.message : String(error))).finally(() => setLoading(false)); }, [loadBundles]);
  useEffect(() => {
    if (!bundleId) return;
    setLoading(true); void llmApi.projectAgent.capabilityBundles.experts(bundleId).then((value: RegistryView) => {
      setRegistry(value); const bundle = bundles.find((item) => item.id === bundleId); setDraftAgents(structuredClone(bundle?.agents || []));
      if (!value.experts.some((item) => item.role === selectedRole)) setSelectedRole(value.experts[0]?.role || 'coordinator');
    }).catch((error) => message.error(error instanceof Error ? error.message : String(error))).finally(() => setLoading(false));
  }, [bundleId, bundles]);

  const bundle = bundles.find((item) => item.id === bundleId); const editable = Boolean(registry?.bundle.editable);
  const registryExpert = registry?.experts.find((item) => item.role === selectedRole); const agent = draftAgents.find((item) => item.role === selectedRole);
  const activeTools = useMemo(() => agent && registryExpert ? new Set(selectedToolNames(agent, registryExpert.availableTools)) : new Set<string>(), [agent, registryExpert]);
  const visibleTools = useMemo(() => (registryExpert?.availableTools || []).filter((tool) => `${tool.title} ${tool.name} ${tool.description}`.toLowerCase().includes(toolQuery.trim().toLowerCase())), [registryExpert, toolQuery]);
  const systemKnowledge = registryExpert?.knowledge.filter((item) => item.source !== 'bundle') || [];
  const customKnowledge = agent?.knowledge || [];

  function patchAgent(patch: Partial<ExpertConfigDraft>) { setDraftAgents((current) => replaceExpert(current, selectedRole, patch)); }
  function toggleTool(name: string, checked: boolean) {
    if (!agent || !registryExpert) return; const next = new Set(selectedToolNames(agent, registryExpert.availableTools)); if (checked) next.add(name); else next.delete(name); patchAgent({ tools: [...next], toolMode: 'selected' });
  }
  function patchKnowledge(id: string, patch: Partial<ExpertKnowledgeDraft>) { patchAgent({ knowledge: customKnowledge.map((item) => item.id === id ? { ...item, ...patch } : item) }); }

  async function cloneBundle() {
    if (!bundle) return; setSaving(true);
    try {
      const created = await llmApi.projectAgent.capabilityBundles.create({ bundleId: bundle.bundleId, name: `${bundle.name} · 自定义`, description: bundle.description, agents: bundle.agents, context: bundle.context, budget: bundle.budget });
      message.success('已创建可编辑的专家注册草稿'); await loadBundles(created.id);
    } catch (error) { message.error(error instanceof Error ? error.message : String(error)); } finally { setSaving(false); }
  }

  async function saveRegistry() {
    if (!bundle || !editable) return; setSaving(true);
    try {
      await llmApi.projectAgent.capabilityBundles.update(bundle.id, { name: bundle.name, description: bundle.description, agents: draftAgents, context: bundle.context, budget: bundle.budget });
      await llmApi.projectAgent.capabilityBundles.validate(bundle.id); message.success('专家注册信息已保存并通过校验'); await loadBundles(bundle.id);
    } catch (error) { message.error(error instanceof Error ? error.message : String(error)); } finally { setSaving(false); }
  }

  async function publishRegistry() {
    if (!bundle || !editable || !await confirm({ title: '发布专家配置？', message: `发布“${bundle.name}”v${bundle.version}？`, detail: '发布后此版本只读，新任务可以选择使用；后续修改需要再创建草稿。', confirmLabel: '发布版本' })) return;
    setSaving(true); try { await saveRegistry(); await llmApi.projectAgent.capabilityBundles.publish(bundle.id); message.success('专家配置已发布'); await loadBundles(bundle.id); } catch (error) { message.error(error instanceof Error ? error.message : String(error)); } finally { setSaving(false); }
  }

  const overview = agent && registryExpert ? <div className="expert-detail-form">
    <label><span>专家名称</span><Input value={agent.name} disabled={!editable} onChange={(event) => patchAgent({ name: event.target.value })} /></label>
    <label><span>职责说明</span><Input.TextArea rows={4} value={agent.description} disabled={!editable} onChange={(event) => patchAgent({ description: event.target.value })} /></label>
    <div className="expert-fact-grid">
      <div><span>角色标识</span><strong>{agent.role}</strong></div><div><span>工具权限</span><strong>{agent.role === 'coordinator' ? '不直接调用工具' : `${activeTools.size} 项`}</strong></div><div><span>知识来源</span><strong>{systemKnowledge.length + customKnowledge.filter((item) => item.enabled).length} 项</strong></div>
    </div>
  </div> : null;

  const prompt = agent && registryExpert ? <div className="expert-detail-form">
    <div className="expert-inline-note"><DesignerIcon name="behavior" /><div><strong>运行时最终提示词模板</strong><span>{registryExpert.prompt.note}</span></div></div>
    <div className="expert-prompt-layers" aria-label="提示词组成层">{registryExpert.prompt.layers.map((layer, index) => <span key={layer.id}><b>{index + 1}</b>{layer.title}<Tag>{layer.source === 'system' ? '系统' : layer.source === 'runtime' ? '运行时' : '能力包'}</Tag></span>)}</div>
    <label><span>合成后的完整模板（只读）</span><Input.TextArea className="expert-prompt-editor" rows={18} value={registryExpert.prompt.preview} readOnly /></label>
    <label><span>能力包可编辑提示词</span><Input.TextArea className="expert-prompt-editor" rows={8} value={agent.instructions} disabled={!editable} onChange={(event) => patchAgent({ instructions: event.target.value })} /></label>
  </div> : null;

  const tools = agent && registryExpert ? <div className="expert-tools-panel">
    {agent.role === 'coordinator' ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="项目统筹只负责决策，不直接获得项目写工具" /> : <>
      <div className="expert-tools-toolbar"><Input.Search allowClear value={toolQuery} onChange={(event) => setToolQuery(event.target.value)} placeholder="搜索工具名称或用途" aria-label="搜索专家工具" /><span>{activeTools.size} / {registryExpert.availableTools.length} 项已允许</span>{editable && <div className="expert-tool-bulk"><Button size="small" onClick={() => patchAgent({ toolMode: 'all', tools: [] })}>允许全部</Button><Button size="small" onClick={() => patchAgent({ toolMode: 'selected', tools: [] })}>全部停用</Button></div>}</div>
      <div className="expert-tool-list" role="list" aria-label={`${agent.name}可用工具`}>
        {visibleTools.map((tool) => <label className="expert-tool-row" key={tool.name}>
          <Checkbox disabled={!editable} checked={activeTools.has(tool.name)} onChange={(event) => toggleTool(tool.name, event.target.checked)} />
          <span className="expert-tool-copy"><strong>{tool.title}</strong><code>{tool.name}</code><small>{tool.description}</small></span>
          <Tag color={tool.risk === 'destructive' ? 'red' : tool.risk === 'write' ? 'gold' : 'blue'}>{riskLabels[tool.risk]}</Tag>
        </label>)}
      </div>
    </>}
  </div> : null;

  const knowledge = agent ? <div className="expert-knowledge-panel">
    <section><div className="expert-section-heading"><div><h4>系统与运行时知识</h4><p>这些内容由运行时自动提供，只读且不会随能力包遗漏。</p></div></div>
      <div className="expert-knowledge-list">{systemKnowledge.map((item) => <article key={item.id} className="expert-knowledge-card is-system"><div><strong>{item.title}</strong><Tag>{item.source === 'runtime' ? '运行时' : '系统'}</Tag></div><p>{item.content}</p></article>)}</div>
    </section>
    <section><div className="expert-section-heading"><div><h4>能力包知识</h4><p>启用的条目会随专家提示词一起进入模型上下文。</p></div>{editable && <Button size="small" onClick={() => patchAgent({ knowledge: [...customKnowledge, { id: `knowledge_${Date.now().toString(36)}`, title: '新知识', content: '', enabled: true }] })}>添加知识</Button>}</div>
      <div className="expert-knowledge-list">{customKnowledge.length ? customKnowledge.map((item) => <article key={item.id} className="expert-knowledge-card">
        <div className="expert-knowledge-editor-head"><Input value={item.title} disabled={!editable} aria-label="知识标题" onChange={(event) => patchKnowledge(item.id, { title: event.target.value })} /><Switch size="small" checked={item.enabled} disabled={!editable} checkedChildren="启用" unCheckedChildren="停用" onChange={(enabled) => patchKnowledge(item.id, { enabled })} />{editable && <Button type="text" danger size="small" onClick={() => patchAgent({ knowledge: customKnowledge.filter((entry) => entry.id !== item.id) })}>移除</Button>}</div>
        <Input.TextArea rows={5} value={item.content} disabled={!editable} aria-label={`${item.title}内容`} placeholder="写明专家需要长期掌握的规则、术语或业务约束" onChange={(event) => patchKnowledge(item.id, { content: event.target.value })} />
      </article>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未注册能力包知识" />}</div>
    </section>
  </div> : null;

  if (loading && !registry) return <div className="settings-card expert-registry-loading"><Spin /><span>正在读取专家注册信息…</span></div>;
  return <div className="settings-card-stack expert-registry">
    <section className="settings-card expert-registry-toolbar">
      <div className="settings-card-header"><div className="settings-card-title"><h3>专家注册中心</h3><p>这里展示模型实际获得的角色提示词、工具权限和知识来源。发布版本保持只读，避免运行中配置漂移。</p></div><Button loading={loading} onClick={() => void loadBundles(bundleId)}>刷新</Button></div>
      <div className="expert-bundle-bar"><label><span>能力包版本</span><Select value={bundleId || undefined} onChange={setBundleId} options={bundles.map((item) => ({ value: item.id, label: `${item.name} v${item.version} · ${item.status === 'published' ? '已发布' : '草稿'}` }))} /></label><div className="expert-bundle-actions">{editable ? <><Button loading={saving} onClick={() => void saveRegistry()}>保存草稿</Button><Button type="primary" loading={saving} onClick={() => void publishRegistry()}>发布版本</Button></> : <Button type="primary" loading={saving} onClick={() => void cloneBundle()}>创建可编辑副本</Button>}</div></div>
    </section>
    <section className="settings-card expert-registry-workbench">
      <aside className="expert-list" aria-label="已注册专家"><div className="expert-list-header"><span>已注册专家</span><small>{registry?.experts.length || 0}</small></div>{registry?.experts.map((item) => <button type="button" key={item.role} className={`expert-list-item ${selectedRole === item.role ? 'active' : ''}`} aria-current={selectedRole === item.role ? 'true' : undefined} onClick={() => { setSelectedRole(item.role); setToolQuery(''); }}><DesignerIcon name={roleIcons[item.role]} /><span><strong>{item.name}</strong><small>{item.description}</small></span><Tag>{item.role === 'coordinator' ? '统筹' : `${item.tools.length} 工具`}</Tag></button>)}</aside>
      <main className="expert-detail">{agent && <header className="expert-detail-header"><div><span className="expert-role-label">{agent.role}</span><h3>{agent.name}</h3><p>{agent.description}</p></div><span className={`expert-version-status ${editable ? 'is-draft' : 'is-published'}`}>{editable ? '草稿可编辑' : '已发布只读'}</span></header>}<Tabs defaultActiveKey="overview" items={[{ key: 'overview', label: '概览', children: overview }, { key: 'prompt', label: '提示词', children: prompt }, { key: 'tools', label: `工具 ${activeTools.size}`, children: tools }, { key: 'knowledge', label: `知识 ${systemKnowledge.length + customKnowledge.length}`, children: knowledge }]} /></main>
    </section>
  </div>;
}
