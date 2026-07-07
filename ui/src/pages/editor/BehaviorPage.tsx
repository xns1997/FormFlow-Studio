import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import CodeEditor from '../../components/CodeEditor';
import {
  createEventContextExtraLib,
  createEventContextSuggestions,
  type EventFieldDescriptor,
} from '../../components/codeEditorSuggestions';
import { useProjectStore } from '../../project/store';
import type { BehaviorFile } from '../../project/types';
import { getTemplatesByCategory, type BehaviorTemplate } from '../../services/config/behaviorTemplates';
import Modal, { ModalHeader } from '../../components/Modal';
import BehaviorTestPanel from '../../components/BehaviorTestPanel';
import RuleBuilder from '../../components/RuleBuilder';
import { downloadBehaviors, importBehaviors, readFileAsText } from '../../services/io/behaviorIO';
import {
  getBehaviorDocsByScope,
  getBehaviorEventDoc,
  getControlApis,
  getScriptApis,
  getSharedContextFields,
} from '../../services/io/behaviorDocs';
import { getControlSnippetExamples } from '../../services/display/controlSnippets';
import { buildDocsPath } from '../../services/io/routes';

export default function BehaviorPage() {
  const { id: projectId = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const project = useProjectStore((s) => s.project);
  const addBehavior = useProjectStore((s) => s.addBehavior);
  const updateBehavior = useProjectStore((s) => s.updateBehavior);
  const removeBehavior = useProjectStore((s) => s.removeBehavior);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newScriptName, setNewScriptName] = useState('');
  const [newScriptEvent, setNewScriptEvent] = useState('onFieldChange');
  const [showTemplates, setShowTemplates] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'api' | 'test'>('api');
  const [editorMode, setEditorMode] = useState<'code' | 'visual'>('code');
  const importRef = useRef<HTMLInputElement>(null);

  const scripts = project?.behaviors || [];
  const workflows = project?.workflows || [];
  const scriptDocs = useMemo(() => getBehaviorDocsByScope('script'), []);
  const topicQuery = useMemo(() => {
    return {
      fromProject: projectId,
      fromPage: 'workspace' as const,
      fromTab: 'behavior',
    };
  }, [projectId]);
  const fieldDescriptors = useMemo<EventFieldDescriptor[]>(() => {
    if (!project) return [];
    const fromTables = project.srcTable.flatMap((table) => table.sheets.flatMap((sheet) => sheet.columns.map((column) => ({
      name: column.name,
      type: column.dataType,
    }))));
    const fromComponents = (project.designs || []).flatMap((design) => (design.components || []).map((component) => {
      const name = String(component.fieldBinding || component.props.name || '').trim();
      if (!name) return null;
      if (component.type === 'number' || component.type === 'rating') return { name, type: 'number' };
      if (component.type === 'switch') return { name, type: 'boolean' };
      if (component.type === 'checkbox') return { name, type: 'array' };
      if (component.type === 'json' || component.type === 'object') return { name, type: 'object' };
      return { name, type: 'string' };
    }).filter(Boolean) as EventFieldDescriptor[]);
    return [...new Map([...fromTables, ...fromComponents].map((field) => [field.name, field])).values()];
  }, [project]);
  const designComponents = useMemo(() => (project?.designs || []).flatMap((design) => design.components || []) || [], [project]);

  const events = [
    // 基础事件
    'onFormLoad', 'onRowLoad', 'onFieldChange', 'onFieldBlur', 'onFieldFocus',
    'onButtonClick', 'onValidate', 'onSubmit', 'onSubmitSuccess', 'onSubmitError',
    // 扩展事件
    'onFormReady', 'onFormReset', 'onBeforeSubmit',
    'onFieldKeyDown', 'onFieldPaste', 'onFieldClear',
    'onRowAdd', 'onRowDelete', 'onRowSelect',
    'onDataImport', 'onDataExport', 'onValueChange',
  ];

  const addScript = useCallback(() => {
    if (!newScriptName) return;
    const now = new Date().toISOString();
    addBehavior({
      id: `bh_${Date.now()}`,
      name: newScriptName,
      event: newScriptEvent,
      code: `// ${newScriptName}\n`,
      priority: 10,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    setNewScriptName('');
  }, [newScriptName, newScriptEvent, addBehavior]);

  const addFromTemplate = useCallback((tpl: BehaviorTemplate) => {
    const now = new Date().toISOString();
    const id = `bh_${Date.now()}`;
    addBehavior({
      id,
      name: tpl.name,
      event: tpl.event,
      code: tpl.code,
      priority: 10,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    setEditingId(id);
    setShowTemplates(false);
  }, [addBehavior]);

  const handleExport = useCallback(() => {
    if (scripts.length === 0) return;
    downloadBehaviors(scripts);
  }, [scripts]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const { behaviors, errors } = importBehaviors(text);
      if (errors.length > 0) {
        alert(`导入警告:\n${errors.join('\n')}`);
      }
      const now = new Date().toISOString();
      for (const bh of behaviors) {
        // 重命名冲突 ID
        const existingIds = new Set(scripts.map((s) => s.id));
        const id = existingIds.has(bh.id) ? `${bh.id}_${Date.now()}` : bh.id;
        addBehavior({ ...bh, id, createdAt: now, updatedAt: now });
      }
    } catch (err) {
      alert(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (importRef.current) importRef.current.value = '';
  }, [scripts, addBehavior]);

  const deleteScript = useCallback((id: string) => {
    removeBehavior(id);
    if (editingId === id) setEditingId(null);
  }, [editingId, removeBehavior]);

  const updateCode = useCallback((id: string, code: string) => {
    updateBehavior(id, { code });
  }, [updateBehavior]);

  const updateEvent = useCallback((id: string, event: string) => {
    updateBehavior(id, { event });
  }, [updateBehavior]);

  const toggleEnabled = useCallback((id: string, enabled: boolean) => {
    updateBehavior(id, { enabled });
  }, [updateBehavior]);

  const grouped = useMemo(() => {
    const g: Record<string, BehaviorFile[]> = {};
    for (const s of scripts) { (g[s.event] = g[s.event] || []).push(s); }
    return g;
  }, [scripts]);

  const editingScript = scripts.find((s) => s.id === editingId);
  const editingDoc = getBehaviorEventDoc(editingScript?.event, 'script');

  useEffect(() => {
    const scriptId = searchParams.get('script');
    if (!scriptId) return;
    const target = scripts.find((item) => item.id === scriptId);
    if (target) setEditingId(target.id);
  }, [searchParams, scripts]);

  const renderReferencePanel = () => {
    if (!editingScript) {
      return (
        <div className="behavior-doc-panel">
          <div className="behavior-doc-section">
            <div className="behavior-doc-section-header">
              <strong>文档入口</strong>
            </div>
            <div className="behavior-doc-link-group">
              <Link to={buildDocsPath(undefined, topicQuery)} className="behavior-doc-link">打开文档首页</Link>
              <Link to={buildDocsPath('context-reference', topicQuery)} className="behavior-doc-link">查看上下文总览</Link>
              <Link to={buildDocsPath('control-handles-reference', topicQuery)} className="behavior-doc-link">查看控件句柄 reference</Link>
              <Link to={buildDocsPath('flow-parameter-reference', topicQuery)} className="behavior-doc-link">查看流程参数 reference</Link>
            </div>
          </div>

          <div className="behavior-doc-section">
            <div className="behavior-doc-section-header">
              <strong>脚本事件索引</strong>
            </div>
            <div className="behavior-doc-index">
              {scriptDocs.map((doc) => (
                <Link key={doc.id} to={buildDocsPath(doc.slug, topicQuery)} className="behavior-doc-index-item">
                  <span>{doc.title}</span>
                  <small>{doc.eventName}</small>
                </Link>
              ))}
            </div>
          </div>
        </div>
      );
    }

    const controlSnippets = getControlSnippetExamples({
      components: designComponents,
      currentField: fieldDescriptors[0]?.name,
      eventName: editingScript.event,
    });

    return (
      <div className="behavior-doc-panel">
        <div className="behavior-doc-hero">
          <div>
            <strong>{editingDoc?.title || editingScript.event}</strong>
            <p>{editingDoc?.summary || '当前事件暂未配置独立说明，仍可进入完整文档首页继续查阅。'}</p>
          </div>
          <div className="behavior-doc-link-group">
            <Link
              to={buildDocsPath(editingDoc?.slug, topicQuery)}
              className="behavior-doc-link"
            >
              查看完整文档
            </Link>
            <Link to={buildDocsPath('context-reference', topicQuery)} className="behavior-doc-link">上下文总览</Link>
            <Link to={buildDocsPath('control-handles-reference', topicQuery)} className="behavior-doc-link">控件句柄 reference</Link>
            <Link to={buildDocsPath('flow-parameter-reference', topicQuery)} className="behavior-doc-link">流程参数 reference</Link>
          </div>
        </div>

        <div className="behavior-doc-section">
          <div className="behavior-doc-section-header">
            <strong>触发时机</strong>
          </div>
          <p className="behavior-doc-lead">{editingDoc?.triggerWhen || '当前脚本事件暂无独立触发说明。'}</p>
        </div>

        <div className="behavior-doc-section">
          <div className="behavior-doc-section-header">
            <strong>通用上下文</strong>
          </div>
          <div className="behavior-doc-list">
            {[...getSharedContextFields(), ...getScriptApis().slice(0, 2).map((api) => ({
              name: api.signature,
              type: 'API',
              description: api.description,
            }))].map((field) => (
              <div key={field.name} className="behavior-doc-list-item">
                <code>{field.name}</code>
                <span>{field.description}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="behavior-doc-section">
          <div className="behavior-doc-section-header">
            <strong>可用 API</strong>
          </div>
          <div className="behavior-doc-list">
            {getScriptApis().map((api) => (
              <div key={api.name} className="behavior-doc-list-item">
                <code>{api.signature}</code>
                <span>{api.description}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="behavior-doc-section">
          <div className="behavior-doc-section-header">
            <strong>Suggestion</strong>
          </div>
          <div className="behavior-doc-tag-list">
            {(editingDoc?.suggestions || ['优先把当前事件当成单一职责入口，避免一个脚本同时承担初始化、联动和提交逻辑。']).map((item) => (
              <span key={item} className="behavior-doc-tag">{item}</span>
            ))}
          </div>
        </div>

        <div className="behavior-doc-section">
          <div className="behavior-doc-section-header">
            <strong>相关控件能力</strong>
          </div>
          <div className="behavior-doc-list">
            {getControlApis().slice(0, 4).map((api) => (
              <div key={api.name} className="behavior-doc-list-item">
                <code>{api.signature}</code>
                <span>{api.description}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="behavior-doc-section">
          <div className="behavior-doc-section-header">
            <strong>ctx.controls 快速示例</strong>
          </div>
          <div className="behavior-doc-list">
            {controlSnippets.map((snippet) => (
              <div key={snippet.id} className="behavior-doc-list-item">
                <strong>{snippet.title}</strong>
                <span>{snippet.summary}</span>
                <code>{snippet.code}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="page-layout">
      {/* 左侧：脚本列表 */}
      <div className="page-sidebar">
        <div className="page-section-header">
          <span>脚本 ({scripts.length})</span>
          <div className="behavior-toolbar-actions">
            <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
            <button onClick={() => importRef.current?.click()} className="behavior-toolbar-btn" title="导入">↑</button>
            <button onClick={handleExport} disabled={scripts.length === 0} className="behavior-toolbar-btn" style={{ opacity: scripts.length === 0 ? 0.5 : 1 }} title="导出">↓</button>
            <button onClick={() => setShowTemplates(true)} className="behavior-toolbar-btn primary">模板</button>
            <button onClick={addScript} className="behavior-toolbar-btn primary">+ 新建</button>
          </div>
        </div>
        <div className="page-section-body">
          {scripts.length === 0 ? (
            <div className="behavior-empty-state">
              <p>暂无脚本</p>
            </div>
          ) : Object.entries(grouped).map(([event, items]) => (
            <div key={event}>
              <div className="behavior-event-group">{event}</div>
              {items.map((s) => (
                <div key={s.id} className={`sidebar-item ${editingId === s.id ? 'active' : ''}`} onClick={() => setEditingId(s.id)}>
                  <span className={`behavior-status-dot ${s.enabled ? 'enabled' : 'disabled'}`}>{s.enabled ? '●' : '○'}</span>
                  <div className="sidebar-item-info">
                    <span className="sidebar-item-name">{s.name}</span>
                    <span className="sidebar-item-meta">{(s.code || '').length} 字符</span>
                  </div>
                  <button className="sidebar-item-delete" onClick={(e) => { e.stopPropagation(); deleteScript(s.id); }}>×</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 中间：代码/可视化编辑器 */}
      <div className="page-main">
        <div className="page-section-header">
          <span>{editingScript ? editingScript.name : '行为定义'}</span>
          {editingScript && (
            <div className="behavior-editor-toolbar">
              {/* 模式切换 */}
              <div className="behavior-mode-toggle">
                <button
                  onClick={() => setEditorMode('visual')}
                  className={`behavior-mode-btn ${editorMode === 'visual' ? 'active' : ''}`}
                >
                  可视化
                </button>
                <button
                  onClick={() => setEditorMode('code')}
                  className={`behavior-mode-btn ${editorMode === 'code' ? 'active' : ''}`}
                >
                  代码
                </button>
              </div>
              <select value={editingScript.event} onChange={(e) => updateEvent(editingScript.id, e.target.value)} style={{ padding: '3px 6px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
                {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <input type="checkbox" checked={editingScript.enabled} onChange={(e) => toggleEnabled(editingScript.id, e.target.checked)} />
                <span>启用</span>
              </label>
            </div>
          )}
        </div>
        <div className="page-section-body" style={{ padding: 0, position: 'relative' }}>
          {editingScript ? (
            editorMode === 'visual' ? (
              <div style={{ overflow: 'auto', height: '100%' }}>
                <RuleBuilder
                  code={editingScript.code}
                  eventName={editingScript.event}
                  fields={fieldDescriptors}
                  onChange={(code) => updateCode(editingScript.id, code)}
                />
              </div>
            ) : (
              <CodeEditor
                value={editingScript.code}
                onChange={(code) => updateCode(editingScript.id, code)}
                language="javascript"
                path={`inmemory://model/behavior-${editingScript.id}.js`}
                title={`${editingScript.name} · ${editingScript.event}`}
                theme="light"
                extraLibs={[
                  createEventContextExtraLib({
                    filePath: `inmemory://model/behavior-${editingScript.id}.d.ts`,
                    fields: fieldDescriptors,
                    eventName: editingScript.event,
                  }),
                ]}
                suggestions={createEventContextSuggestions({
                  fields: fieldDescriptors,
                  workflows,
                  eventName: editingScript.event,
                })}
                autoSuggestPolicy="explicit"
                suggestionTriggerCharacters={['.', "'", '"', '(', '$']}
                lineNumbers
                options={{ minimap: { enabled: true }, folding: true, fontSize: 13, lineHeight: 21 }}
                fullscreen
              />
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 13 }}>
              <p>选择左侧脚本进行编辑</p>
              <p style={{ fontSize: 11, marginTop: 4 }}>或点击「+ 新建」创建新脚本</p>
            </div>
          )}
        </div>
      </div>

      {/* 右侧：API 参考 / 测试 */}
      <div className="page-inspector">
        <div className="page-section-header" style={{ display: 'flex', gap: 0, padding: 0 }}>
          <button
            onClick={() => setRightPanelTab('api')}
            className={`behavior-tab-btn ${rightPanelTab === 'api' ? 'active' : ''}`}
          >
            API 参考
          </button>
          <button
            onClick={() => setRightPanelTab('test')}
            className={`behavior-tab-btn ${rightPanelTab === 'test' ? 'active' : ''}`}
          >
            测试
          </button>
        </div>
        <div className="page-section-body" style={{ padding: 0 }}>
          {rightPanelTab === 'api' ? (
            renderReferencePanel()
          ) : editingScript ? (
            <BehaviorTestPanel
              code={editingScript.code}
              eventName={editingScript.event}
              fields={fieldDescriptors}
            />
          ) : (
            <div className="behavior-empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              选择脚本后可测试
            </div>
          )}
        </div>
      </div>

      {/* 模板选择弹窗 */}
      <Modal open={showTemplates} onClose={() => setShowTemplates(false)} width="640px" maxWidth="90vw" maxHeight="80vh">
        <ModalHeader title="行为模板库" onClose={() => setShowTemplates(false)} />
        <div className="template-modal-body">
          {Object.entries(getTemplatesByCategory()).map(([category, templates]) => (
            <div key={category} className="template-category">
              <div className="template-category-header">{category}</div>
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => addFromTemplate(tpl)}
                  className="template-item"
                >
                  <div className="template-item-header">
                    <span className="template-item-name">{tpl.name}</span>
                    <span className="template-item-event">{tpl.event}</span>
                  </div>
                  <span className="template-item-desc">{tpl.description}</span>
                  {tpl.fields && tpl.fields.length > 0 && (
                    <div className="template-item-fields">
                      {tpl.fields.map((f) => (
                        <span key={f} className="template-field-tag">{f}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
