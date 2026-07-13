// 统一编辑器页面 — 类 VBA 编辑器
// 表单设计 + 行为定义 + 流程编辑整合到一个页面
// 行为编辑时隐藏画布，右侧面板全屏展开

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import '../../designer/controls';
import { useDesigner } from '../../designer/useDesigner';
import { DesignCanvas } from '../../designer/DesignCanvas';
import { Toolbox } from '../../designer/Toolbox';
import { PropertyPanel } from '../../designer/PropertyPanel';
import { useProjectStore } from '../../project/store';
import type { FormEntry, BehaviorFile, WorkflowFile, DesignFile } from '../../project/types';
import { createFormEntry } from '../../project/types';
import CodeEditor from '../../components/CodeEditor';
import {
  createEventContextExtraLib,
  createEventContextSuggestions,
  type EventFieldDescriptor,
} from '../../components/codeEditorSuggestions';
import { getTemplatesByCategory, type BehaviorTemplate } from '../../services/config/behaviorTemplates';
import Modal, { ModalHeader } from '../../components/Modal';
import { CanvasWithProvider } from './CanvasPage';
import DataPreviewPage from './DataPreviewPage';
import SettingsPage from './SettingsPage';

// 编辑模式：决定中间/右侧布局
type EditMode = 'design' | 'behavior' | 'flow' | 'data' | 'settings';

export default function UnifiedEditorPage() {
  const project = useProjectStore((s) => s.project);
  const store = useProjectStore((s) => s) as any;
  const designer = useDesigner();

  // 表单相关状态
  const [forms, setForms] = useState<FormEntry[]>([]);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [leftPanelTab, setLeftPanelTab] = useState<'controls' | 'forms' | 'behaviors' | 'workflows'>('controls');
  const [editMode, setEditMode] = useState<EditMode>('data');

  // 行为相关状态
  const [editingBehaviorId, setEditingBehaviorId] = useState<string | null>(null);
  const [editingBehaviorScope, setEditingBehaviorScope] = useState<'form' | 'global'>('form');
  const [showTemplates, setShowTemplates] = useState(false);
  const [newBehaviorName, setNewBehaviorName] = useState('');
  const [newBehaviorEvent, setNewBehaviorEvent] = useState('onFieldChange');

  // 初始化：加载表单
  useEffect(() => {
    if (!project) return;
    if (project.forms?.length) {
      setForms(project.forms);
      if (!activeFormId) setActiveFormId(project.forms[0].id);
    } else if (project.designs?.length) {
      // 兼容旧格式：从 designs 迁移
      const now = new Date().toISOString();
      const migrated = project.designs.map((d) => ({
        id: `form_${d.id}`,
        name: d.name,
        design: d,
        behaviors: project.behaviors || [],
        createdAt: d.createdAt || now,
        updatedAt: d.updatedAt || now,
      }));
      setForms(migrated);
      if (!activeFormId) setActiveFormId(migrated[0].id);
    } else {
      const first = createFormEntry('表单 1');
      setForms([first]);
      setActiveFormId(first.id);
      store.addForm?.(first);
    }
  }, [project?.forms, project?.designs]);

  // 切换表单时先清空再加载
  useEffect(() => {
    if (editMode !== 'design') return;
    designer.clearDesign();
    const form = forms.find((f) => f.id === activeFormId);
    if (form?.design) designer.loadDesign(form.design);
  }, [activeFormId, editMode]);

  const activeForm = useMemo(() => forms.find((f) => f.id === activeFormId) || null, [forms, activeFormId]);
  const activeBehaviors = useMemo(() => activeForm?.behaviors || [], [activeForm]);
  const globalBehaviors = useMemo(() => project?.globalBehaviors || [], [project]);
  const allWorkflows = useMemo(() => project?.workflows || [], [project]);

  const fieldDescriptors = useMemo<EventFieldDescriptor[]>(() => {
    if (!project) return [];
    const fromTables = project.srcTable.flatMap((t) => t.sheets.flatMap((s) => s.columns.map((c) => ({
      name: c.name, type: c.dataType,
    }))));
    const fromComponents = (activeForm?.design?.components || []).map((c) => {
      const name = String(c.fieldBinding || c.props?.name || '').trim();
      if (!name) return null;
      if (c.type === 'number' || c.type === 'rating') return { name, type: 'number' };
      if (c.type === 'switch') return { name, type: 'boolean' };
      if (c.type === 'checkbox') return { name, type: 'array' };
      return { name, type: 'string' };
    }).filter(Boolean) as EventFieldDescriptor[];
    return [...new Map([...fromTables, ...fromComponents].map((f) => [f.name, f])).values()];
  }, [project, activeForm]);

  const events = [
    'onFormLoad', 'onRowLoad', 'onFieldChange', 'onFieldBlur', 'onFieldFocus',
    'onButtonClick', 'onValidate', 'onSubmit', 'onSubmitSuccess', 'onSubmitError',
    'onFormReady', 'onFormReset', 'onBeforeSubmit',
    'onFieldKeyDown', 'onFieldPaste', 'onFieldClear',
    'onRowAdd', 'onRowDelete', 'onRowSelect',
    'onDataImport', 'onDataExport', 'onValueChange',
  ];

  // ── 切换编辑模式 ──────────────────────────────

  const switchToDesign = useCallback(() => {
    setEditMode('design');
    setLeftPanelTab('controls');
  }, []);

  const switchToBehavior = useCallback((behaviorId?: string, scope: 'form' | 'global' = 'form') => {
    setEditMode('behavior');
    setLeftPanelTab('behaviors');
    if (behaviorId) {
      setEditingBehaviorId(behaviorId);
      setEditingBehaviorScope(scope);
    }
  }, []);

  const switchToFlow = useCallback(() => {
    setEditMode('flow');
    setLeftPanelTab('workflows');
  }, []);

  const switchToData = useCallback(() => {
    setEditMode('data');
  }, []);

  const switchToSettings = useCallback(() => {
    setEditMode('settings');
  }, []);

  useEffect(() => {
    if (editMode !== 'design') return;
    const first = requestAnimationFrame(() => {
      designer.refreshCanvasSize?.();
    });
    const second = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        designer.refreshCanvasSize?.();
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [editMode, designer]);

  // ── 表单操作 ──────────────────────────────────

  const handleCreateForm = useCallback(() => {
    const form = createFormEntry(`表单 ${forms.length + 1}`);
    setForms((prev) => [...prev, form]);
    setActiveFormId(form.id);
    store.addForm?.(form);
    switchToDesign();
  }, [forms.length, store, switchToDesign]);

  const handleDeleteForm = useCallback((id: string) => {
    setForms((prev) => prev.filter((f) => f.id !== id));
    if (activeFormId === id) setActiveFormId(forms.find((f) => f.id !== id)?.id || null);
    store.removeForm?.(id);
  }, [activeFormId, forms, store]);

  const handleSaveDesign = useCallback(() => {
    if (!activeFormId) return;
    const comps = designer.exportDesign();
    setForms((prev) => prev.map((f) => {
      if (f.id !== activeFormId) return f;
      const updated = { ...f, design: { ...f.design, components: comps, updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() };
      store.updateForm?.(f.id, { design: updated.design });
      return updated;
    }));
  }, [activeFormId, designer, store]);

  // ── 行为操作 ──────────────────────────────────

  const handleAddBehavior = useCallback((scope: 'form' | 'global') => {
    if (!newBehaviorName) return;
    const now = new Date().toISOString();
    const bh: BehaviorFile = {
      id: `bh_${Date.now()}`,
      name: newBehaviorName,
      event: newBehaviorEvent,
      code: `// ${newBehaviorName}\n`,
      priority: 10,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    if (scope === 'form' && activeFormId) {
      store.addFormBehavior?.(activeFormId, bh);
      setForms((prev) => prev.map((f) => f.id === activeFormId ? { ...f, behaviors: [...f.behaviors, bh] } : f));
    } else {
      store.addGlobalBehavior?.(bh);
    }
    setNewBehaviorName('');
    switchToBehavior(bh.id, scope);
  }, [newBehaviorName, newBehaviorEvent, activeFormId, store, switchToBehavior]);

  const handleDeleteBehavior = useCallback((id: string, scope: 'form' | 'global') => {
    if (scope === 'form' && activeFormId) {
      store.removeFormBehavior?.(activeFormId, id);
      setForms((prev) => prev.map((f) => f.id === activeFormId ? { ...f, behaviors: f.behaviors.filter((b) => b.id !== id) } : f));
    } else {
      store.removeGlobalBehavior?.(id);
    }
    if (editingBehaviorId === id) setEditingBehaviorId(null);
  }, [activeFormId, editingBehaviorId, store]);

  const handleUpdateBehaviorCode = useCallback((id: string, code: string, scope: 'form' | 'global') => {
    if (scope === 'form' && activeFormId) {
      store.updateFormBehavior?.(activeFormId, id, { code });
      setForms((prev) => prev.map((f) => f.id === activeFormId ? { ...f, behaviors: f.behaviors.map((b) => b.id === id ? { ...b, code } : b) } : f));
    } else {
      store.updateGlobalBehavior?.(id, { code });
    }
  }, [activeFormId, store]);

  const handleUpdateBehaviorEvent = useCallback((id: string, event: string, scope: 'form' | 'global') => {
    if (scope === 'form' && activeFormId) {
      store.updateFormBehavior?.(activeFormId, id, { event });
      setForms((prev) => prev.map((f) => f.id === activeFormId ? { ...f, behaviors: f.behaviors.map((b) => b.id === id ? { ...b, event } : b) } : f));
    } else {
      store.updateGlobalBehavior?.(id, { event });
    }
  }, [activeFormId, store]);

  const handleAddFromTemplate = useCallback((tpl: BehaviorTemplate, scope: 'form' | 'global') => {
    const now = new Date().toISOString();
    const bh: BehaviorFile = {
      id: `bh_${Date.now()}`,
      name: tpl.name,
      event: tpl.event,
      code: tpl.code,
      priority: 10,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    if (scope === 'form' && activeFormId) {
      store.addFormBehavior?.(activeFormId, bh);
      setForms((prev) => prev.map((f) => f.id === activeFormId ? { ...f, behaviors: [...f.behaviors, bh] } : f));
    } else {
      store.addGlobalBehavior?.(bh);
    }
    setShowTemplates(false);
    switchToBehavior(bh.id, scope);
  }, [activeFormId, store, switchToBehavior]);

  // 查找当前编辑的行为
  const editingBehavior = useMemo(() => {
    if (editingBehaviorScope === 'form') {
      const found = activeBehaviors.find((b) => b.id === editingBehaviorId);
      return found ? { behavior: found, scope: 'form' as const } : null;
    }
    const globalFound = globalBehaviors.find((b) => b.id === editingBehaviorId);
    return globalFound ? { behavior: globalFound, scope: 'global' as const } : null;
  }, [editingBehaviorId, editingBehaviorScope, activeBehaviors, globalBehaviors]);

  const isBehaviorMode = editMode === 'behavior';

  return (
    <div className="unified-editor">
      {/* 工具栏 */}
      <div className="unified-toolbar">
        <div className="unified-toolbar-primary">
          <div className="unified-mode-switch unified-mode-switch-main">
            <button className={`unified-mode-btn ${editMode === 'data' ? 'active' : ''}`} onClick={switchToData}>
              数据预览
            </button>
            <button className={`unified-mode-btn ${editMode === 'design' ? 'active' : ''}`} onClick={switchToDesign}>
              表单设计
            </button>
            <button className={`unified-mode-btn ${editMode === 'behavior' ? 'active' : ''}`} onClick={() => switchToBehavior()}>
              行为定义
            </button>
            <button className={`unified-mode-btn ${editMode === 'flow' ? 'active' : ''}`} onClick={switchToFlow}>
              流程编排
            </button>
            <button className={`unified-mode-btn ${editMode === 'settings' ? 'active' : ''}`} onClick={switchToSettings}>
              项目设置
            </button>
          </div>
        </div>
        <div className="unified-toolbar-secondary">
          {editMode === 'design' && (
            <button onClick={handleSaveDesign} className="toolbar-btn">保存</button>
          )}
          <div className="unified-toolbar-context">
            {editMode === 'flow' ? (
              <>
                <span className="unified-context-text">{allWorkflows.length} 个流程</span>
              </>
            ) : (
              <>
                <select
                  className="toolbar-form-select"
                  value={activeFormId || ''}
                  onChange={(e) => { setActiveFormId(e.target.value); if (editMode === 'behavior') switchToDesign(); }}
                >
                  {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <span className="toolbar-info-detail">
                  {editMode === 'design' ? `${designer.components.length} 个控件` : `${activeBehaviors.length + globalBehaviors.length} 个行为`}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="unified-body">
        {/* 左侧面板（流程/数据/设置模式隐藏） */}
        {editMode !== 'flow' && editMode !== 'data' && editMode !== 'settings' && <div className="unified-left">
          <div className="unified-left-tabs">
            {editMode === 'design' && (
              <button className={`unified-left-tab ${leftPanelTab === 'controls' ? 'active' : ''}`} onClick={() => setLeftPanelTab('controls')}>控件</button>
            )}
            <button className={`unified-left-tab ${leftPanelTab === 'forms' ? 'active' : ''}`} onClick={() => setLeftPanelTab('forms')}>表单</button>
            <button className={`unified-left-tab ${leftPanelTab === 'behaviors' ? 'active' : ''}`} onClick={() => setLeftPanelTab('behaviors')}>行为</button>
            <button className={`unified-left-tab ${leftPanelTab === 'workflows' ? 'active' : ''}`} onClick={() => { setLeftPanelTab('workflows'); switchToFlow(); }}>流程</button>
          </div>

          <div className="unified-left-body">
            {/* 控件工具箱（仅设计模式） */}
            {leftPanelTab === 'controls' && editMode === 'design' && (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Toolbox />
              </div>
            )}

            {/* 表单列表 */}
            {leftPanelTab === 'forms' && (
              <div className="unified-panel-content">
                <div className="unified-panel-header">
                  <span>表单 ({forms.length})</span>
                  <button onClick={handleCreateForm} className="unified-add-btn">+ 新建</button>
                </div>
                {forms.map((form) => (
                  <div
                    key={form.id}
                    className={`unified-list-item ${activeFormId === form.id ? 'active' : ''}`}
                    onClick={() => { setActiveFormId(form.id); if (editMode === 'behavior') switchToDesign(); }}
                  >
                    <span className="unified-list-icon">📋</span>
                    <div className="unified-list-info">
                      <span className="unified-list-name">{form.name}</span>
                      <span className="unified-list-meta">{form.behaviors.length} 个行为</span>
                    </div>
                    <button className="unified-list-delete" onClick={(e) => { e.stopPropagation(); handleDeleteForm(form.id); }}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* 行为列表 */}
            {leftPanelTab === 'behaviors' && (
              <div className="unified-panel-content">
                {/* 全局行为 */}
                <div className="unified-panel-header">
                  <span>全局行为 ({globalBehaviors.length})</span>
                  <button onClick={() => handleAddBehavior('global')} className="unified-add-btn">+ 新建</button>
                </div>
                {globalBehaviors.map((bh) => (
                  <div
                    key={bh.id}
                    className={`unified-list-item ${editingBehaviorId === bh.id && editingBehaviorScope === 'global' ? 'active' : ''}`}
                    onClick={() => switchToBehavior(bh.id, 'global')}
                  >
                    <span className="unified-list-icon">🌐</span>
                    <div className="unified-list-info">
                      <span className="unified-list-name">{bh.name}</span>
                      <span className="unified-list-meta">{bh.event}</span>
                    </div>
                    <button className="unified-list-delete" onClick={(e) => { e.stopPropagation(); handleDeleteBehavior(bh.id, 'global'); }}>×</button>
                  </div>
                ))}

                <div className="unified-panel-divider" />

                {/* 当前表单行为 */}
                <div className="unified-panel-header">
                  <span>{activeForm?.name || '表单'} 行为 ({activeBehaviors.length})</span>
                  <button onClick={() => handleAddBehavior('form')} className="unified-add-btn">+ 新建</button>
                </div>
                {activeBehaviors.map((bh) => (
                  <div
                    key={bh.id}
                    className={`unified-list-item ${editingBehaviorId === bh.id && editingBehaviorScope === 'form' ? 'active' : ''}`}
                    onClick={() => switchToBehavior(bh.id, 'form')}
                  >
                    <span className="unified-list-icon">📝</span>
                    <div className="unified-list-info">
                      <span className="unified-list-name">{bh.name}</span>
                      <span className="unified-list-meta">{bh.event}</span>
                    </div>
                    <button className="unified-list-delete" onClick={(e) => { e.stopPropagation(); handleDeleteBehavior(bh.id, 'form'); }}>×</button>
                  </div>
                ))}

                <div className="unified-panel-divider" />
                <button onClick={() => setShowTemplates(true)} className="unified-template-btn">从模板创建</button>
              </div>
            )}

            {/* 流程列表 */}
            {leftPanelTab === 'workflows' && (
              <div className="unified-panel-content">
                <div className="unified-panel-header">
                  <span>流程 ({allWorkflows.length})</span>
                </div>
                {allWorkflows.length === 0 ? (
                  <div className="unified-empty">
                    <p>暂无流程</p>
                    <p style={{ fontSize: 11, marginTop: 4 }}>请在流程编排页创建</p>
                  </div>
                ) : allWorkflows.map((wf) => (
                  <div key={wf.id} className="unified-list-item">
                    <span className="unified-list-icon">⚡</span>
                    <div className="unified-list-info">
                      <span className="unified-list-name">{wf.name}</span>
                      <span className="unified-list-meta">{wf.nodes?.length || 0} 个节点</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>}

        {/* 中间：所有面板保持挂载，用 CSS 显示/隐藏 */}
        <div className="unified-center" style={{ display: editMode !== 'behavior' ? 'flex' : 'none' }}>
          <div style={{ display: editMode === 'design' ? 'flex' : 'none', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}><DesignCanvas designer={designer} /></div>
          <div style={{ display: editMode === 'flow' ? 'flex' : 'none', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}><CanvasWithProvider /></div>
          <div style={{ display: editMode === 'data' ? 'flex' : 'none', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}><DataPreviewPage /></div>
          <div style={{ display: editMode === 'settings' ? 'flex' : 'none', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}><SettingsPage /></div>
        </div>
        {editMode === 'behavior' && (
          <div className="unified-center-behavior">
            <div className="behavior-overview">
              <div className="behavior-overview-header">
                <h3>{activeForm?.name || '未选择表单'}</h3>
                <p>当前表单绑定 {activeBehaviors.length} 个行为，全局行为 {globalBehaviors.length} 个</p>
              </div>
              <div className="behavior-overview-list">
                <h4>表单行为</h4>
                {activeBehaviors.length === 0 ? (
                  <p className="behavior-overview-empty">暂无表单行为，请在左侧创建</p>
                ) : activeBehaviors.map((bh) => (
                  <div
                    key={bh.id}
                    className={`behavior-overview-item ${editingBehaviorId === bh.id ? 'active' : ''}`}
                    onClick={() => switchToBehavior(bh.id, 'form')}
                  >
                    <span className="behavior-overview-dot" />
                    <span className="behavior-overview-name">{bh.name}</span>
                    <span className="behavior-overview-event">{bh.event}</span>
                  </div>
                ))}
                <h4 style={{ marginTop: 12 }}>全局行为</h4>
                {globalBehaviors.length === 0 ? (
                  <p className="behavior-overview-empty">暂无全局行为</p>
                ) : globalBehaviors.map((bh) => (
                  <div
                    key={bh.id}
                    className={`behavior-overview-item ${editingBehaviorId === bh.id ? 'active' : ''}`}
                    onClick={() => switchToBehavior(bh.id, 'global')}
                  >
                    <span className="behavior-overview-dot global" />
                    <span className="behavior-overview-name">{bh.name}</span>
                    <span className="behavior-overview-event">{bh.event}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 右侧面板（流程/数据/设置模式隐藏） */}
        {editMode !== 'flow' && editMode !== 'data' && editMode !== 'settings' && <div className={`unified-right ${isBehaviorMode ? 'unified-right-expanded' : ''}`}>
          {isBehaviorMode ? (
            // 行为模式：全屏行为编辑器
            editingBehavior ? (
              <div className="unified-behavior-editor">
                <div className="unified-behavior-header">
                  <div className="unified-behavior-title">
                    <span className="unified-behavior-scope">{editingBehavior.scope === 'global' ? '🌐' : '📝'}</span>
                    <span>{editingBehavior.behavior.name}</span>
                  </div>
                  <div className="unified-behavior-controls">
                    <select
                      value={editingBehavior.behavior.event}
                      onChange={(e) => handleUpdateBehaviorEvent(editingBehavior.behavior.id, e.target.value, editingBehavior.scope)}
                    >
                      {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                    </select>
                    <label className="unified-behavior-toggle">
                      <input
                        type="checkbox"
                        checked={editingBehavior.behavior.enabled}
                        onChange={(e) => {
                          const id = editingBehavior.behavior.id;
                          const scope = editingBehavior.scope;
                          if (scope === 'form' && activeFormId) {
                            store.updateFormBehavior?.(activeFormId, id, { enabled: e.target.checked });
                            setForms((prev) => prev.map((f) => f.id === activeFormId ? { ...f, behaviors: f.behaviors.map((b) => b.id === id ? { ...b, enabled: e.target.checked } : b) } : f));
                          } else {
                            store.updateGlobalBehavior?.(id, { enabled: e.target.checked });
                          }
                        }}
                      />
                      <span>启用</span>
                    </label>
                  </div>
                </div>
                <div className="unified-behavior-editor-body">
                  <CodeEditor
                    value={editingBehavior.behavior.code}
                    onChange={(code) => handleUpdateBehaviorCode(editingBehavior.behavior.id, code, editingBehavior.scope)}
                    language="javascript"
                    theme="light"
                    extraLibs={[createEventContextExtraLib({
                      filePath: `inmemory://behavior-${editingBehavior.behavior.id}.d.ts`,
                      fields: fieldDescriptors,
                      eventName: editingBehavior.behavior.event,
                    })]}
                    suggestions={createEventContextSuggestions({
                      fields: fieldDescriptors,
                      workflows: allWorkflows,
                      eventName: editingBehavior.behavior.event,
                    })}
                    autoSuggestPolicy="explicit"
                    suggestionTriggerCharacters={['.', "'", '"', '(', '$']}
                    lineNumbers
                    options={{ minimap: { enabled: true }, folding: true, fontSize: 13, lineHeight: 21 }}
                    fullscreen
                  />
                </div>
              </div>
            ) : (
              <div className="unified-empty">
                <p>选择左侧行为进行编辑</p>
                <p style={{ fontSize: 11, marginTop: 4 }}>或点击「+ 新建」创建新行为</p>
              </div>
            )
          ) : (
            // 设计模式：属性/流程面板
            <>
              <div className="unified-right-tabs">
                <button className={`unified-right-tab ${true ? 'active' : ''}`}>属性</button>
              </div>
              <div className="unified-right-body">
                <PropertyPanel
                  component={designer.selectedId ? designer.components.find((c) => c.id === designer.selectedId) || null : null}
                  components={designer.components}
                  onUpdate={designer.updateComponentProps}
                  onRemove={designer.removeComponent}
                />
              </div>
            </>
          )}
        </div>}
      </div>

      {/* 模板弹窗 */}
      <Modal open={showTemplates} onClose={() => setShowTemplates(false)} width="640px" maxWidth="90vw" maxHeight="80vh">
        <ModalHeader title="行为模板库" onClose={() => setShowTemplates(false)} />
        <div style={{ padding: '0 0 8px' }}>
          {Object.entries(getTemplatesByCategory()).map(([category, templates]) => (
            <div key={category} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', padding: '8px 16px 4px' }}>{category}</div>
              {templates.map((tpl) => (
                <div key={tpl.id} onClick={() => handleAddFromTemplate(tpl, 'form')} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{tpl.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>{tpl.event}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tpl.description}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
