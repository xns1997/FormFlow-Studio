// 统一编辑器页面 — 类 VBA 编辑器
// 表单设计 + 行为定义 + 流程编辑整合到一个页面
// 行为编辑时隐藏画布，右侧面板全屏展开

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Segmented, Select } from 'antd';
import '../../designer/controls';
import { useDesigner } from '../../designer/useDesigner';
import { DesignCanvas } from '../../designer/DesignCanvas';
import { Toolbox } from '../../designer/Toolbox';
import { PropertyPanel } from '../../designer/PropertyPanel';
import { useProjectStore } from '../../project/store';
import type { FormEntry, BehaviorFile, DesignComponent } from '../../project/types';
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
import { getBehaviorEventDoc } from '../../services/io/behaviorDocs';

// 编辑模式：决定中间/右侧布局
type EditMode = 'design' | 'behavior' | 'flow' | 'data' | 'settings';

export default function UnifiedEditorPage() {
  const project = useProjectStore((s) => s.project);
  const store = useProjectStore((s) => s) as any;
  const designer = useDesigner();
  const [searchParams, setSearchParams] = useSearchParams();

  // 表单相关状态
  const [forms, setForms] = useState<FormEntry[]>([]);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [leftPanelTab, setLeftPanelTab] = useState<'controls' | 'forms' | 'behaviors' | 'workflows'>('controls');
  const initialMode = searchParams.get('mode') as EditMode | null;
  const [editMode, setEditMode] = useState<EditMode>(initialMode && ['design', 'behavior', 'flow', 'data', 'settings'].includes(initialMode) ? initialMode : 'design');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // 行为相关状态
  const [editingBehaviorId, setEditingBehaviorId] = useState<string | null>(searchParams.get('behavior'));
  const [editingBehaviorScope, setEditingBehaviorScope] = useState<'form' | 'global'>('form');
  const [showTemplates, setShowTemplates] = useState(false);
  const [newBehaviorName, setNewBehaviorName] = useState('');
  const [newBehaviorEvent, setNewBehaviorEvent] = useState('onFieldChange');
  const [createBehaviorTarget, setCreateBehaviorTarget] = useState<{ scope: 'form' | 'global'; formId?: string } | null>(null);
  const [behaviorDraft, setBehaviorDraft] = useState('');
  const [behaviorDirty, setBehaviorDirty] = useState(false);
  const designHydratedRef = useRef(false);
  const structuredEditPendingRef = useRef(false);

  // 初始化：加载表单
  useEffect(() => {
    if (!project) return;
    if (project.forms?.length) {
      setForms(project.forms);
      if (!activeFormId) setActiveFormId(searchParams.get('form') || project.forms[0].id);
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
    designHydratedRef.current = false;
    designer.clearDesign();
    const form = forms.find((f) => f.id === activeFormId);
    if (form?.design) designer.loadDesign(form.design);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => { designHydratedRef.current = true; });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeFormId]);

  const activeForm = useMemo(() => forms.find((f) => f.id === activeFormId) || null, [forms, activeFormId]);
  const activeBehaviors = useMemo(() => activeForm?.behaviors || [], [activeForm]);
  const globalBehaviors = useMemo(() => project?.globalBehaviors || [], [project]);
  const allWorkflows = useMemo(() => project?.workflows || [], [project]);

  useEffect(() => {
    if (editMode !== 'behavior' || !editingBehaviorId || editingBehaviorScope !== 'form') return;
    const owner = forms.find((form) => form.behaviors.some((behavior) => behavior.id === editingBehaviorId));
    if (owner && owner.id !== activeFormId) setActiveFormId(owner.id);
  }, [editMode, editingBehaviorId, editingBehaviorScope, forms, activeFormId]);

  useEffect(() => {
    if (!editingBehaviorId) return;
    if (globalBehaviors.some((behavior) => behavior.id === editingBehaviorId)) {
      setEditingBehaviorScope('global');
      return;
    }
    const owner = forms.find((form) => form.behaviors.some((behavior) => behavior.id === editingBehaviorId));
    if (owner) {
      setEditingBehaviorScope('form');
      if (owner.id !== activeFormId) setActiveFormId(owner.id);
    }
  }, [editingBehaviorId, globalBehaviors, forms]);
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
  const eventOptions = events.map((eventName) => {
    const doc = getBehaviorEventDoc(eventName, 'script');
    return { value: eventName, label: eventName, description: doc?.summary || doc?.triggerWhen || '在对应表单事件发生时执行。' };
  });

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
  }, [editMode, designer.refreshCanvasSize]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('mode', editMode);
    if (activeFormId) next.set('form', activeFormId); else next.delete('form');
    if (designer.selectedId) next.set('component', designer.selectedId); else next.delete('component');
    next.delete('event');
    if (editingBehaviorId) next.set('behavior', editingBehaviorId); else next.delete('behavior');
    setSearchParams(next, { replace: true });
  }, [editMode, activeFormId, designer.selectedId, editingBehaviorId]);

  useEffect(() => {
    const requestedMode = searchParams.get('mode') as EditMode | null;
    if (requestedMode && ['design', 'behavior', 'flow', 'data', 'settings'].includes(requestedMode) && requestedMode !== editMode) {
      setEditMode(requestedMode);
      if (requestedMode === 'flow') setLeftPanelTab('workflows');
      else if (requestedMode === 'behavior') setLeftPanelTab('behaviors');
      else if (requestedMode === 'design') setLeftPanelTab('controls');
    }
  }, [searchParams]);

  useEffect(() => {
    const componentId = searchParams.get('component');
    if (componentId && designer.components.some((component) => component.id === componentId)) {
      designer.setSelectedId(componentId);
    }
  }, [designer.components]);

  // ── 表单操作 ──────────────────────────────────

  const handleCreateForm = useCallback(() => {
    const form = createFormEntry(`表单 ${forms.length + 1}`);
    setForms((prev) => [...prev, form]);
    setActiveFormId(form.id);
    store.addForm?.(form);
    switchToDesign();
  }, [forms.length, store, switchToDesign]);

  const handleDeleteForm = useCallback((id: string) => {
    const target = forms.find((form) => form.id === id);
    if (!window.confirm(`确定删除表单“${target?.name || '未命名表单'}”？表单中的控件和规则也会一起删除。`)) return;
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

  useEffect(() => {
    if (!activeFormId || !designHydratedRef.current || !structuredEditPendingRef.current || editMode === 'data' || editMode === 'settings') return;
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      const components = designer.exportDesign();
      const form = forms.find((item) => item.id === activeFormId);
      if (!form) return;
      const design = { ...form.design, components, updatedAt: new Date().toISOString() };
      Promise.resolve(store.updateForm?.(activeFormId, { design }))
        .then(() => {
          structuredEditPendingRef.current = false;
          setForms((current) => current.map((item) => item.id === activeFormId ? { ...item, design } : item));
          setSaveState('saved');
        })
        .catch(() => setSaveState('error'));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [designer.components, activeFormId]);

  useEffect(() => {
    if (designer.historyRevision > 0 && activeFormId && designHydratedRef.current) structuredEditPendingRef.current = true;
  }, [designer.historyRevision, activeFormId]);

  // ── 行为操作 ──────────────────────────────────

  const handleAddBehavior = useCallback((scope: 'form' | 'global', targetFormId?: string) => {
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
    const formId = targetFormId || activeFormId;
    if (scope === 'form' && formId) {
      setActiveFormId(formId);
      store.addFormBehavior?.(formId, bh);
      setForms((prev) => prev.map((f) => f.id === formId ? { ...f, behaviors: [...f.behaviors, bh] } : f));
    } else {
      store.addGlobalBehavior?.(bh);
    }
    setNewBehaviorName('');
    setCreateBehaviorTarget(null);
    switchToBehavior(bh.id, scope);
  }, [newBehaviorName, newBehaviorEvent, activeFormId, store, switchToBehavior]);

  const handleDeleteBehavior = useCallback((id: string, scope: 'form' | 'global', targetFormId?: string) => {
    const target = scope === 'global'
      ? globalBehaviors.find((behavior) => behavior.id === id)
      : forms.find((form) => form.id === (targetFormId || activeFormId))?.behaviors.find((behavior) => behavior.id === id);
    if (!window.confirm(`确定删除规则“${target?.name || '未命名规则'}”？此操作无法撤销。`)) return;
    const formId = targetFormId || activeFormId;
    if (scope === 'form' && formId) {
      store.removeFormBehavior?.(formId, id);
      setForms((prev) => prev.map((f) => f.id === formId ? { ...f, behaviors: f.behaviors.filter((b) => b.id !== id) } : f));
    } else {
      store.removeGlobalBehavior?.(id);
    }
    if (editingBehaviorId === id) setEditingBehaviorId(null);
  }, [activeFormId, editingBehaviorId, forms, globalBehaviors, store]);

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

  useEffect(() => {
    setBehaviorDraft(editingBehavior?.behavior.code || '');
    setBehaviorDirty(false);
  }, [editingBehavior?.behavior.id]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!behaviorDirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [behaviorDirty]);

  const applyBehaviorDraft = useCallback(() => {
    if (!editingBehavior) return;
    handleUpdateBehaviorCode(editingBehavior.behavior.id, behaviorDraft, editingBehavior.scope);
    setBehaviorDirty(false);
  }, [editingBehavior, behaviorDraft, handleUpdateBehaviorCode]);

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
          {editMode === 'behavior' && (
            <Segmented
              className="behavior-preview-switch"
              size="small"
              value={designer.mode === 'preview' ? 'preview' : 'select'}
              options={[
                { label: '选择控件', value: 'select' },
                { label: '预览表单', value: 'preview' },
              ]}
              onChange={(value) => {
                const nextMode = value === 'preview' ? 'preview' : 'design';
                if (designer.mode !== nextMode) designer.toggleMode();
              }}
            />
          )}
          {editMode === 'design' && (
            <button onClick={handleSaveDesign} className="toolbar-btn">保存</button>
          )}
          {editMode !== 'data' && editMode !== 'settings' && (
            <span className={`chain-save-state ${saveState}`}>
              {saveState === 'saving' ? '保存中…' : saveState === 'error' ? '保存失败' : saveState === 'saved' ? '已自动保存' : ''}
            </span>
          )}
          <div className="unified-toolbar-context">
            {editMode === 'flow' ? (
              <>
                <span className="unified-context-text">{allWorkflows.length} 个流程</span>
              </>
            ) : editMode === 'behavior' ? (
              <span className="unified-context-text">
                全部行为 {globalBehaviors.length + forms.reduce((sum, form) => sum + form.behaviors.length, 0)} 个
              </span>
            ) : (
              <>
                <select
                  className="toolbar-form-select"
                  value={activeFormId || ''}
                  onChange={(e) => setActiveFormId(e.target.value)}
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
        {/* 链路工作台左侧始终保留表单上下文 */}
        {editMode !== 'flow' && editMode !== 'data' && editMode !== 'settings' && <div className="unified-left">
          {editMode === 'behavior' ? (
            <div className="unified-left-context-title">全部行为</div>
          ) : <div className="unified-left-tabs">
            {(editMode === 'design' || editMode === 'behavior' || editMode === 'flow') && (
              <button className={`unified-left-tab ${leftPanelTab === 'controls' ? 'active' : ''}`} onClick={() => setLeftPanelTab('controls')}>控件</button>
            )}
            <button className={`unified-left-tab ${leftPanelTab === 'forms' ? 'active' : ''}`} onClick={() => setLeftPanelTab('forms')}>表单</button>
            <button className={`unified-left-tab ${leftPanelTab === 'behaviors' ? 'active' : ''}`} onClick={() => setLeftPanelTab('behaviors')}>行为</button>
            <button className={`unified-left-tab ${leftPanelTab === 'workflows' ? 'active' : ''}`} onClick={() => { setLeftPanelTab('workflows'); switchToFlow(); }}>流程</button>
          </div>}

          <div className={`unified-left-body ${editMode === 'design' && leftPanelTab === 'controls' ? 'toolbox-active' : ''}`}>
            {/* 控件工具箱（仅设计模式） */}
            {editMode !== 'behavior' && leftPanelTab === 'controls' && (
              <div className="unified-toolbox-slot">
                {editMode === 'design' ? <Toolbox /> : (
                  <div className="chain-component-list">
                    <div className="unified-panel-header"><span>当前表单控件</span></div>
                    {designer.components.map((component) => (
                      <button key={component.id} className={`chain-component-item ${designer.selectedId === component.id ? 'active' : ''}`} onClick={() => designer.setSelectedId(component.id)}>
                        <span>{String(component.props?.label || component.props?.name || component.fieldBinding || component.type)}</span>
                        <small>{component.type}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 表单列表 */}
            {editMode !== 'behavior' && leftPanelTab === 'forms' && (
              <div className="unified-panel-content">
                <div className="unified-panel-header">
                  <span>表单 ({forms.length})</span>
                  <button onClick={handleCreateForm} className="unified-add-btn">+ 新建</button>
                </div>
                {forms.map((form) => (
                  <div
                    key={form.id}
                    className={`unified-list-item ${activeFormId === form.id ? 'active' : ''}`}
                    onClick={() => setActiveFormId(form.id)}
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
            {(editMode === 'behavior' || leftPanelTab === 'behaviors') && (
              <div className="unified-panel-content">
                {/* 全局行为 */}
                <div className="unified-panel-header">
                  <span>全局行为 ({globalBehaviors.length})</span>
                  <button onClick={() => setCreateBehaviorTarget({ scope: 'global' })} className="unified-add-btn">+ 新建</button>
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

                {/* 所有表单行为；点击时自动切换只读表单上下文 */}
                {forms.map((form) => (
                  <React.Fragment key={form.id}>
                    <div className="unified-panel-header behavior-form-group">
                      <span>{form.name} ({form.behaviors.length})</span>
                      <button onClick={() => setCreateBehaviorTarget({ scope: 'form', formId: form.id })} className="unified-add-btn">+ 新建</button>
                    </div>
                    {form.behaviors.map((bh) => (
                      <div
                        key={bh.id}
                        className={`unified-list-item ${editingBehaviorId === bh.id && editingBehaviorScope === 'form' ? 'active' : ''}`}
                        onClick={() => { setActiveFormId(form.id); switchToBehavior(bh.id, 'form'); }}
                      >
                        <span className="unified-list-icon">📝</span>
                        <div className="unified-list-info">
                          <span className="unified-list-name">{bh.name}</span>
                          <span className="unified-list-meta">{bh.event}</span>
                        </div>
                        <button className="unified-list-delete" onClick={(e) => { e.stopPropagation(); handleDeleteBehavior(bh.id, 'form', form.id); }}>×</button>
                      </div>
                    ))}
                  </React.Fragment>
                ))}

                <div className="unified-panel-divider" />
                <button onClick={() => setShowTemplates(true)} className="unified-template-btn">从模板创建</button>
              </div>
            )}

            {/* 流程列表 */}
            {editMode !== 'behavior' && leftPanelTab === 'workflows' && (
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
                  <div key={wf.id} className={`unified-list-item ${searchParams.get('workflow') === wf.id ? 'active' : ''}`} onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('workflow', wf.id);
                    setSearchParams(next, { replace: true });
                    switchToFlow();
                  }}>
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

        {/* 中间：行为模式保留只读可选择表单；流程模式使用纯流程画布 */}
        <div className="unified-center">
          {editMode === 'design' && <div className="chain-form-pane"><DesignCanvas designer={designer} /></div>}
          {editMode === 'behavior' && <div className="chain-form-pane behavior-readonly-pane">
            <DesignCanvas designer={designer} readOnly hideToolbar />
            {designer.mode === 'design' && <SelectedControlInfo
              component={designer.selectedId ? designer.components.find((component) => component.id === designer.selectedId) || null : null}
            />}
          </div>}
          {editMode === 'flow' && <div className="chain-flow-pane"><CanvasWithProvider /></div>}
          <div style={{ display: editMode === 'data' ? 'flex' : 'none', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}><DataPreviewPage /></div>
          <div style={{ display: editMode === 'settings' ? 'flex' : 'none', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}><SettingsPage /></div>
        </div>

        {/* 右侧：行为代码或属性配置 */}
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
                    <button className="toolbar-btn" disabled={!behaviorDirty} onClick={applyBehaviorDraft}>应用更改</button>
                    <Select
                      className="behavior-event-select"
                      value={editingBehavior.behavior.event}
                      onChange={(value) => handleUpdateBehaviorEvent(editingBehavior.behavior.id, value, editingBehavior.scope)}
                      options={eventOptions}
                      optionRender={(option) => (
                        <div className="behavior-event-option">
                          <strong>{option.data.label}</strong>
                          <span>{option.data.description}</span>
                        </div>
                      )}
                      showSearch
                      optionFilterProp="label"
                      popupMatchSelectWidth={360}
                    />
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
                    value={behaviorDraft}
                    onChange={(code) => { setBehaviorDraft(code); setBehaviorDirty(code !== editingBehavior.behavior.code); }}
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
          ) : <PropertyPanel
            component={designer.selectedId ? designer.components.find((c) => c.id === designer.selectedId) || null : null}
            components={designer.components}
            onUpdate={(id, patch) => {
              structuredEditPendingRef.current = true;
              designer.updateComponentProps(id, patch);
            }}
            onUpdateGeometry={(id, patch) => {
              structuredEditPendingRef.current = true;
              designer.updateComponentGeometry(id, patch);
            }}
            onRemove={designer.removeComponent}
          />}
        </div>}
      </div>

      <Modal open={!!createBehaviorTarget} onClose={() => setCreateBehaviorTarget(null)} width="440px" maxWidth="90vw">
        <ModalHeader
          title={createBehaviorTarget?.scope === 'global' ? '新建全局行为' : `新建 ${forms.find((form) => form.id === createBehaviorTarget?.formId)?.name || '表单'} 行为`}
          onClose={() => setCreateBehaviorTarget(null)}
        />
        <div className="behavior-create-form">
          <label>
            <span>行为名称</span>
            <input autoFocus value={newBehaviorName} placeholder="例如：提交前校验" onChange={(event) => setNewBehaviorName(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter' && newBehaviorName.trim() && createBehaviorTarget) handleAddBehavior(createBehaviorTarget.scope, createBehaviorTarget.formId);
            }} />
          </label>
          <label>
            <span>触发事件</span>
            <Select
              value={newBehaviorEvent}
              onChange={setNewBehaviorEvent}
              options={eventOptions}
              optionRender={(option) => (
                <div className="behavior-event-option">
                  <strong>{option.data.label}</strong>
                  <span>{option.data.description}</span>
                </div>
              )}
              showSearch
              optionFilterProp="label"
              popupMatchSelectWidth={390}
              placeholder="选择触发事件"
            />
            <small className="behavior-event-hint">
              {eventOptions.find((option) => option.value === newBehaviorEvent)?.description}
            </small>
          </label>
          <div className="behavior-create-actions">
            <button className="toolbar-btn" onClick={() => setCreateBehaviorTarget(null)}>取消</button>
            <button className="toolbar-btn primary" disabled={!newBehaviorName.trim()} onClick={() => {
              if (createBehaviorTarget) handleAddBehavior(createBehaviorTarget.scope, createBehaviorTarget.formId);
            }}>创建并编辑</button>
          </div>
        </div>
      </Modal>

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

function SelectedControlInfo({ component }: { component: DesignComponent | null }) {
  if (!component) {
    return <div className="behavior-control-info empty">点击表单中的控件查看信息</div>;
  }
  const eventNames = [...new Set([
    ...Object.keys(component.props?.events || {}),
    ...Object.keys(component.props?.flowTriggers || {}),
    ...Object.keys(component.props?.linkageRules || {}),
  ])];
  return (
    <div className="behavior-control-info">
      <div className="behavior-control-info-title">
        <strong>{String(component.props?.label || component.props?.name || component.fieldBinding || component.id)}</strong>
        <span>{component.type}</span>
      </div>
      <dl>
        <div><dt>控件 ID</dt><dd>{component.id}</dd></div>
        <div><dt>字段绑定</dt><dd>{component.fieldBinding || component.props?.name || '未绑定'}</dd></div>
        <div><dt>已配置事件</dt><dd>{eventNames.length ? eventNames.join('、') : '暂无'}</dd></div>
      </dl>
    </div>
  );
}
