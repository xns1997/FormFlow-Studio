import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Empty, Input, Select, Spin, Switch, Tabs, Tag, message } from 'antd';
import { DesignerIcon } from '../../designer/icons';
import { llmApi } from '../../services/io/api';
import { useAppInteraction } from '../../components/AppInteractionProvider';
import type { ProjectAgentBundle, ProjectAgentScopeConfig } from '../../components/projectAgentUiModel';

const scopeRoles = ['project', 'data', 'form', 'workflow', 'behavior', 'quality', 'delivery'] as const;
export type ScopeRole = typeof scopeRoles[number];
const roleIcons: Record<ScopeRole, string> = { project: 'settings', data: 'data', form: 'design', workflow: 'workflow', behavior: 'behavior', quality: 'test', delivery: 'upload' };
const roleTitles: Record<ScopeRole, string> = { project: '项目', data: '数据', form: '表单', workflow: '流程', behavior: '行为', quality: '质量', delivery: '交付' };
const riskLabels = { read: '只读', write: '写入', destructive: '高风险' } as const;

export function scopeSelectedToolNames(scope: ProjectAgentScopeConfig, availableTools: Array<{ name: string }>) {
  return scope.toolMode === 'all' ? availableTools.map((tool) => tool.name) : scope.tools;
}

type ScopeRegistryView = {
  bundle: { id: string; name: string; version: number; status: 'draft' | 'published'; ownerId: string; editable: boolean };
  scopes: Array<ProjectAgentScopeConfig & { effectiveTools: Array<{ name: string; title: string; risk: string }>; availableTools: Array<{ name: string; title: string; risk: string }>; toolDocs: ToolDoc[]; skillPreview: string }>;
};

type ToolDocParam = { name: string; required: boolean; type: string; description: string };
type ToolDocCall = { summary: string; arguments: Record<string, any>; expectedError?: string };
type ToolDoc = { name: string; title: string; risk: string; description: string; params: ToolDocParam[]; correct: ToolDocCall[]; wrong: ToolDocCall[] };

export default function ExpertManagementSection() {
  const { confirm } = useAppInteraction();
  const [bundles, setBundles] = useState<ProjectAgentBundle[]>([]);
  const [bundleId, setBundleId] = useState('');
  const [registry, setRegistry] = useState<ScopeRegistryView>();
  const [draftScopes, setDraftScopes] = useState<ProjectAgentScopeConfig[]>([]);
  const [selectedRole, setSelectedRole] = useState<ScopeRole>('project');
  const [toolQuery, setToolQuery] = useState('');
  const [manualQuery, setManualQuery] = useState('');
  const [openManualTools, setOpenManualTools] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadBundles = useCallback(async (preferredId?: string) => {
    const next = await llmApi.projectAgent.capabilityBundles.list() as ProjectAgentBundle[];
    setBundles(next);
    setBundleId((current) => preferredId || (next.some((item) => item.id === current) ? current : next.find((item) => item.status === 'draft')?.id || next.find((item) => item.status === 'published')?.id || ''));
  }, []);

  useEffect(() => { void loadBundles().catch((error) => message.error(error instanceof Error ? error.message : String(error))).finally(() => setLoading(false)); }, [loadBundles]);
  useEffect(() => {
    if (!bundleId) return;
    setLoading(true);
    void llmApi.projectAgent.capabilityBundles.scopes(bundleId).then((value: ScopeRegistryView) => {
      setRegistry(value);
      const bundle = bundles.find((item) => item.id === bundleId);
      setDraftScopes(structuredClone(bundle?.scopes || []));
      if (!value.scopes.some((item) => item.role === selectedRole)) setSelectedRole(value.scopes[0]?.role || 'project');
    }).catch((error) => message.error(error instanceof Error ? error.message : String(error))).finally(() => setLoading(false));
  }, [bundleId, bundles]);

  const editable = Boolean(registry?.bundle.editable);
  const registryScope = registry?.scopes.find((item) => item.role === selectedRole);
  const scope = draftScopes.find((item) => item.role === selectedRole);
  const activeTools = useMemo(() => scope && registryScope ? new Set(scope.toolMode === 'all' ? registryScope.availableTools.map((tool) => tool.name) : scope.tools) : new Set<string>(), [scope, registryScope]);
  const visibleTools = useMemo(() => (registryScope?.availableTools || []).filter((tool) => `${tool.title} ${tool.name}`.toLowerCase().includes(toolQuery.trim().toLowerCase())), [registryScope, toolQuery]);
  const visibleManualTools = useMemo(() => (registryScope?.toolDocs || []).filter((doc) => `${doc.title} ${doc.name} ${doc.description} ${doc.params.map((param) => param.name).join(' ')}`.toLowerCase().includes(manualQuery.trim().toLowerCase())), [registryScope, manualQuery]);

  function patchScope(patch: Partial<ProjectAgentScopeConfig>) {
    setDraftScopes((current) => current.map((item) => item.role === selectedRole ? { ...item, ...patch } : item));
  }
  function toggleTool(name: string, checked: boolean) {
    if (!scope) return;
    const next = new Set(activeTools);
    if (checked) next.add(name); else next.delete(name);
    patchScope({ tools: [...next], toolMode: 'selected' });
  }
  function patchKnowledge(id: string, patch: Partial<ProjectAgentScopeConfig['knowledge'][number]>) {
    patchScope({ knowledge: (scope?.knowledge || []).map((item) => item.id === id ? { ...item, ...patch } : item) });
  }

  async function cloneBundle() {
    const bundle = bundles.find((item) => item.id === bundleId);
    if (!bundle) return;
    setSaving(true);
    try {
      const created = await llmApi.projectAgent.capabilityBundles.create({ bundleId: bundle.bundleId, name: `${bundle.name} · 自定义`, description: bundle.description, scopes: bundle.scopes, context: bundle.context, budget: bundle.budget });
      message.success('已创建可编辑的作用域配置草稿');
      await loadBundles(created.id);
    } catch (error) { message.error(error instanceof Error ? error.message : String(error)); } finally { setSaving(false); }
  }

  async function saveRegistry() {
    const bundle = bundles.find((item) => item.id === bundleId);
    if (!bundle || !editable) return;
    setSaving(true);
    try {
      await llmApi.projectAgent.capabilityBundles.update(bundle.id, { name: bundle.name, description: bundle.description, scopes: draftScopes, context: bundle.context, budget: bundle.budget });
      await llmApi.projectAgent.capabilityBundles.validate(bundle.id);
      message.success('作用域配置已保存并通过校验');
      await loadBundles(bundle.id);
    } catch (error) { message.error(error instanceof Error ? error.message : String(error)); } finally { setSaving(false); }
  }

  async function publishRegistry() {
    const bundle = bundles.find((item) => item.id === bundleId);
    if (!bundle || !editable || !await confirm({ title: '发布作用域配置？', message: `发布“${bundle.name}”v${bundle.version}？`, detail: '发布后此版本只读，新任务可以选择使用；后续修改需要再创建草稿。', confirmLabel: '发布版本' })) return;
    setSaving(true);
    try {
      await saveRegistry();
      await llmApi.projectAgent.capabilityBundles.publish(bundle.id);
      message.success('作用域配置已发布');
      await loadBundles(bundle.id);
    } catch (error) { message.error(error instanceof Error ? error.message : String(error)); } finally { setSaving(false); }
  }

  const overview = scope ? <div className="expert-detail-form">
    <label><span>作用域名称</span><Input value={scope.name} disabled={!editable} onChange={(event) => patchScope({ name: event.target.value })} /></label>
    <label><span>职责说明</span><Input.TextArea rows={4} value={scope.description} disabled={!editable} onChange={(event) => patchScope({ description: event.target.value })} /></label>
    <label><span>能力包指令（追加到系统 skill）</span><Input.TextArea rows={6} value={scope.instructions} disabled={!editable} onChange={(event) => patchScope({ instructions: event.target.value })} /></label>
    {registryScope?.skillPreview ? <div className="expert-inline-note"><div><strong>内置 skill 预览（只读）</strong><span>{registryScope.skillPreview}</span></div></div> : null}
  </div> : null;

  const tools = scope && registryScope ? <div className="expert-tools-panel">
    <div className="expert-tools-toolbar">
      <Input.Search allowClear value={toolQuery} onChange={(event) => setToolQuery(event.target.value)} placeholder="搜索工具名称或用途" aria-label="搜索作用域工具" />
      <span>{activeTools.size} / {registryScope.availableTools.length} 项已允许</span>
      {editable && <div className="expert-tool-bulk"><Button size="small" onClick={() => patchScope({ toolMode: 'all', tools: [] })}>允许全部</Button><Button size="small" onClick={() => patchScope({ toolMode: 'selected', tools: [] })}>全部停用</Button></div>}
    </div>
    <div className="expert-tool-list" role="list" aria-label={`${scope.name}可用工具`}>
      {visibleTools.map((tool) => (
        <label className="expert-tool-row" key={tool.name}>
          <Checkbox disabled={!editable} checked={activeTools.has(tool.name)} onChange={(event) => toggleTool(tool.name, event.target.checked)} />
          <span className="expert-tool-copy"><strong>{tool.title}</strong><code>{tool.name}</code></span>
          <Tag color={tool.risk === 'destructive' ? 'red' : tool.risk === 'write' ? 'gold' : 'blue'}>{riskLabels[tool.risk as keyof typeof riskLabels]}</Tag>
        </label>
      ))}
    </div>
  </div> : null;

  const knowledge = scope ? <div className="expert-knowledge-panel">
    <section>
      <div className="expert-section-heading"><div><h4>能力包知识</h4><p>启用的条目会随对应领域的 skill 一起进入模型上下文。</p></div>{editable && <Button size="small" onClick={() => patchScope({ knowledge: [...(scope.knowledge || []), { id: `knowledge_${Date.now().toString(36)}`, title: '新知识', content: '', enabled: true }] })}>添加知识</Button>}</div>
      <div className="expert-knowledge-list">
        {(scope.knowledge || []).length ? scope.knowledge!.map((item) => (
          <article key={item.id} className="expert-knowledge-card">
            <div className="expert-knowledge-editor-head">
              <Input value={item.title} disabled={!editable} aria-label="知识标题" onChange={(event) => patchKnowledge(item.id, { title: event.target.value })} />
              <Switch size="small" checked={item.enabled} disabled={!editable} checkedChildren="启用" unCheckedChildren="停用" onChange={(enabled) => patchKnowledge(item.id, { enabled })} />
              {editable && <Button type="text" danger size="small" onClick={() => patchScope({ knowledge: scope.knowledge!.filter((entry) => entry.id !== item.id) })}>移除</Button>}
            </div>
            <Input.TextArea rows={5} value={item.content} disabled={!editable} aria-label={`${item.title}内容`} placeholder="写明该领域需要长期掌握的规则、术语或业务约束" onChange={(event) => patchKnowledge(item.id, { content: event.target.value })} />
          </article>
        )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未注册能力包知识" />}
      </div>
    </section>
  </div> : null;

  const manual = registryScope ? <div className="expert-manual-panel">
    <div className="expert-tools-toolbar">
      <Input.Search allowClear value={manualQuery} onChange={(event) => setManualQuery(event.target.value)} placeholder="搜索工具手册（名称/用途/参数）" aria-label="搜索工具手册" />
      <span>{registryScope.toolDocs.length} 个工具 · 传參/正确调用/错误调用</span>
    </div>
    <div className="expert-manual-list" role="list" aria-label={`${scope?.name || ''}工具手册`}>
      {visibleManualTools.map((doc) => {
        const open = openManualTools.has(doc.name);
        return (
          <article key={doc.name} className={`expert-manual-card ${open ? 'is-open' : ''}`}>
            <button type="button" className="expert-manual-card-head" aria-expanded={open} onClick={() => setOpenManualTools((current) => { const next = new Set(current); if (next.has(doc.name)) next.delete(doc.name); else next.add(doc.name); return next; })}>
              <span className="expert-manual-copy"><strong>{doc.title}</strong><code>{doc.name}</code><small>{doc.description}</small></span>
              <Tag color={doc.risk === 'destructive' ? 'red' : doc.risk === 'write' ? 'gold' : 'blue'}>{riskLabels[doc.risk as keyof typeof riskLabels]}</Tag>
            </button>
            {open && <div className="expert-manual-card-body">
              <section>
                <h5>传參</h5>
                {doc.params.length ? <ul className="expert-manual-params">{doc.params.map((param) => (
                  <li key={param.name}><code>{param.name}</code><Tag color={param.required ? 'red' : 'default'}>{param.required ? '必填' : '可选'}</Tag><span>{param.type}</span><p>{param.description}</p></li>
                ))}</ul> : <p className="expert-manual-empty">无参数</p>}
              </section>
              <section>
                <h5>正确调用（照抄结构，替换为真实 id/名称）</h5>
                {doc.correct.length ? doc.correct.map((call, index) => (
                  <div key={`${doc.name}-ok-${index}`} className="expert-manual-call"><p>{call.summary}</p><pre>{JSON.stringify(call.arguments, null, 2)}</pre></div>
                )) : <p className="expert-manual-empty">暂无示例，以实时 Schema 为准</p>}
              </section>
              <section>
                <h5>错误调用（禁止照抄，用于识别失败原因）</h5>
                {doc.wrong.length ? doc.wrong.map((call, index) => (
                  <div key={`${doc.name}-wrong-${index}`} className="expert-manual-call is-wrong">
                    <p>{call.summary}{call.expectedError ? <Tag color="red">{call.expectedError}</Tag> : null}</p>
                    <pre>{JSON.stringify(call.arguments, null, 2)}</pre>
                  </div>
                )) : <p className="expert-manual-empty">暂无错误示例</p>}
              </section>
            </div>}
          </article>
        );
      })}
      {!visibleManualTools.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的工具手册" />}
    </div>
  </div> : null;

  if (loading && !registry) return <div className="settings-card expert-registry-loading"><Spin /><span>正在读取作用域配置…</span></div>;
  return <div className="settings-card-stack expert-registry">
    <section className="settings-card expert-registry-toolbar">
      <div className="settings-card-header"><div className="settings-card-title"><h3>领域 skill 注册中心</h3><p>七个领域 skill 由系统提供（只读），这里管理每个作用域的名称、指令、工具白名单与附加知识，并在「工具手册」中查看每个工具的传參、正确调用与错误调用。发布版本保持只读，避免运行中配置漂移。</p></div><Button loading={loading} onClick={() => void loadBundles(bundleId)}>刷新</Button></div>
      <div className="expert-bundle-bar">
        <label><span>能力包版本</span><Select value={bundleId || undefined} onChange={setBundleId} options={bundles.map((item) => ({ value: item.id, label: `${item.name} v${item.version} · ${item.status === 'published' ? '已发布' : '草稿'}` }))} /></label>
        <div className="expert-bundle-actions">{editable ? <><Button loading={saving} onClick={() => void saveRegistry()}>保存草稿</Button><Button type="primary" loading={saving} onClick={() => void publishRegistry()}>发布版本</Button></> : <Button type="primary" loading={saving} onClick={() => void cloneBundle()}>创建可编辑副本</Button>}</div>
      </div>
    </section>
    <section className="settings-card expert-registry-workbench">
      <aside className="expert-list" aria-label="领域作用域">
        <div className="expert-list-header"><span>领域作用域</span><small>{registry?.scopes.length || 0}</small></div>
        {registry?.scopes.map((item) => (
          <button type="button" key={item.role} className={`expert-list-item ${selectedRole === item.role ? 'active' : ''}`} aria-current={selectedRole === item.role ? 'true' : undefined} onClick={() => { setSelectedRole(item.role as ScopeRole); setToolQuery(''); setManualQuery(''); setOpenManualTools(new Set()); }}>
            <DesignerIcon name={roleIcons[item.role as ScopeRole]} />
            <span><strong>{item.name}</strong><small>{item.description}</small></span>
            <Tag>{item.effectiveTools.length} 工具</Tag>
          </button>
        ))}
      </aside>
      <main className="expert-detail">
        {scope && <header className="expert-detail-header"><div><span className="expert-role-label">{roleTitles[scope.role as ScopeRole]}</span><h3>{scope.name}</h3><p>{scope.description}</p></div><span className={`expert-version-status ${editable ? 'is-draft' : 'is-published'}`}>{editable ? '草稿可编辑' : '已发布只读'}</span></header>}
        <Tabs defaultActiveKey="overview" items={[
          { key: 'overview', label: '概览', children: overview },
          { key: 'manual', label: `工具手册 ${registryScope?.toolDocs?.length || 0}`, children: manual },
          { key: 'tools', label: `工具 ${activeTools.size}`, children: tools },
          { key: 'knowledge', label: `知识 ${(scope?.knowledge || []).length}`, children: knowledge },
        ]} />
      </main>
    </section>
  </div>;
}
