// 统一编辑器页面 — 类 VBA 编辑器
// 表单设计 + 行为定义 + 流程编辑整合到一个页面
// 行为编辑时隐藏画布，右侧面板全屏展开

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { notification, Segmented, Select } from 'antd';
import '../../designer/controls';
import { useDesigner } from '../../designer/useDesigner';
import { DesignCanvas } from '../../designer/DesignCanvas';
import { Toolbox } from '../../designer/Toolbox';
import { PropertyPanel } from '../../designer/PropertyPanel';
import { useProjectStore } from '../../project/store';
import type { FormEntry, BehaviorFile, DesignComponent } from '../../project/types';
import { createFormEntry } from '../../project/types';
import CodeEditor from '../../components/CodeEditor';
import BehaviorDslEditor from '../../components/BehaviorDslEditor';
import {
  createEventContextExtraLib,
  createChainApiExtraLib,
  createEventContextSuggestions,
  type EventFieldDescriptor,
} from '../../components/codeEditorSuggestions';
import { getTemplatesByCategory, type BehaviorTemplate } from '../../services/config/behaviorTemplates';
import Modal, { ModalHeader } from '../../components/Modal';
import { AntdCompatSelect } from '../../components/AntdFormControls';
import { CanvasWithProvider } from './CanvasPage';
import DataPreviewPage from './DataPreviewPage';
import SettingsPage from './SettingsPage';
import { getBehaviorEventDoc } from '../../services/io/behaviorDocs';
import { diagnoseForm, findUnrepresentedColumns, summarizeFormDiagnostics } from '../../services/formGeneration/formDiagnostics';
import { generateMissingFieldComponents } from '../../services/formGeneration/formScaffold';
import { applyBehaviorDslToComponents } from '../../services/engine/behaviorDsl';
import { buildDevelopmentQuality } from '../../services/formGeneration/formQuality';
import { createMethodDefaults, METHOD_LIBRARY } from '../../services/engine/methodLibrary';
import { renameFieldReferences } from '../../services/formGeneration/fieldSynchronization';
import { useAppInteraction } from '../../components/AppInteractionProvider';
import { DesignerIcon } from '../../designer/icons';
import { useWorkbenchPanels } from './useWorkbenchPanels';

// 编辑模式：决定中间/右侧布局
type EditMode = 'design' | 'behavior' | 'flow' | 'data' | 'settings';

export default function UnifiedEditorPage() {
  const project = useProjectStore((s) => s.project);
  const store = useProjectStore((s) => s) as any;
  const designer = useDesigner();
  const [searchParams, setSearchParams] = useSearchParams();
  const { confirm, announce } = useAppInteraction();

  // 表单相关状态
  const [forms, setForms] = useState<FormEntry[]>([]);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [renamingFormId, setRenamingFormId] = useState<string | null>(null);
  const [formNameDraft, setFormNameDraft] = useState('');
  const [leftPanelTab, setLeftPanelTab] = useState<'controls' | 'fields' | 'forms' | 'behaviors' | 'workflows'>('controls');
  const initialMode = searchParams.get('mode') as EditMode | null;
  const [editMode, setEditMode] = useState<EditMode>(initialMode && ['design', 'behavior', 'flow', 'data', 'settings'].includes(initialMode) ? initialMode : 'design');
  const hasWorkbenchPanels = editMode === 'design' || editMode === 'behavior';
  const panels = useWorkbenchPanels(hasWorkbenchPanels);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // 行为相关状态
  const [editingBehaviorId, setEditingBehaviorId] = useState<string | null>(searchParams.get('behavior'));
  const [editingBehaviorScope, setEditingBehaviorScope] = useState<'form' | 'global'>('form');
  const [newBehaviorName, setNewBehaviorName] = useState('');
  const [newBehaviorEvent, setNewBehaviorEvent] = useState('onFieldChange');
  const [createBehaviorTarget, setCreateBehaviorTarget] = useState<{ scope: 'form' | 'global'; formId?: string } | null>(null);
  const [createBehaviorMode, setCreateBehaviorMode] = useState<'blank' | 'template'>('blank');
  const [behaviorDraft, setBehaviorDraft] = useState('');
  const [behaviorDirty, setBehaviorDirty] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [behaviorAuthoringMode, setBehaviorAuthoringMode] = useState<'script' | 'rules'>('script');
  const [qualityModal, setQualityModal] = useState<'overview' | 'tests' | 'publish' | null>(null);
  const [lastTestRunAt, setLastTestRunAt] = useState<string | null>(null);
  const [showMethodLibrary, setShowMethodLibrary] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState(METHOD_LIBRARY[0].id);
  const [methodParams, setMethodParams] = useState<Record<string, string>>(() => createMethodDefaults(METHOD_LIBRARY[0]));
  const [methodSampleResult, setMethodSampleResult] = useState<unknown>(null);
  const ruleSaveTimersRef = useRef(new Map<string, number>());
  const designHydratedRef = useRef(false);
  const structuredEditPendingRef = useRef(false);

  // 初始化：加载表单
  useEffect(() => {
    if (!project) return;
    if (project.forms?.length) {
      setForms(project.forms.map((form) => ({ ...form, ruleCode: form.ruleCode || '' })));
      if (!activeFormId) setActiveFormId(searchParams.get('form') || project.forms[0].id);
    } else if (project.designs?.length) {
      // 兼容旧格式：从 designs 迁移
      const now = new Date().toISOString();
      const migrated = project.designs.map((d) => ({
        id: `form_${d.id}`,
        name: d.name,
        design: d,
        behaviors: project.behaviors || [],
        ruleCode: '',
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
  const formDiagnostics = useMemo(
    () => diagnoseForm(designer.components, project?.srcTable || [], allWorkflows),
    [designer.components, project?.srcTable, allWorkflows],
  );
  const diagnosticSummary = useMemo(() => summarizeFormDiagnostics(formDiagnostics), [formDiagnostics]);
  const developmentQuality = useMemo(
    () => buildDevelopmentQuality(designer.components, project?.srcTable || [], allWorkflows),
    [designer.components, project?.srcTable, allWorkflows],
  );
  const unrepresentedColumns = useMemo(
    () => findUnrepresentedColumns(designer.components, project?.srcTable || []),
    [designer.components, project?.srcTable],
  );
  const missingFieldGroups = useMemo(() => {
    const groups = new Map<string, typeof unrepresentedColumns>();
    for (const item of unrepresentedColumns) {
      const key = `${item.tableId}\u0000${item.sheetName}`;
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    return [...groups.entries()].map(([key, items]) => ({ key, items, tableId: items[0].tableId, tableName: items[0].tableName, sheetName: items[0].sheetName }));
  }, [unrepresentedColumns]);
  const selectedMethod = useMemo(() => METHOD_LIBRARY.find((item) => item.id === selectedMethodId) || METHOD_LIBRARY[0], [selectedMethodId]);

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
      setBehaviorAuthoringMode('script');
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

  const handleDeleteForm = useCallback(async (id: string) => {
    const target = forms.find((form) => form.id === id);
    if (!await confirm({
      title: '删除表单',
      message: `确定删除“${target?.name || '未命名表单'}”？`,
      detail: '表单中的控件和规则也会一起删除，此操作无法撤销。',
      confirmLabel: '删除表单',
      destructive: true,
    })) return;
    setForms((prev) => prev.filter((f) => f.id !== id));
    if (activeFormId === id) setActiveFormId(forms.find((f) => f.id !== id)?.id || null);
    store.removeForm?.(id);
  }, [activeFormId, confirm, forms, store]);

  const beginFormRename = useCallback((form: FormEntry) => {
    setActiveFormId(form.id);
    setRenamingFormId(form.id);
    setFormNameDraft(form.name);
  }, []);

  const commitFormRename = useCallback((id: string, rawName: string) => {
    const form = forms.find((item) => item.id === id);
    const name = rawName.trim();
    setRenamingFormId(null);
    setFormNameDraft('');
    if (!form || !name || name === form.name) return;

    const now = new Date().toISOString();
    const design = { ...form.design, name, updatedAt: now };
    setSaveState('saving');
    setForms((current) => current.map((item) => item.id === id ? { ...item, name, design, updatedAt: now } : item));
    void Promise.resolve(store.updateForm?.(id, { name, design }))
      .then(() => setSaveState('saved'))
      .catch(() => {
        setForms((current) => current.map((item) => item.id === id ? form : item));
        setSaveState('error');
      });
  }, [forms, store]);

  const handleRuleCodeChange = useCallback((value: string) => {
    if (!activeFormId) return;
    const formId = activeFormId;
    setForms((current) => current.map((form) => form.id === formId ? { ...form, ruleCode: value, updatedAt: new Date().toISOString() } : form));
    const pending = ruleSaveTimersRef.current.get(formId);
    if (pending) window.clearTimeout(pending);
    const timer = window.setTimeout(() => {
      ruleSaveTimersRef.current.delete(formId);
      void store.updateForm?.(formId, { ruleCode: value });
    }, 500);
    ruleSaveTimersRef.current.set(formId, timer);
  }, [activeFormId, store]);

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

  const openBehaviorCreator = useCallback((target: { scope: 'form' | 'global'; formId?: string }) => {
    setNewBehaviorName('');
    setNewBehaviorEvent('onFieldChange');
    setCreateBehaviorMode('blank');
    setCreateBehaviorTarget(target);
  }, []);

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

  const handleDeleteBehavior = useCallback(async (id: string, scope: 'form' | 'global', targetFormId?: string) => {
    const target = scope === 'global'
      ? globalBehaviors.find((behavior) => behavior.id === id)
      : forms.find((form) => form.id === (targetFormId || activeFormId))?.behaviors.find((behavior) => behavior.id === id);
    if (!await confirm({
      title: '删除规则',
      message: `确定删除“${target?.name || '未命名规则'}”？`,
      detail: '删除后无法撤销。',
      confirmLabel: '删除规则',
      destructive: true,
    })) return;
    const formId = targetFormId || activeFormId;
    if (scope === 'form' && formId) {
      store.removeFormBehavior?.(formId, id);
      setForms((prev) => prev.map((f) => f.id === formId ? { ...f, behaviors: f.behaviors.filter((b) => b.id !== id) } : f));
    } else {
      store.removeGlobalBehavior?.(id);
    }
    if (editingBehaviorId === id) setEditingBehaviorId(null);
  }, [activeFormId, confirm, editingBehaviorId, forms, globalBehaviors, store]);

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

  const handleAddFromTemplate = useCallback((tpl: BehaviorTemplate, scope: 'form' | 'global', targetFormId?: string) => {
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
    const formId = targetFormId || activeFormId;
    if (scope === 'form' && formId) {
      setActiveFormId(formId);
      store.addFormBehavior?.(formId, bh);
      setForms((prev) => prev.map((f) => f.id === formId ? { ...f, behaviors: [...f.behaviors, bh] } : f));
    } else {
      store.addGlobalBehavior?.(bh);
    }
    setCreateBehaviorTarget(null);
    setCreateBehaviorMode('blank');
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
          {hasWorkbenchPanels && <button
            ref={panels.leftTriggerRef}
            type="button"
            className={`workbench-panel-toggle ${panels.leftOpen ? 'active' : ''}`}
            aria-label={panels.leftOpen ? '收起左侧栏' : '显示左侧栏'}
            aria-pressed={panels.leftOpen}
            onClick={panels.toggleLeft}
          ><DesignerIcon name={panels.leftOpen ? 'sidebarClose' : 'sidebarOpen'} /></button>}
          <div className="unified-mode-switch unified-mode-switch-main">
            <button type="button" className={`unified-mode-btn ${editMode === 'data' ? 'active' : ''}`} onClick={switchToData}>
              数据预览
            </button>
            <button type="button" className={`unified-mode-btn ${editMode === 'design' ? 'active' : ''}`} onClick={switchToDesign}>
              表单设计
            </button>
            <button type="button" className={`unified-mode-btn ${editMode === 'behavior' ? 'active' : ''}`} onClick={() => switchToBehavior()}>
              行为定义
            </button>
            <button type="button" className={`unified-mode-btn ${editMode === 'flow' ? 'active' : ''}`} onClick={switchToFlow}>
              流程编排
            </button>
            <button type="button" className={`unified-mode-btn ${editMode === 'settings' ? 'active' : ''}`} onClick={switchToSettings}>
              项目设置
            </button>
          </div>
        </div>
        <div className="unified-toolbar-secondary">
          <span className="unified-toolbar-optional">
            <button type="button" onClick={() => setShowMethodLibrary(true)} className="toolbar-btn">方法库</button>
            <button type="button" onClick={() => setQualityModal('overview')} className="toolbar-btn">开发总览</button>
            <button type="button" onClick={() => setQualityModal('tests')} className="toolbar-btn">测试 {developmentQuality.coverage}%</button>
            <button type="button" onClick={() => setQualityModal('publish')} className={`toolbar-btn ${developmentQuality.readyToPublish ? '' : 'warning'}`}>发布检查 {developmentQuality.blockers.length}</button>
          </span>
          <details className="unified-toolbar-overflow">
            <summary aria-label="更多工作台命令"><DesignerIcon name="more" /></summary>
            <div role="menu">
              <button type="button" role="menuitem" onClick={() => setShowMethodLibrary(true)}>方法库</button>
              <button type="button" role="menuitem" onClick={() => setQualityModal('overview')}>开发总览</button>
              <button type="button" role="menuitem" onClick={() => setQualityModal('tests')}>测试 {developmentQuality.coverage}%</button>
              <button type="button" role="menuitem" onClick={() => setQualityModal('publish')}>发布检查 {developmentQuality.blockers.length}</button>
            </div>
          </details>
          {hasWorkbenchPanels && <button
            ref={panels.rightTriggerRef}
            type="button"
            className={`workbench-panel-toggle ${panels.rightOpen ? 'active' : ''}`}
            aria-label={panels.rightOpen ? '收起属性栏' : '显示属性栏'}
            aria-pressed={panels.rightOpen}
            onClick={panels.toggleRight}
          ><DesignerIcon name={panels.rightOpen ? 'sidebarClose' : 'settings'} /></button>}
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
            <>
              <button type="button" onClick={() => setShowDiagnostics(true)} className="toolbar-btn">完成度 {diagnosticSummary.score}</button>
              <button type="button" onClick={handleSaveDesign} className="toolbar-btn">保存</button>
            </>
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
                当前表单：{activeForm?.name || '未选择'} · 全部行为 {globalBehaviors.length + forms.reduce((sum, form) => sum + form.behaviors.length + 1, 0)} 个
              </span>
            ) : (
              <>
                <AntdCompatSelect
                  className="toolbar-form-select"
                  value={activeFormId || ''}
                  onChange={(e) => setActiveFormId(e.target.value)}
                >
                  {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </AntdCompatSelect>
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
        {hasWorkbenchPanels && <div
          ref={panels.leftPanelRef}
          className={`unified-left ${panels.leftOpen ? 'is-open' : 'is-closed'} ${panels.leftIsDrawer ? 'is-drawer' : ''}`}
          aria-hidden={!panels.leftOpen}
        >
          {editMode === 'behavior' ? (
            <div className="unified-left-context-title">全部行为</div>
          ) : <div className="unified-left-tabs" role="tablist" aria-label="左侧工作区">
            <button data-panel-focus type="button" role="tab" aria-selected={leftPanelTab === 'controls'} className={`unified-left-tab ${leftPanelTab === 'controls' ? 'active' : ''}`} onClick={() => setLeftPanelTab('controls')}>控件</button>
            <button type="button" role="tab" aria-selected={leftPanelTab === 'fields'} className={`unified-left-tab ${leftPanelTab === 'fields' ? 'active' : ''}`} onClick={() => setLeftPanelTab('fields')}>数据字段</button>
            <button type="button" role="tab" aria-selected={leftPanelTab === 'forms'} className={`unified-left-tab ${leftPanelTab === 'forms' ? 'active' : ''}`} onClick={() => setLeftPanelTab('forms')}>表单</button>
            {panels.leftIsDrawer && <button type="button" className="unified-left-close" aria-label="关闭左侧栏" onClick={() => panels.closeDrawer()}><DesignerIcon name="sidebarClose" /></button>}
          </div>}

          <div className={`unified-left-body ${editMode === 'design' && (leftPanelTab === 'controls' || leftPanelTab === 'fields') ? 'toolbox-active' : ''}`}>
            {/* 控件工具箱（仅设计模式） */}
            {editMode !== 'behavior' && (leftPanelTab === 'controls' || leftPanelTab === 'fields') && (
              <div className="unified-toolbox-slot">
                {editMode === 'design' ? <Toolbox source={leftPanelTab === 'fields' ? 'fields' : 'controls'} showSourceTabs={false} onAddControl={designer.addComponentAtViewportCenter} /> : (
                  <div className="chain-component-list">
                    <div className="unified-panel-header"><span>当前表单控件</span></div>
                    {designer.components.map((component) => (
                      <button type="button" key={component.id} className={`chain-component-item ${designer.selectedId === component.id ? 'active' : ''}`} onClick={() => designer.setSelectedId(component.id)}>
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
                  <button type="button" onClick={handleCreateForm} className="unified-add-btn">+ 新建</button>
                </div>
                {forms.map((form) => (
                  <div
                    key={form.id}
                    className={`unified-list-item ${activeFormId === form.id ? 'active' : ''}`}
                    onClick={() => setActiveFormId(form.id)}
                  >
                    <span className="unified-list-icon">📋</span>
                    <div className="unified-list-info">
                      {renamingFormId === form.id ? (
                        <input
                          className="unified-list-name-input"
                          aria-label={`重命名表单 ${form.name}`}
                          value={formNameDraft}
                          autoFocus
                          onFocus={(event) => event.currentTarget.select()}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setFormNameDraft(event.target.value)}
                          onBlur={() => commitFormRename(form.id, formNameDraft)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              setRenamingFormId(null);
                              setFormNameDraft('');
                            }
                          }}
                        />
                      ) : (
                        <span className="unified-list-name" onDoubleClick={(event) => { event.stopPropagation(); beginFormRename(form); }}>{form.name}</span>
                      )}
                      <span className="unified-list-meta">{form.behaviors.length} 个行为</span>
                    </div>
                    <button
                      type="button"
                      className="unified-list-rename"
                      aria-label={`重命名 ${form.name}`}
                      title="重命名表单"
                      onClick={(event) => { event.stopPropagation(); beginFormRename(form); }}
                    >✎</button>
                    <button type="button" className="unified-list-delete" onClick={(e) => { e.stopPropagation(); handleDeleteForm(form.id); }}>×</button>
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
                  <button type="button" onClick={() => openBehaviorCreator({ scope: 'global' })} className="unified-add-btn">+ 新建</button>
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
                    <button type="button" className="unified-list-delete" onClick={(e) => { e.stopPropagation(); handleDeleteBehavior(bh.id, 'global'); }}>×</button>
                  </div>
                ))}

                <div className="unified-panel-divider" />

                {/* 所有表单行为；点击时自动切换只读表单上下文 */}
                {forms.map((form) => (
                  <React.Fragment key={form.id}>
                    <div className="unified-panel-header behavior-form-group">
                      <span>{form.name} ({form.behaviors.length + 1})</span>
                      <span className="behavior-form-actions">
                        <button type="button" onClick={() => openBehaviorCreator({ scope: 'form', formId: form.id })} className="unified-add-btn">+ 新建</button>
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`unified-list-item behavior-rule-code-item ${activeFormId === form.id && behaviorAuthoringMode === 'rules' ? 'active' : ''}`}
                      onClick={() => { setActiveFormId(form.id); setEditingBehaviorId(null); setBehaviorAuthoringMode('rules'); }}
                    >
                      <span className="unified-list-icon">⌘</span>
                      <span className="unified-list-info">
                        <span className="unified-list-name">规则代码</span>
                        <span className="unified-list-meta">规则语法 · {form.ruleCode.trim() ? '已编辑' : '空白'}</span>
                      </span>
                    </button>
                    {form.behaviors.map((bh) => (
                      <div
                        key={bh.id}
                        className={`unified-list-item ${editingBehaviorId === bh.id && editingBehaviorScope === 'form' ? 'active' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => { setActiveFormId(form.id); switchToBehavior(bh.id, 'form'); }}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveFormId(form.id); switchToBehavior(bh.id, 'form'); } }}
                      >
                        <span className="unified-list-icon">📝</span>
                        <div className="unified-list-info">
                          <span className="unified-list-name">{bh.name}</span>
                          <span className="unified-list-meta">{bh.event}</span>
                        </div>
                        <button type="button" className="unified-list-delete" aria-label={`删除规则 ${bh.name}`} onClick={(e) => { e.stopPropagation(); void handleDeleteBehavior(bh.id, 'form', form.id); }}>×</button>
                      </div>
                    ))}
                  </React.Fragment>
                ))}

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
                  <button type="button" key={wf.id} className={`unified-list-item ${searchParams.get('workflow') === wf.id ? 'active' : ''}`} onClick={() => {
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
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>}

        {/* 中间：行为模式保留只读可选择表单；流程模式使用纯流程画布 */}
        <div className="unified-center">
          {editMode === 'design' && <div className="chain-form-pane"><DesignCanvas designer={designer} formId={activeForm?.id} /></div>}
          {editMode === 'behavior' && <div className="chain-form-pane behavior-readonly-pane">
            <DesignCanvas designer={designer} formId={activeForm?.id} readOnly hideToolbar />
            {designer.mode === 'design' && <SelectedControlInfo
              component={designer.selectedId ? designer.components.find((component) => component.id === designer.selectedId) || null : null}
            />}
          </div>}
          {editMode === 'flow' && <div className="chain-flow-pane"><CanvasWithProvider /></div>}
          <div style={{ display: editMode === 'data' ? 'flex' : 'none', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}><DataPreviewPage /></div>
          <div style={{ display: editMode === 'settings' ? 'flex' : 'none', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}><SettingsPage /></div>
        </div>

        {/* 右侧：行为代码或属性配置 */}
        {hasWorkbenchPanels && <div
          ref={panels.rightPanelRef}
          className={`unified-right ${isBehaviorMode ? 'unified-right-expanded' : ''} ${panels.rightOpen ? 'is-open' : 'is-closed'} ${panels.rightIsDrawer ? 'is-drawer' : ''}`}
          aria-hidden={!panels.rightOpen}
        >
          {isBehaviorMode ? behaviorAuthoringMode === 'rules' ? (
            <BehaviorDslEditor
              projectId={project?.config.id || ''}
              value={activeForm?.ruleCode || ''}
              onChange={handleRuleCodeChange}
              fields={fieldDescriptors.map((field) => field.name)}
              components={designer.components}
              tables={project?.srcTable || []}
              workflows={allWorkflows}
              formId={activeForm?.id || 'unknown'}
              formName={activeForm?.name}
              onProposalApplied={(result) => {
                if (!activeForm) return;
                const updatedDesign = { ...activeForm.design, components: result.components, updatedAt: result.updatedAt };
                setForms((current) => current.map((form) => form.id === activeForm.id ? { ...form, ruleCode: result.ruleCode, design: updatedDesign, updatedAt: result.updatedAt } : form));
                designer.loadDesign(updatedDesign);
                void store.refreshProject?.();
              }}
              onApply={() => {
                if (!activeForm) return;
                const result = applyBehaviorDslToComponents(designer.components, activeForm.ruleCode || '');
                if (result.unapplied.length) {
                  const detail = result.unapplied.join('；');
                  announce(`有 ${result.unapplied.length} 条规则无法应用：${detail}`);
                  notification.error({ message: '部分规则无法应用', description: detail, duration: 0 });
                  return;
                }
                structuredEditPendingRef.current = true;
                designer.loadDesign({ ...activeForm.design, components: result.components, updatedAt: new Date().toISOString() });
              }}
            />
          ) : (
            // 行为模式：全屏行为编辑器
            editingBehavior ? (
              <div className="unified-behavior-editor">
                <div className="unified-behavior-header">
                  <div className="unified-behavior-title">
                    <span className="unified-behavior-scope">{editingBehavior.scope === 'global' ? '🌐' : '📝'}</span>
                    <span>{editingBehavior.behavior.name}</span>
                  </div>
                  <div className="unified-behavior-controls">
                    <button type="button" className="toolbar-btn" disabled={!behaviorDirty} onClick={applyBehaviorDraft}>应用更改</button>
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
                    }), createChainApiExtraLib(`inmemory://behavior-${editingBehavior.behavior.id}-chain.d.ts`)]}
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
              const target = designer.components.find((component) => component.id === id);
              const previousField = String(target?.fieldBinding || target?.props?.name || '');
              const nextField = typeof patch.name === 'string' ? patch.name.trim() : previousField;
              if (target && previousField && nextField && previousField !== nextField && activeForm) {
                const synchronized = renameFieldReferences(designer.components, allWorkflows, previousField, nextField);
                designer.loadDesign({ ...activeForm.design, components: synchronized.components, updatedAt: new Date().toISOString() });
                synchronized.workflows.forEach((workflow, index) => { if (workflow !== allWorkflows[index]) void store.updateWorkflow?.(workflow.id, { nodes: workflow.nodes, updatedAt: workflow.updatedAt }); });
                return;
              }
              designer.updateComponentProps(id, patch);
            }}
            onUpdateGeometry={(id, patch) => {
              structuredEditPendingRef.current = true;
              designer.updateComponentGeometry(id, patch);
            }}
            onRemove={designer.removeComponent}
            onClose={panels.rightIsDrawer ? () => panels.closeDrawer() : panels.toggleRight}
          />}
        </div>}
        {panels.activeDrawer && <button type="button" className="workbench-drawer-backdrop" aria-label="关闭侧栏" onClick={() => panels.closeDrawer()} />}
      </div>

      <Modal open={!!createBehaviorTarget} onClose={() => setCreateBehaviorTarget(null)} width="680px" maxWidth="92vw" maxHeight="82vh">
        <ModalHeader
          title={createBehaviorTarget?.scope === 'global' ? '新建全局行为' : `新建 ${forms.find((form) => form.id === createBehaviorTarget?.formId)?.name || '表单'} 行为`}
          onClose={() => setCreateBehaviorTarget(null)}
        />
        <div className="behavior-create-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={createBehaviorMode === 'blank'} className={createBehaviorMode === 'blank' ? 'active' : ''} onClick={() => setCreateBehaviorMode('blank')}>空白行为</button>
          <button type="button" role="tab" aria-selected={createBehaviorMode === 'template'} className={createBehaviorMode === 'template' ? 'active' : ''} onClick={() => setCreateBehaviorMode('template')}>从模板创建</button>
        </div>
        {createBehaviorMode === 'blank' ? <div className="behavior-create-form">
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
            <button type="button" className="toolbar-btn" onClick={() => setCreateBehaviorTarget(null)}>取消</button>
            <button type="button" className="toolbar-btn primary" disabled={!newBehaviorName.trim()} onClick={() => {
              if (createBehaviorTarget) handleAddBehavior(createBehaviorTarget.scope, createBehaviorTarget.formId);
            }}>创建并编辑</button>
          </div>
        </div> : <div className="template-modal-body behavior-create-template-list">
          {Object.entries(getTemplatesByCategory()).map(([category, templates]) => (
            <div key={category} className="template-category">
              <div className="template-category-header">{category}</div>
              {templates.map((tpl) => (
                <button key={tpl.id} type="button" className="template-item behavior-template-choice" onClick={() => {
                  if (createBehaviorTarget) handleAddFromTemplate(tpl, createBehaviorTarget.scope, createBehaviorTarget.formId);
                }}>
                  <div className="template-item-header">
                    <span className="template-item-name">{tpl.name}</span>
                    <span className="template-item-event">{tpl.event}</span>
                  </div>
                  <span className="template-item-desc">{tpl.description}</span>
                </button>
              ))}
            </div>
          ))}
        </div>}
      </Modal>

      <Modal open={showMethodLibrary} onClose={() => setShowMethodLibrary(false)} width="780px" maxWidth="94vw" maxHeight="84vh">
        <ModalHeader title="表单方法库" onClose={() => setShowMethodLibrary(false)} />
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 16, overflow: 'auto' }}>
          <div>{METHOD_LIBRARY.map((entry) => <button key={entry.id} type="button" className={`unified-list-item ${entry.id === selectedMethod.id ? 'active' : ''}`} style={{ width: '100%', marginBottom: 5, textAlign: 'left' }} onClick={() => { setSelectedMethodId(entry.id); setMethodParams(createMethodDefaults(entry)); setMethodSampleResult(null); }}><div className="unified-list-info"><strong>{entry.name}</strong><span className="unified-list-meta">{entry.description}</span></div></button>)}</div>
          <div>
            <h3 style={{ margin: '0 0 4px' }}>{selectedMethod.name}</h3><p style={{ color: 'var(--muted)', marginTop: 0 }}>{selectedMethod.description}</p>
            <div className="schema-fields">{selectedMethod.parameters.map((parameter) => <label key={parameter.name} className="prop-field"><span>{parameter.label}</span><input value={methodParams[parameter.name] || ''} placeholder={parameter.placeholder} onChange={(event) => { setMethodParams((current) => ({ ...current, [parameter.name]: event.target.value })); setMethodSampleResult(null); }} /></label>)}</div>
            <div className="project-wizard-summary-card" style={{ marginTop: 12 }}><strong>自然语言预览</strong><div className="project-wizard-summary-list"><p>{selectedMethod.preview(methodParams)}</p></div></div>
            <label style={{ display: 'block', marginTop: 12 }}><strong style={{ fontSize: 12 }}>生成代码</strong><pre style={{ padding: 10, background: 'var(--surface-subtle)', borderRadius: 6, whiteSpace: 'pre-wrap' }}>{selectedMethod.code(methodParams)}</pre></label>
            {methodSampleResult !== null && <label style={{ display: 'block', marginTop: 12 }}><strong style={{ fontSize: 12 }}>示例试运行结果</strong><pre style={{ padding: 10, background: 'var(--surface-subtle)', borderRadius: 6, whiteSpace: 'pre-wrap' }}>{JSON.stringify(methodSampleResult, null, 2)}</pre></label>}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="ui-btn" onClick={() => setMethodSampleResult(selectedMethod.sample(methodParams))}>示例数据试运行</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={!editingBehavior} onClick={() => { setBehaviorDraft((current) => `${current}${current.endsWith('\n') || !current ? '' : '\n'}${selectedMethod.code(methodParams)}\n`); setBehaviorDirty(true); setShowMethodLibrary(false); }}>插入当前行为</button>
          <button type="button" className="ui-btn" onClick={() => setShowMethodLibrary(false)}>关闭</button>
        </div>
      </Modal>

      <Modal open={!!qualityModal} onClose={() => setQualityModal(null)} width="760px" maxWidth="94vw" maxHeight="84vh">
        <ModalHeader title={qualityModal === 'tests' ? '自动测试样例' : qualityModal === 'publish' ? '发布门禁' : '开发任务总览'} onClose={() => setQualityModal(null)} />
        <div style={{ padding: 16, overflow: 'auto' }}>
          {qualityModal === 'overview' && <>
            <div className="project-wizard-summary-card" style={{ marginBottom: 12 }}><strong>{developmentQuality.tasks.filter((item) => item.ready).length}/{developmentQuality.tasks.length} 个开发任务已就绪</strong><div className="project-wizard-summary-list"><p>点击任务可直接进入对应工作区继续处理。</p></div></div>
            {developmentQuality.tasks.map((task) => <button key={task.id} type="button" className="unified-list-item" style={{ width: '100%', textAlign: 'left', marginBottom: 6 }} onClick={() => {
              setQualityModal(null);
              if (task.id === 'data') switchToData();
              else if (task.id === 'form') switchToDesign();
              else if (task.id === 'rules') switchToBehavior();
              else if (task.id === 'flows') switchToFlow();
              else setQualityModal('tests');
            }}><span className={`settings-kpi-chip ${task.ready ? 'success' : 'warning'}`}><strong>{task.ready ? '就绪' : '待处理'}</strong></span><div className="unified-list-info"><strong>{task.label}</strong><span className="unified-list-meta">{task.summary}</span></div></button>)}
          </>}
          {qualityModal === 'tests' && <>
            <div className="project-wizard-summary-card" style={{ marginBottom: 12 }}><strong>覆盖率 {developmentQuality.coverage}% · {developmentQuality.results.filter((item) => item.passed).length}/{developmentQuality.results.length} 通过</strong><div className="project-wizard-summary-list"><p>{lastTestRunAt ? `最近运行：${lastTestRunAt}` : '测试由当前字段规则自动生成，尚未手动运行。'}</p></div></div>
            {developmentQuality.results.map((result) => <div key={result.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line)' }}><span className={`settings-kpi-chip ${result.passed ? 'success' : 'error'}`}><strong>{result.passed ? '通过' : '失败'}</strong></span><div style={{ flex: 1 }}><strong style={{ display: 'block', fontSize: 12 }}>{result.name}</strong><span style={{ color: 'var(--muted)', fontSize: 11 }}>{result.category} · {result.focusFields.join('、') || '全表单'}{result.errors.length ? ` · ${result.errors.join('；')}` : ''}</span></div></div>)}
          </>}
          {qualityModal === 'publish' && <>
            <div className="project-wizard-summary-card" style={{ marginBottom: 12 }}><strong>{developmentQuality.readyToPublish ? '已通过发布门禁' : `还有 ${developmentQuality.blockers.length} 个阻断项`}</strong><div className="project-wizard-summary-list"><p>门禁统一检查字段、按钮、流程引用、主键和自动测试。</p></div></div>
            {developmentQuality.blockers.length === 0 ? <div className="unified-empty"><p>当前版本可以发布。</p></div> : developmentQuality.blockers.map((blocker, index) => <div key={`${index}:${blocker}`} className="property-editor-warning" style={{ marginBottom: 8 }}>{blocker}</div>)}
          </>}
        </div>
        <div className="modal-footer">
          {qualityModal === 'tests' && <button type="button" className="ui-btn ui-btn-primary" onClick={() => setLastTestRunAt(new Date().toLocaleString('zh-CN'))}>一键运行全部</button>}
          {qualityModal === 'publish' && !developmentQuality.readyToPublish && <button type="button" className="ui-btn" onClick={() => setQualityModal('overview')}>返回任务总览</button>}
          <button type="button" className="ui-btn" onClick={() => setQualityModal(null)}>关闭</button>
        </div>
      </Modal>

      <Modal open={showDiagnostics} onClose={() => setShowDiagnostics(false)} width="720px" maxWidth="92vw" maxHeight="82vh">
        <ModalHeader title={`表单完成度 · ${diagnosticSummary.score} 分`} onClose={() => setShowDiagnostics(false)} />
        <div style={{ padding: 16, overflow: 'auto' }}>
          <div className="project-wizard-summary-card" style={{ marginBottom: 14 }}>
            <strong>{diagnosticSummary.ready ? '可以进入测试' : '发布前仍需处理'}</strong>
            <div className="project-wizard-summary-list">
              <p>{diagnosticSummary.errors} 个错误 · {diagnosticSummary.warnings} 个警告 · {diagnosticSummary.info} 个建议</p>
              <p>{unrepresentedColumns.length ? `数据源中还有 ${unrepresentedColumns.length} 个字段没有出现在当前表单。` : '当前数据字段已全部覆盖或无需展示。'}</p>
            </div>
          </div>
          {formDiagnostics.length === 0 ? <div className="unified-empty"><p>未发现配置问题</p></div> : formDiagnostics.map((diagnostic) => (
            <div key={diagnostic.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <span className={`settings-kpi-chip ${diagnostic.severity}`}><strong>{diagnostic.severity === 'error' ? '错误' : diagnostic.severity === 'warning' ? '警告' : '建议'}</strong></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 13 }}>{diagnostic.title}</strong>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>{diagnostic.detail}</span>
              </div>
              {diagnostic.componentId && <button type="button" className="ui-btn ui-btn-xs" onClick={() => { designer.setSelectedId(diagnostic.componentId!); setShowDiagnostics(false); }}>定位</button>}
              {diagnostic.componentId && diagnostic.quickFix && <button type="button" className="ui-btn ui-btn-primary ui-btn-xs" onClick={() => {
                structuredEditPendingRef.current = true;
                designer.updateComponentProps(diagnostic.componentId!, diagnostic.quickFix!.props);
              }}>{diagnostic.quickFix.label}</button>}
            </div>
          ))}
          {unrepresentedColumns.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <strong style={{ fontSize: 13 }}>未展示的数据字段</strong>
              {missingFieldGroups.map((group) => <div key={group.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1 }}><strong style={{ display: 'block', fontSize: 12 }}>{group.tableName} / {group.sheetName}</strong><span style={{ color: 'var(--muted)', fontSize: 11 }}>{group.items.map((item) => item.column.name).join('、')}</span></div>
                <button type="button" className="ui-btn ui-btn-primary ui-btn-xs" onClick={() => {
                  const table = project?.srcTable.find((item) => item.id === group.tableId);
                  if (!table || !activeForm) return;
                  const additions = generateMissingFieldComponents(designer.components, table, group.sheetName);
                  if (!additions.length) return;
                  structuredEditPendingRef.current = true;
                  designer.loadDesign({ ...activeForm.design, components: [...designer.components, ...additions], updatedAt: new Date().toISOString() });
                }}>补齐 {group.items.length} 个字段</button>
              </div>)}
            </div>
          )}
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
