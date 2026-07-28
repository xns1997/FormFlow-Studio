import { useEffect, useState } from 'react';
import Modal, { ModalFooter, ModalHeader } from '../../components/Modal';
import type { EventFieldDescriptor } from '../../components/codeEditorSuggestions';
import type { DesignComponent, FormLinkageRule, SrcTableEntry, WorkflowFile } from '../../project/types';
import type { EventDef } from '../types';
import type { FormFlowTriggerConfig } from '../../services/engine/formFlowTrigger';
import { parseParameterMapToDraftRows, type FlowTriggerEditorMode } from '../../services/engine/flowTriggerEditor';
import { getControlSnippetExamples } from '../../services/display/controlSnippets';
import { EventScriptEditorSection } from './EventScriptEditor';
import { FlowTriggerEditor, type FlowTriggerEditorValidation } from './FlowTriggerEditor';
import { LinkageRulesEditor } from './LinkageRulesEditor';
import { getDefaultEventCode } from './utils';
import { useAppInteraction } from '../../components/AppInteractionProvider';
import { useProjectStore } from '../../project/store';
import { ensureWorkflowIo } from '../../services/engine/workflowIo';

function clone<T>(value: T): T { return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T; }
function same(left: unknown, right: unknown) { return JSON.stringify(left) === JSON.stringify(right); }

interface Props {
  component: DesignComponent;
  components: DesignComponent[];
  events: EventDef[];
  controlLabel: string;
  fields: string[];
  fieldDescriptors: EventFieldDescriptor[];
  workflows: WorkflowFile[];
  tables: SrcTableEntry[];
  projectId: string;
  onUpdate: (patch: Record<string, unknown>) => void;
  onEditWorkflowContract?: (request: { workflowId: string; nodeId: string; eventName: string; sessionId: string }) => void;
  onFinishWorkflowContractSession?: (sessionId: string) => void;
}

type EventBindingSession = {
  projectId: string;
  componentId: string;
  eventKey: string;
  tab: 'rules' | 'flow' | 'script';
  rules: FormLinkageRule[];
  trigger?: FormFlowTriggerConfig;
  code: string;
  flowMode: FlowTriggerEditorMode;
};

export function PropertyEventsSection({ component, components, events, controlLabel, fields, fieldDescriptors, workflows, tables, projectId, onUpdate, onEditWorkflowContract, onFinishWorkflowContractSession }: Props) {
  const { confirm, announce } = useAppInteraction();
  const updateWorkflow = useProjectStore((state) => state.updateWorkflow);
  const [activeEvent, setActiveEvent] = useState<EventDef | null>(null);
  const [tab, setTab] = useState<'rules' | 'flow' | 'script'>('rules');
  const [rules, setRules] = useState<FormLinkageRule[]>([]);
  const [trigger, setTrigger] = useState<FormFlowTriggerConfig | undefined>();
  const [code, setCode] = useState('');
  const [flowMode, setFlowMode] = useState<FlowTriggerEditorMode>('ui');
  const [flowValidation, setFlowValidation] = useState<FlowTriggerEditorValidation>({ hardErrors: [], risks: [] });
  const [bindingSessionId, setBindingSessionId] = useState('');
  const savedEvents = (component.props.events || {}) as Record<string, string>;
  const savedTriggers = (component.props.flowTriggers || {}) as Record<string, FormFlowTriggerConfig>;
  const savedRuleMap = (component.props.linkageRules || {}) as Record<string, FormLinkageRule[]>;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('bindingSession');
    const eventKey = params.get('event');
    if (!sessionId || !eventKey || activeEvent) return;
    try {
      const raw = sessionStorage.getItem(`formflow:binding:${sessionId}`);
      if (!raw) return;
      const session = JSON.parse(raw) as EventBindingSession;
      if (session.projectId !== projectId || session.componentId !== component.id || session.eventKey !== eventKey) return;
      const event = events.find((item) => item.key === eventKey);
      if (!event) return;
      setActiveEvent(event);
      setTab(session.tab);
      setRules(session.rules);
      setTrigger(session.trigger);
      setCode(session.code);
      setFlowMode(session.flowMode);
      setBindingSessionId(sessionId);
      announce(`已返回“${event.label}”流程绑定，草稿保持未应用状态`);
    } catch {
      sessionStorage.removeItem(`formflow:binding:${sessionId}`);
    }
  }, [activeEvent, component.id, events, projectId, announce]);

  const launch = (event: EventDef) => {
    const nextTrigger = clone(savedTriggers[event.key]);
    setActiveEvent(event); setTab('rules'); setRules(clone(savedRuleMap[event.key] || [])); setTrigger(nextTrigger);
    setCode(String(savedEvents[event.key] || getDefaultEventCode(event.key, component.props.name || component.type)));
    setFlowMode(parseParameterMapToDraftRows(nextTrigger?.parameterMap, workflows.find((item) => item.id === nextTrigger?.workflowId)).unsupportedEntries.length ? 'code' : 'ui');
    setFlowValidation({ hardErrors: [], risks: [] });
    setBindingSessionId('');
  };
  const defaultCode = activeEvent ? getDefaultEventCode(activeEvent.key, component.props.name || component.type) : '';
  const dirty = !!activeEvent && (!same(rules, savedRuleMap[activeEvent.key] || []) || !same(trigger, savedTriggers[activeEvent.key]) || code !== String(savedEvents[activeEvent.key] || defaultCode));
  const requestClose = async () => {
    if (!dirty || await confirm({ title: '放弃事件配置？', message: '当前事件配置尚未应用。', detail: '关闭后，本次修改将丢失。', confirmLabel: '放弃修改', destructive: true })) {
      if (bindingSessionId) {
        sessionStorage.removeItem(`formflow:binding:${bindingSessionId}`);
        onFinishWorkflowContractSession?.(bindingSessionId);
      }
      setActiveEvent(null);
    }
  };
  const resetDraft = () => { setRules([]); setTrigger(undefined); setCode(defaultCode); setFlowMode('ui'); };
  const apply = async () => {
    if (!activeEvent) return;
    if (flowValidation.hardErrors.length > 0) {
      announce(`无法应用配置：${flowValidation.hardErrors[0]}`);
      setTab('flow');
      return;
    }
    if (flowValidation.risks.length > 0 && !await confirm({
      title: '配置仍有运行风险',
      message: `流程输入、输出回写和覆盖影响中共有 ${flowValidation.risks.length} 项风险。`,
      detail: flowValidation.risks.slice(0, 4).join('；'),
      confirmLabel: '仍然应用',
    })) return;
    const linkageRules = { ...savedRuleMap }; const flowTriggers = { ...savedTriggers }; const nextEvents = { ...savedEvents };
    if (rules.length) linkageRules[activeEvent.key] = rules; else delete linkageRules[activeEvent.key];
    if (trigger) flowTriggers[activeEvent.key] = trigger; else delete flowTriggers[activeEvent.key];
    if (code && code !== defaultCode) nextEvents[activeEvent.key] = code; else delete nextEvents[activeEvent.key];
    if (trigger?.bindings?.version === 2) {
      const workflow = workflows.find((item) => item.id === trigger.workflowId);
      if (workflow) {
        const normalized = ensureWorkflowIo(workflow, { persistFieldIds: true });
        if (normalized.changed) await updateWorkflow(workflow.id, { nodes: normalized.workflow.nodes, edges: normalized.workflow.edges });
      }
    }
    onUpdate({
      linkageRules,
      flowTriggers,
      events: nextEvents,
    });
    if (bindingSessionId) {
      sessionStorage.removeItem(`formflow:binding:${bindingSessionId}`);
      onFinishWorkflowContractSession?.(bindingSessionId);
    }
    announce(`已应用“${activeEvent.label}”配置`);
    setActiveEvent(null);
  };
  const eventConfigured = (event: EventDef) => !!savedEvents[event.key] || !!savedTriggers[event.key] || (savedRuleMap[event.key] || []).length > 0;
  const impactFields = [...new Set(rules.flatMap((rule) => rule.actions.map((action) => action.targetField).filter(Boolean) as string[]))];
  const impactComponents = [...new Set(rules.flatMap((rule) => rule.actions.map((action) => action.targetComponentId).filter(Boolean) as string[]))];
  const controlSnippets = activeEvent ? getControlSnippetExamples({ components, currentField: String(component.fieldBinding || component.props.name || component.type), eventName: activeEvent.key }) : [];

  return <div className="properties-group properties-events property-event-summaries" id="property-task-events">
    <h4>交互与事件 <span>{events.length}</span></h4>
    {events.map((event) => <button key={event.key} type="button" className="property-event-summary" onClick={() => launch(event)}>
      <span><b>{event.label}</b><code>{event.key}</code></span><em className={eventConfigured(event) ? 'configured' : ''}>{eventConfigured(event) ? '已修改' : '使用默认'}</em><strong>配置</strong>
    </button>)}
    {activeEvent && <Modal open onClose={requestClose} width="min(980px, 95vw)" maxWidth="95vw" maxHeight="90vh" containerClassName="property-event-modal">
      <ModalHeader title={`${activeEvent.label}配置`} onClose={requestClose} />
      <div className="modal-body property-event-modal-body">
        <div className="property-event-tabs" role="tablist">
          {([['rules', '联动规则'], ['flow', '流程绑定'], ['script', '脚本']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}
        </div>
        <div className="property-impact-summary"><span>将更新 <b>{activeEvent.label}</b></span><span>{rules.length} 条联动</span><span>{trigger?.workflowId ? '1 个流程' : '未绑定流程'}</span><span>{impactFields.length + impactComponents.length} 个影响对象</span></div>
        {tab === 'rules' && <LinkageRulesEditor eventName={activeEvent.key} fieldName={String(component.fieldBinding || component.props.name || component.type)} rules={rules} fields={fields} components={components} workflows={workflows} onChange={setRules} />}
        {tab === 'flow' && <FlowTriggerEditor
          value={trigger}
          workflows={workflows}
          component={component}
          components={components}
          eventName={activeEvent.key}
          mode={flowMode}
          onModeChange={setFlowMode}
          onChange={setTrigger}
          onValidationChange={setFlowValidation}
          onEditWorkflowContract={onEditWorkflowContract ? (workflowId, nodeId) => {
            const sessionId = `binding_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            const session: EventBindingSession = {
              projectId,
              componentId: component.id,
              eventKey: activeEvent.key,
              tab: 'flow',
              rules,
              trigger,
              code,
              flowMode,
            };
            sessionStorage.setItem(`formflow:binding:${sessionId}`, JSON.stringify(session));
            setBindingSessionId(sessionId);
            onEditWorkflowContract({ workflowId, nodeId, eventName: activeEvent.key, sessionId });
          } : undefined}
        />}
        {tab === 'script' && <EventScriptEditorSection component={component} evt={activeEvent} controlLabel={controlLabel} eventCode={code} fieldDescriptors={fieldDescriptors} workflows={workflows} components={components} tables={tables} projectId={projectId} controlSnippets={controlSnippets} impactFields={impactFields} impactComponents={impactComponents} onChange={setCode} />}
      </div>
      <ModalFooter><button type="button" className="toolbar-btn" onClick={resetDraft}>恢复默认</button><span className="modal-footer-spacer" /><button type="button" className="toolbar-btn" onClick={requestClose}>取消</button><button type="button" className="toolbar-btn primary" onClick={() => void apply()}>应用配置</button></ModalFooter>
    </Modal>}
  </div>;
}
