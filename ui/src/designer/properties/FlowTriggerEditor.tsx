import React, { useEffect, useMemo, useState } from 'react';
import { parseJson, parseJsonOrNull } from '../../services/engine/safeJson';
import type { ComponentNode } from '../../models';
import type { DesignComponent, WorkflowFile } from '../../project/types';
import {
  getWorkflowExportFields,
  getWorkflowImportFields,
  getWorkflowImportNode,
  getWorkflowExportNode,
} from '../../services/engine/workflowIo';
import {
  describeFlowValueSource,
  getFlowBindingRisks,
  getFlowComponentField,
  normalizeFlowBindings,
  prepareV2FlowOutputWrites,
  resolveV2FlowInputs,
  type FlowBindingsV2,
  type FlowEventValue,
  type FlowInputBinding,
  type FlowOutputBinding,
  type FlowOutputPresetStep,
  type FlowValueSource,
} from '../../services/engine/formFlowBindings';
import type { FormFlowTriggerConfig } from '../../services/engine/formFlowTrigger';
import type { FlowTriggerEditorMode } from '../../services/engine/flowTriggerEditor';
import {
  AntdSelectInput,
  AntdSwitchInput,
  AntdTextAreaInput,
  AntdTextInput,
} from '../../components/AntdFormControls';
import CodeEditor from '../../components/CodeEditor';
import { useAppInteraction } from '../../components/AppInteractionProvider';

type MappingTab = 'inputs' | 'outputs';

export interface FlowTriggerEditorValidation {
  hardErrors: string[];
  risks: string[];
}

interface Props {
  value: FormFlowTriggerConfig | undefined;
  workflows: WorkflowFile[];
  component: DesignComponent;
  components: DesignComponent[];
  eventName: string;
  mode: FlowTriggerEditorMode;
  onModeChange: (mode: FlowTriggerEditorMode) => void;
  onChange: (value: FormFlowTriggerConfig) => void;
  onValidationChange?: (validation: FlowTriggerEditorValidation) => void;
  onEditWorkflowContract?: (workflowId: string, nodeId: string, direction: MappingTab) => void;
}

const EVENT_OPTIONS = [
  ['value', '当前事件值'],
  ['field', '当前字段名'],
  ['eventName', '事件名称'],
  ['formData', '完整表单数据'],
  ['originalValues', '原始表单数据'],
  ['previousValue', '变更前的值'],
  ['detail', '事件详情'],
  ['timestamp', '事件时间'],
  ['dirty', '是否已修改'],
  ['changedFields', '已修改字段'],
  ['component', '当前控件'],
] as const;

const PRESET_OPTIONS: Array<{ value: FlowOutputPresetStep['op']; label: string }> = [
  { value: 'toString', label: '转为文本' },
  { value: 'toNumber', label: '转为数字' },
  { value: 'toBoolean', label: '转为布尔值' },
  { value: 'trim', label: '去除首尾空白' },
  { value: 'formatDate', label: '格式化日期' },
  { value: 'defaultIfEmpty', label: '空值使用默认值' },
  { value: 'skipIfEmpty', label: '空值不回写' },
  { value: 'clearIfEmpty', label: '空值清空字段' },
];

function sourceMode(source: FlowValueSource | undefined) {
  if (!source) return 'unmapped';
  if (source.kind === 'event') return `event:${source.value}`;
  return source.kind;
}

function parseLiteral(text: string) {
  try { return JSON.parse(text); } catch { return text; }
}

function cloneBindings(bindings: FlowBindingsV2): FlowBindingsV2 {
  try { return JSON.parse(JSON.stringify(bindings)) as FlowBindingsV2; } catch { return { version: 2, inputs: {}, outputs: {} }; }
}

function fieldOptions(components: DesignComponent[]) {
  return components
    .map((component) => ({
      component,
      field: getFlowComponentField(component),
    }))
    .filter((entry) => entry.field)
    .map((entry) => ({
      label: String(entry.component.props.label || entry.field),
      value: entry.component.id,
      field: entry.field,
    }));
}

function remapBindings(
  current: FlowBindingsV2,
  from: WorkflowFile | undefined,
  to: WorkflowFile,
  components: DesignComponent[],
) {
  const defaults = normalizeFlowBindings(undefined, to, components).bindings;
  if (!from) return { bindings: defaults, retained: 0, automatic: Object.keys(defaults.inputs).length + Object.keys(defaults.outputs).length, removed: 0 };
  const fromInputs = getWorkflowImportFields(from);
  const fromOutputs = getWorkflowExportFields(from);
  const nextInputs = getWorkflowImportFields(to);
  const nextOutputs = getWorkflowExportFields(to);
  let retained = 0;
  for (const next of nextInputs) {
    const previous = fromInputs.find((field) => field.name === next.name);
    if (previous && current.inputs[previous.id]) {
      defaults.inputs[next.id] = current.inputs[previous.id];
      retained += 1;
    }
  }
  for (const next of nextOutputs) {
    const previous = fromOutputs.find((field) => field.name === next.name);
    if (previous && current.outputs[previous.id]) {
      defaults.outputs[next.id] = current.outputs[previous.id];
      retained += 1;
    }
  }
  const configuredCount = Object.keys(current.inputs).length + Object.keys(current.outputs).length;
  return {
    bindings: defaults,
    retained,
    automatic: Object.keys(defaults.inputs).length + Object.keys(defaults.outputs).length - retained,
    removed: Math.max(0, configuredCount - retained),
  };
}

export function FlowTriggerEditor({
  value,
  workflows,
  component,
  components,
  eventName,
  mode,
  onModeChange,
  onChange,
  onValidationChange,
  onEditWorkflowContract,
}: Props) {
  const { confirm, announce } = useAppInteraction();
  const enabled = Boolean(value?.enabled);
  const workflow = workflows.find((item) => item.id === value?.workflowId) || workflows[0];
  const normalized = useMemo(
    () => normalizeFlowBindings(value, workflow, components),
    [value, workflow, components],
  );
  const bindings = normalized.bindings;
  const imports = useMemo(() => getWorkflowImportFields(workflow), [workflow]);
  const exports = useMemo(() => getWorkflowExportFields(workflow), [workflow]);
  const fields = useMemo(() => fieldOptions(components), [components]);
  const risks = useMemo(
    () => getFlowBindingRisks(bindings, workflow, components),
    [bindings, workflow, components],
  );
  const hardErrors = risks.filter((risk) => risk.severity === 'error').map((risk) => risk.message);
  const warningMessages = risks.filter((risk) => risk.severity === 'warning').map((risk) => risk.message);
  const [tab, setTab] = useState<MappingTab>('inputs');
  const [advancedText, setAdvancedText] = useState(() => JSON.stringify(bindings, null, 2));
  const [advancedError, setAdvancedError] = useState('');
  const [migrationSummary, setMigrationSummary] = useState('');
  const [sampleOutputs, setSampleOutputs] = useState('{}');
  const [trialResult, setTrialResult] = useState('');

  useEffect(() => {
    setAdvancedText(JSON.stringify(bindings, null, 2));
    setAdvancedError('');
  }, [value?.workflowId, value?.bindings, value?.parameterMap]);

  useEffect(() => {
    onValidationChange?.({
      hardErrors: [...hardErrors, ...(advancedError ? [advancedError] : [])],
      risks: warningMessages,
    });
  }, [advancedError, hardErrors.join('\n'), warningMessages.join('\n'), onValidationChange]);

  const emit = (next: FlowBindingsV2, extra: Partial<FormFlowTriggerConfig> = {}) => {
    onChange({
      enabled: true,
      workflowId: workflow?.id || '',
      bindings: next,
      ...extra,
    });
  };

  const toggle = (nextEnabled: boolean) => {
    const selected = workflow || workflows[0];
    const nextBindings = normalizeFlowBindings(value, selected, components).bindings;
    onChange({
      enabled: nextEnabled,
      workflowId: selected?.id || '',
      bindings: nextBindings,
    });
  };

  const selectWorkflow = async (workflowId: string) => {
    const selected = workflows.find((item) => item.id === workflowId);
    if (!selected) return;
    const result = remapBindings(bindings, workflow, selected, components);
    if (result.removed > 0) {
      const accepted = await confirm({
        title: '切换流程并迁移映射？',
        message: `将保留 ${result.retained} 项、自动映射 ${result.automatic} 项、移除 ${result.removed} 项。`,
        detail: '被移除的映射在新流程中没有同名契约字段。取消后当前草稿保持不变。',
        confirmLabel: '确认切换',
        destructive: true,
      });
      if (!accepted) return;
    }
    setMigrationSummary(`已迁移：保留 ${result.retained} 项 · 自动映射 ${result.automatic} 项 · 待处理 ${Math.max(0, getWorkflowImportFields(selected).length - Object.keys(result.bindings.inputs).length)} 项 · 移除 ${result.removed} 项`);
    onChange({ enabled: true, workflowId, bindings: result.bindings });
    announce(`已切换流程，保留 ${result.retained} 项映射，移除 ${result.removed} 项`);
  };

  const updateInput = (fieldId: string, binding: FlowInputBinding | undefined) => {
    const next = cloneBindings(bindings);
    if (binding) next.inputs[fieldId] = binding; else delete next.inputs[fieldId];
    emit(next);
  };

  const updateOutput = (fieldId: string, binding: FlowOutputBinding | undefined) => {
    const next = cloneBindings(bindings);
    if (binding) next.outputs[fieldId] = binding; else delete next.outputs[fieldId];
    emit(next);
  };

  const runTrial = () => {
    if (!workflow) return;
    try {
      const sampleValues = Object.fromEntries(components.map((item) => [
        getFlowComponentField(item),
        item.props.value ?? item.props.defaultValue,
      ]));
      const context = {
        eventName,
        field: getFlowComponentField(component),
        value: component.props.value ?? component.props.defaultValue,
        values: sampleValues,
        originalValues: sampleValues,
        detail: {},
        component: {
          id: component.id,
          type: component.type,
          name: getFlowComponentField(component),
          label: String(component.props.label || getFlowComponentField(component)),
          fieldBinding: component.fieldBinding,
          props: component.props,
          layout: { row: 0, col: 0, colSpan: 1, rowSpan: 1 },
          ports: [],
          events: [],
        } as ComponentNode,
      };
      const inputs = resolveV2FlowInputs(bindings, workflow, context);
      let outputs: Record<string, unknown> = {};
      try { outputs = JSON.parse(sampleOutputs || '{}') as Record<string, unknown>; } catch { /* malformed */ }
      const prepared = prepareV2FlowOutputWrites(bindings, workflow, outputs, context, components);
      setTrialResult(JSON.stringify({
        note: '仅试算映射，不执行流程节点',
        inputs,
        writes: prepared.writes.map((write) => ({ field: write.field, value: write.value })),
        skipped: prepared.skipped,
      }, null, 2));
    } catch (error) {
      setTrialResult(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    }
  };

  const mappedInputCount = imports.filter((field) => bindings.inputs[field.id]).length;
  const mappedOutputCount = exports.filter((field) => bindings.outputs[field.id]).length;
  const inputNode = workflow ? getWorkflowImportNode(workflow) : null;
  const outputNode = workflow ? getWorkflowExportNode(workflow) : null;

  const renderInputValue = (fieldId: string, binding: FlowInputBinding | undefined) => {
    const source = binding?.source;
    if (!source) return null;
    if (source.kind === 'formField') {
      return <AntdSelectInput
        value={source.componentId}
        options={[{ label: '选择表单字段', value: '' }, ...fields]}
        onChange={(componentId) => {
          const selected = fields.find((item) => item.value === componentId);
          if (selected) updateInput(fieldId, { source: { kind: 'formField', componentId: selected.value, field: selected.field } });
        }}
      />;
    }
    if (source.kind === 'path') {
      return <AntdTextInput value={source.path} placeholder="例如 address.city" onChange={(path) => updateInput(fieldId, { source: { ...source, path } })} />;
    }
    if (source.kind === 'literal') {
      return <AntdTextInput value={typeof source.value === 'string' ? source.value : JSON.stringify(source.value)} placeholder="JSON 或文本" onChange={(text) => updateInput(fieldId, { source: { kind: 'literal', value: parseLiteral(text) } })} />;
    }
    if (source.kind === 'expression') {
      return <AntdTextInput value={source.expression} placeholder="$event.value" onChange={(expression) => updateInput(fieldId, { source: { kind: 'expression', expression } })} />;
    }
    if (source.kind === 'object') return <span className="flow-binding-readonly-value">{describeFlowValueSource(source)}，请在高级 JSON 中编辑</span>;
    return <span className="flow-binding-readonly-value">{describeFlowValueSource(source)}</span>;
  };

  const renderOutputTransform = (fieldId: string, binding: FlowOutputBinding) => {
    const transform = binding.transform;
    return <>
      <AntdSelectInput
        value={transform.kind}
        options={[
          { label: '直接映射', value: 'direct' },
          { label: '常用转换', value: 'preset' },
          { label: '完整表达式', value: 'expression' },
        ]}
        onChange={(kind) => updateOutput(fieldId, {
          ...binding,
          transform: kind === 'preset'
            ? { kind: 'preset', steps: [{ op: 'toString' }] }
            : kind === 'expression'
              ? { kind: 'expression', expression: '$flow.output' }
              : { kind: 'direct' },
        })}
      />
      {transform.kind === 'preset' && <div className="flow-binding-transform-extra">
        <AntdSelectInput
          value={transform.steps[0]?.op || 'toString'}
          options={PRESET_OPTIONS}
          onChange={(op) => updateOutput(fieldId, { ...binding, transform: { kind: 'preset', steps: [{ ...transform.steps[0], op: op as FlowOutputPresetStep['op'] }] } })}
        />
        {transform.steps[0]?.op === 'formatDate' && <AntdTextInput value={transform.steps[0].format || 'YYYY-MM-DD'} placeholder="YYYY-MM-DD" onChange={(format) => updateOutput(fieldId, { ...binding, transform: { kind: 'preset', steps: [{ ...transform.steps[0], format }] } })} />}
        {transform.steps[0]?.op === 'defaultIfEmpty' && <AntdTextInput value={String(transform.steps[0].value ?? '')} placeholder="默认值" onChange={(text) => updateOutput(fieldId, { ...binding, transform: { kind: 'preset', steps: [{ ...transform.steps[0], value: parseLiteral(text) }] } })} />}
      </div>}
      {transform.kind === 'expression' && <AntdTextInput value={transform.expression} placeholder="$flow.output" onChange={(expression) => updateOutput(fieldId, { ...binding, transform: { kind: 'expression', expression } })} />}
    </>;
  };

  return <div className={`flow-binding-editor ${enabled ? 'enabled' : ''}`}>
    <div className="flow-binding-header">
      <label className="prop-flow-trigger-toggle">
        <AntdSwitchInput checked={enabled} onChange={toggle} />
        <span>触发流程</span>
      </label>
      {enabled && <div className="flow-binding-mode" role="group" aria-label="映射编辑方式">
        <button type="button" className={mode === 'ui' ? 'active' : ''} onClick={() => onModeChange('ui')}>可视化</button>
        <button type="button" className={mode === 'code' ? 'active' : ''} onClick={() => onModeChange('code')}>高级 JSON</button>
      </div>}
    </div>

    {enabled && workflows.length === 0 && <div className="flow-binding-empty" role="status">尚未创建流程。请先在流程编排中创建并保存流程。</div>}

    {enabled && workflow && <>
      <label className="prop-field flow-binding-workflow-select">
        <span>目标流程</span>
        <AntdSelectInput value={workflow.id} options={workflows.map((item) => ({ label: item.name, value: item.id }))} onChange={(next) => void selectWorkflow(String(next))} />
      </label>

      <section className="flow-binding-overview" aria-label="流程绑定风险总览">
        <div className="flow-binding-overview-title">
          <strong>配置结果</strong>
          <span className={risks.length ? 'has-risk' : 'complete'}>{risks.length ? `⚠ ${risks.length} 项风险` : '✓ 可运行'}</span>
        </div>
        <div className="flow-binding-metrics">
          <span>输入 <b>{mappedInputCount}/{imports.length}</b></span>
          <span>输出 <b>{mappedOutputCount}/{exports.length}</b></span>
          <span>自动映射 <b>{normalized.autoMappedInputs + normalized.autoMappedOutputs}</b></span>
        </div>
        {normalized.migratedLegacy && <p className="flow-binding-notice">ℹ 当前为旧配置预览；点击外层“应用配置”后才会写入 V2 Schema。</p>}
        {migrationSummary && <p className="flow-binding-notice" role="status">{migrationSummary}</p>}
        {risks.length > 0 && <ul className="flow-binding-risk-list">
          {risks.slice(0, 6).map((risk, index) => <li key={`${risk.kind}-${index}`} className={risk.severity}>{risk.severity === 'error' ? '错误：' : '注意：'}{risk.message}</li>)}
          {risks.length > 6 && <li>另有 {risks.length - 6} 项，请在对应页签查看。</li>}
        </ul>}
      </section>

      {mode === 'code' ? <section className="flow-binding-code">
        <CodeEditor
          value={advancedText}
          onChange={(text) => {
            setAdvancedText(text);
            try {
              const parsed = parseJson<FlowBindingsV2>(text, null as any);
              if (!parsed || parsed?.version !== 2 || !parsed.inputs || !parsed.outputs) throw new Error('必须是包含 version: 2、inputs 和 outputs 的对象');
              setAdvancedError('');
              emit(parsed);
            } catch (error) {
              setAdvancedError(error instanceof Error ? error.message : 'JSON 格式无效');
            }
          }}
          language="json"
          theme="light"
          height={360}
          minHeight={260}
          lineNumbers
          compact
          title="流程双向绑定 Schema"
          options={{ folding: true, lineNumbersMinChars: 2, scrollbar: { vertical: 'auto', horizontal: 'auto' } }}
        />
        {advancedError && <div className="prop-flow-trigger-status error" role="alert">{advancedError}</div>}
      </section> : <>
        <div className="flow-binding-tabs" role="tablist" aria-label="流程映射方向">
          <button type="button" role="tab" aria-selected={tab === 'inputs'} className={tab === 'inputs' ? 'active' : ''} onClick={() => setTab('inputs')}>流程输入 <span>{mappedInputCount}/{imports.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === 'outputs'} className={tab === 'outputs' ? 'active' : ''} onClick={() => setTab('outputs')}>流程输出 <span>{mappedOutputCount}/{exports.length}</span></button>
        </div>

        {tab === 'inputs' && <section className="flow-binding-panel" role="tabpanel" aria-label="流程输入映射">
          <div className="flow-binding-panel-head">
            <div><strong>流程输入 ← 表单与事件</strong><p>未映射项会按契约默认值或 undefined 运行；缺失必填值时流程不会启动。</p></div>
            {inputNode && <button type="button" onClick={() => onEditWorkflowContract?.(workflow.id, inputNode.id, 'inputs')}>编辑流程输入</button>}
          </div>
          {imports.map((field) => {
            const binding = bindings.inputs[field.id];
            return <div key={field.id} className={`flow-binding-row ${binding ? 'configured' : 'pending'}`}>
              <div className="flow-binding-target">
                <strong>{field.label || field.name}{field.required ? ' *' : ''}</strong>
                <small>{field.name} · {field.type}{Object.prototype.hasOwnProperty.call(field, 'defaultValue') ? ` · 默认 ${JSON.stringify(field.defaultValue)}` : ''}</small>
              </div>
              <span className="flow-binding-arrow" aria-hidden="true">←</span>
              <div className="flow-binding-source">
                <AntdSelectInput
                  value={sourceMode(binding?.source)}
                  options={[
                    { label: '未映射', value: 'unmapped' },
                    ...EVENT_OPTIONS.map(([value, label]) => ({ label, value: `event:${value}` })),
                    { label: '表单字段', value: 'formField' },
                    { label: '表单路径', value: 'path:form' },
                    { label: '原始数据路径', value: 'path:original' },
                    { label: '事件详情路径', value: 'path:detail' },
                    { label: '上下文路径', value: 'path:context' },
                    { label: '固定值', value: 'literal' },
                    { label: '表达式', value: 'expression' },
                    ...(binding?.source.kind === 'object' ? [{ label: '对象映射（高级）', value: 'object' }] : []),
                  ]}
                  onChange={(nextMode) => {
                    const selected = String(nextMode);
                    if (selected === 'unmapped') updateInput(field.id, undefined);
                    else if (selected.startsWith('event:')) updateInput(field.id, { source: { kind: 'event', value: selected.slice(6) as FlowEventValue } });
                    else if (selected === 'formField') {
                      const first = fields[0];
                      if (first) updateInput(field.id, { source: { kind: 'formField', componentId: first.value, field: first.field } });
                    } else if (selected.startsWith('path:')) updateInput(field.id, {
                      source: {
                        kind: 'path',
                        root: selected.slice(5) as 'form' | 'original' | 'detail' | 'context',
                        path: '',
                      },
                    });
                    else if (selected === 'literal') updateInput(field.id, { source: { kind: 'literal', value: '' } });
                    else if (selected === 'expression') updateInput(field.id, { source: { kind: 'expression', expression: '$event.value' } });
                  }}
                />
                {renderInputValue(field.id, binding)}
                {binding?.autoMapped && <span className="flow-binding-auto-badge">自动</span>}
              </div>
            </div>;
          })}
          {imports.length === 0 && <div className="flow-binding-empty">当前流程没有定义输入字段。</div>}
        </section>}

        {tab === 'outputs' && <section className="flow-binding-panel" role="tabpanel" aria-label="流程输出回写">
          <div className="flow-binding-panel-head">
            <div><strong>流程输出 → 表单字段</strong><p>回写发生在事件末尾；所有目标先校验，任一失败时整批不写入。</p></div>
            {outputNode && <button type="button" onClick={() => onEditWorkflowContract?.(workflow.id, outputNode.id, 'outputs')}>编辑流程输出</button>}
          </div>
          {exports.map((field) => {
            const binding = bindings.outputs[field.id];
            return <div key={field.id} className={`flow-binding-row output ${binding ? 'configured' : 'pending'}`}>
              <div className="flow-binding-target">
                <strong>{field.label || field.name}</strong>
                <small>{field.name} · {field.type}</small>
              </div>
              <span className="flow-binding-arrow" aria-hidden="true">→</span>
              <div className="flow-binding-source">
                <AntdSelectInput
                  value={binding?.target.componentId || ''}
                  options={[{ label: '不回写', value: '' }, ...fields]}
                  onChange={(componentId) => {
                    const selected = fields.find((item) => item.value === componentId);
                    updateOutput(field.id, selected ? {
                      target: { componentId: selected.value, field: selected.field },
                      transform: binding?.transform || { kind: 'direct' },
                    } : undefined);
                  }}
                />
                {binding && renderOutputTransform(field.id, binding)}
              </div>
            </div>;
          })}
          {exports.length === 0 && <div className="flow-binding-empty">当前流程没有定义输出字段。</div>}
        </section>}
      </>}

      <details className="flow-binding-trial">
        <summary>映射试算（不执行流程）</summary>
        <p>输入使用控件当前值或默认值；输出请填写样例或粘贴最近一次调试结果。</p>
        <AntdTextAreaInput value={sampleOutputs} rows={4} placeholder='{"result":"示例"}' onChange={setSampleOutputs} />
        <button type="button" onClick={runTrial}>计算映射结果</button>
        {trialResult && <pre aria-live="polite">{trialResult}</pre>}
      </details>
    </>}
  </div>;
}
