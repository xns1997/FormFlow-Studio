import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { DesignComponent, FormLinkageAction, FormLinkageCondition, FormLinkageRule, WorkflowFile } from '../project/types';
import type { RangeRef } from '../models';
import type { MetricConfig } from '../components/ChartWidget';
import { getControl } from './registry';
import type { PropDef } from './types';
import { rangeToAddress } from '../services/rangeResolver';
import RangeSelector from '../components/RangeSelector';
import DimMetricField from './DimMetricField';
import { useProjectStore } from '../project/store';
import { DesignerIcon } from './icons';
import {
  AntdColorInput,
  AntdDateInput,
  AntdNumberInput,
  AntdSelectInput,
  AntdSwitchInput,
  AntdTextAreaInput,
  AntdTextInput,
  AntdTimeInput,
  FormAntdProvider,
} from '../components/AntdFormControls';
import CodeEditor from '../components/CodeEditor';
import { createEventContextExtraLib, createEventContextSuggestions, createFlowParameterSuggestions, jsonSuggestions, type EventFieldDescriptor } from '../components/codeEditorSuggestions';
import {
  createDefaultParameterMap,
  getWorkflowVariableNames,
  type FormFlowTriggerConfig,
} from '../services/formFlowTrigger';
import { getBehaviorEventDoc } from '../services/behaviorDocs';
import {
  buildParameterMapFromDraftRows,
  createDefaultDraftRows,
  getWorkflowPortTargets,
  parseParameterMapToDraftRows,
  remapDraftRowsForWorkflow,
  type FlowParameterDraftRow,
  type FlowTriggerEditorMode,
} from '../services/flowTriggerEditor';
import { formatStructuredProperty, isStructuredProperty, parseStructuredProperty } from '../services/structuredProperties';
import { getControlSnippetExamples } from '../services/controlSnippets';
import { buildDocsPath } from '../services/routes';

function getDefaultEventCode(eventKey: string, fieldName: string): string {
  const templates: Record<string, string> = {
    onChange: `/** @param {FormEventContext} ctx */
async (ctx) => {
  ctx.console.log('${fieldName} 变更为:', ctx.value);
  return ctx.value;
}`,
    onBlur: `/** @param {FormEventContext} ctx */
async (ctx) => {
  ctx.console.log('${fieldName} 失焦, 当前值:', ctx.value);
}`,
    onFocus: `/** @param {FormEventContext} ctx */
async (ctx) => {
  ctx.console.log('${fieldName} 获得焦点');
}`,
    onClick: `/** @param {FormEventContext} ctx */
async (ctx) => {
  ctx.console.log('${fieldName} 被点击', ctx.values);
}`,
  };
  return templates[eventKey] || `// ${eventKey}\n`;
}

function createRuleId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function createDefaultLinkageCondition(field?: string): FormLinkageCondition {
  return {
    id: createRuleId('cond'),
    field,
    operator: 'equals',
    value: '',
  };
}

function createDefaultLinkageAction(): FormLinkageAction {
  return {
    id: createRuleId('action'),
    type: 'setValue',
    targetField: '',
    valueSource: 'event',
  };
}

function createDefaultLinkageRule(eventName: string, fieldName: string): FormLinkageRule {
  return {
    id: createRuleId('rule'),
    name: `${eventName} 联动`,
    trigger: { eventName, sourceField: fieldName },
    conditions: [createDefaultLinkageCondition(fieldName)],
    conditionMode: 'all',
    actions: [createDefaultLinkageAction()],
    scope: 'current-form',
    enabled: true,
    priority: 10,
  };
}

type StaticObjectValueMode = 'eventValue' | 'fieldValue' | 'formPath' | 'expression' | 'static';

type StaticObjectEntry = {
  id: string;
  key: string;
  valueMode: StaticObjectValueMode;
  value: string;
};

function inferStaticObjectValueMode(raw: unknown): { valueMode: StaticObjectValueMode; value: string } {
  if (typeof raw !== 'string') return { valueMode: 'static', value: JSON.stringify(raw ?? '') };
  if (raw === '$value') return { valueMode: 'eventValue', value: '' };
  if (raw.startsWith('$form.')) {
    const path = raw.slice(6);
    return { valueMode: path.includes('.') ? 'formPath' : 'fieldValue', value: path };
  }
  return raw.startsWith('$') ? { valueMode: 'expression', value: raw } : { valueMode: 'static', value: raw };
}

function buildStaticObjectEntryValue(entry: StaticObjectEntry): unknown {
  switch (entry.valueMode) {
    case 'eventValue': return '$value';
    case 'fieldValue': return `$form.${entry.value}`;
    case 'formPath': return `$form.${entry.value}`;
    case 'expression': return entry.value;
    case 'static':
      try {
        return JSON.parse(entry.value);
      } catch {
        return entry.value;
      }
    default:
      return entry.value;
  }
}

function parseStaticObjectEntries(raw: string): StaticObjectEntry[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return Object.entries(parsed).map(([key, value]) => {
      const resolved = inferStaticObjectValueMode(value);
      return {
        id: createRuleId('obj'),
        key,
        valueMode: resolved.valueMode,
        value: resolved.value,
      };
    });
  } catch {
    return null;
  }
}

function buildStaticObjectJson(entries: StaticObjectEntry[]) {
  return JSON.stringify(
    Object.fromEntries(
      entries
        .filter((entry) => entry.key.trim())
        .map((entry) => [entry.key.trim(), buildStaticObjectEntryValue(entry)]),
    ),
    null,
    2,
  );
}

interface Props {
  component: DesignComponent | null;
  components?: DesignComponent[];
  onUpdate: (id: string, patch: Record<string, any>) => void;
  onRemove: (id: string) => void;
}

function PropField({ def, value, onChange }: { def: PropDef; value: any; onChange: (v: any) => void }) {
  const effectiveValue = value ?? def.default ?? '';
  const selectOptions = (def.options || []).map((option) => ({ label: option.label, value: option.value }));

  if (def.type !== 'range' && def.type !== 'dimMetric' && isStructuredProperty(def.type, effectiveValue)) {
    return (
      <StructuredPropField
        def={def}
        value={effectiveValue}
        onChange={onChange}
      />
    );
  }

  switch (def.type) {
    case 'boolean':
      return (
        <label className="prop-toggle">
          <AntdSwitchInput checked={!!value} onChange={(checked) => onChange(checked)} />
          <span>{def.label}</span>
        </label>
      );
    case 'select':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <AntdSelectInput
            value={String(value ?? '')}
            options={selectOptions}
            onChange={(next) => onChange(next)}
          />
        </label>
      );
    case 'number':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <AntdNumberInput
            value={value ?? ''}
            min={def.min}
            max={def.max}
            step={def.step}
            onChange={(next) => onChange(next === '' ? '' : Number(next))}
          />
        </label>
      );
    case 'color':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <AntdColorInput value={String(value ?? '#000000')} onChange={(next) => onChange(next)} />
        </label>
      );
    case 'date':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <AntdDateInput
            value={String(value ?? '')}
            placeholder={def.placeholder}
            onChange={(next) => onChange(next)}
          />
        </label>
      );
    case 'datetime':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <AntdDateInput
            value={String(value ?? '')}
            placeholder={def.placeholder}
            showTime
            onChange={(next) => onChange(next)}
          />
        </label>
      );
    case 'time':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <AntdTimeInput
            value={String(value ?? '')}
            placeholder={def.placeholder}
            onChange={(next) => onChange(next)}
          />
        </label>
      );
    case 'range':
      return null; // handled separately
    case 'dimMetric' as any:
      return null; // handled separately
    default:
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <AntdTextInput
            value={String(value ?? '')}
            placeholder={def.placeholder}
            onChange={(next) => onChange(next)}
          />
        </label>
      );
  }
}

function StructuredPropField({ def, value, onChange }: { def: PropDef; value: unknown; onChange: (v: any) => void }) {
  const externalText = formatStructuredProperty(value, def.default ?? (String(def.type).includes('[]') || def.type === 'array' ? [] : {}), def.type);
  const [text, setText] = useState(externalText);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(externalText);
    setError(null);
  }, [externalText]);

  return (
    <div className="prop-field">
      <span>{def.label}</span>
      <div className={`structured-property-editor ${error ? 'invalid' : ''}`}>
        <CodeEditor
          value={text}
          onChange={(next) => {
            setText(next);
            const parsed = parseStructuredProperty(next, def.type);
            setError(parsed.error || null);
            if (!parsed.error) onChange(parsed.value);
          }}
          language="json"
          title={def.label}
          theme="light"
          height={180}
          minHeight={120}
          lineNumbers
          suggestions={jsonSuggestions}
          suggestionTriggerCharacters={['"', ':', ',', '{', '[']}
          options={{ folding: true, lineNumbersMinChars: 2, scrollbar: { vertical: 'hidden', horizontal: 'auto' } }}
          compact
          fullscreen
        />
        {error && <div className="structured-property-error">JSON 无效：{error}</div>}
      </div>
    </div>
  );
}

function RangeField({ value, onChange }: { value: RangeRef | null | undefined; onChange: (v: RangeRef | null) => void }) {
  const tables = useProjectStore((s) => s.project?.srcTable || []);
  const [open, setOpen] = useState(false);

  const handleConfirm = useCallback((ref: RangeRef) => {
    onChange(ref);
    setOpen(false);
  }, [onChange]);

  if (!value) {
    return (
      <>
        <button className="lg-range-connect" onClick={() => setOpen(true)} style={{ width: '100%', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          连接数据源
        </button>
        {open && tables.length > 0 && (
          <RangeSelector tables={tables} value={null} onConfirm={handleConfirm} onCancel={() => setOpen(false)} />
        )}
      </>
    );
  }

  const address = rangeToAddress(value);

  return (
    <>
      <div className="lg-range-tag" style={{ width: '100%', justifyContent: 'space-between' }}>
        <span className="lg-range-address">{address}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="lg-range-disconnect" onClick={() => setOpen(true)} title="重新选择" style={{ fontSize: 12 }}>✎</button>
          <button className="lg-range-disconnect" onClick={() => onChange(null)} title="断开连接">×</button>
        </div>
      </div>
      {open && tables.length > 0 && (
        <RangeSelector tables={tables} value={value} onConfirm={handleConfirm} onCancel={() => setOpen(false)} />
      )}
    </>
  );
}

function FlowTriggerEditor({
  value, workflows, componentName, fields, mode, onModeChange, onChange,
}: {
  value: FormFlowTriggerConfig | undefined;
  workflows: WorkflowFile[];
  componentName: string;
  fields: string[];
  mode: FlowTriggerEditorMode;
  onModeChange: (mode: FlowTriggerEditorMode) => void;
  onChange: (value: FormFlowTriggerConfig) => void;
}) {
  const enabled = !!value?.enabled;
  const workflow = workflows.find((item) => item.id === value?.workflowId);
  const variableNames = useMemo(() => getWorkflowVariableNames(workflow), [workflow]);
  const workflowPorts = useMemo(() => getWorkflowPortTargets(workflow), [workflow]);
  const parseResult = useMemo(() => parseParameterMapToDraftRows(value?.parameterMap, workflow), [value?.parameterMap, workflow]);
  const [parameterText, setParameterText] = useState(() => JSON.stringify(value?.parameterMap || {}, null, 2));
  const [draftRows, setDraftRows] = useState<FlowParameterDraftRow[]>(() => parseResult.rows);
  const [codeError, setCodeError] = useState('');
  const [jsonEditorModes, setJsonEditorModes] = useState<Record<string, 'object' | 'raw'>>({});

  useEffect(() => {
    setParameterText(JSON.stringify(value?.parameterMap || {}, null, 2));
    setDraftRows(parseResult.rows);
    setCodeError('');
  }, [parseResult.rows, value?.workflowId, value?.parameterMap]);

  const commitRows = useCallback((nextRows: FlowParameterDraftRow[]) => {
    setDraftRows(nextRows);
    onChange({
      enabled: true,
      workflowId: workflow?.id || workflows[0]?.id || '',
      targetNodeId: value?.targetNodeId,
      parameterMap: buildParameterMapFromDraftRows(nextRows),
    });
  }, [onChange, value?.targetNodeId, workflow?.id, workflows]);

  const toggle = (nextEnabled: boolean) => {
    const selected = workflow || workflows[0];
    onChange({
      enabled: nextEnabled,
      workflowId: selected?.id || '',
      targetNodeId: value?.targetNodeId,
      parameterMap: value?.parameterMap || createDefaultParameterMap(selected, componentName),
    });
  };

  const selectWorkflow = (workflowId: string) => {
    const selected = workflows.find((item) => item.id === workflowId);
    const nextRows = value?.parameterMap
      ? remapDraftRowsForWorkflow(draftRows, selected, componentName)
      : createDefaultDraftRows(selected, componentName);
    setDraftRows(nextRows);
    onChange({
      enabled: true,
      workflowId,
      targetNodeId: value?.targetNodeId,
      parameterMap: buildParameterMapFromDraftRows(nextRows),
    });
  };

  const updateRow = useCallback((rowId: string, patch: Partial<FlowParameterDraftRow>) => {
    commitRows(draftRows.map((row) => row.id === rowId ? { ...row, ...patch } : row));
  }, [commitRows, draftRows]);

  const removeRow = useCallback((rowId: string) => {
    commitRows(draftRows.filter((row) => row.id !== rowId));
  }, [commitRows, draftRows]);

  const addRow = useCallback((targetType: FlowParameterDraftRow['targetType']) => {
    const defaultPort = workflowPorts[0];
    commitRows([
      ...draftRows,
      {
        id: createRuleId('flow_param'),
        targetType,
        targetKey: targetType === 'variable' ? variableNames[0] || '' : defaultPort?.key || '',
        valueMode: 'eventValue',
        value: '',
        enabled: true,
      },
    ]);
  }, [commitRows, draftRows, variableNames, workflowPorts]);

  const updateStaticObjectEntries = useCallback((row: FlowParameterDraftRow, entries: StaticObjectEntry[]) => {
    updateRow(row.id, { value: buildStaticObjectJson(entries) });
  }, [updateRow]);

  const renderValueInput = (row: FlowParameterDraftRow) => {
    switch (row.valueMode) {
      case 'fieldValue':
        return (
          <AntdSelectInput
            value={row.value}
            options={[
              { label: '选择字段', value: '' },
              ...fields.map((field) => ({ label: field, value: field })),
            ]}
            onChange={(next) => updateRow(row.id, { value: String(next) })}
          />
        );
      case 'formPath':
      case 'originalPath':
      case 'detailPath':
      case 'contextPath':
      case 'expression':
        return (
          <AntdTextInput
            value={row.value}
            placeholder={row.valueMode === 'expression' ? '$form.address.city' : '输入路径'}
            onChange={(next) => updateRow(row.id, { value: next })}
          />
        );
      case 'staticJson':
        {
          const objectEntries = parseStaticObjectEntries(row.value);
          const objectMode = jsonEditorModes[row.id] ?? (objectEntries ? 'object' : 'raw');
          if (objectEntries && objectMode === 'object') {
            return (
              <div className="prop-static-object-editor">
                <div className="prop-static-object-toolbar">
                  <span>对象字段</span>
                  <button
                    type="button"
                    onClick={() => setJsonEditorModes((current) => ({ ...current, [row.id]: 'raw' }))}
                  >
                    代码
                  </button>
                </div>
                <div className="prop-static-object-list">
                  {objectEntries.map((entry) => (
                    <div key={entry.id} className="prop-static-object-row">
                      <AntdTextInput
                        value={entry.key}
                        placeholder="字段名"
                        onChange={(next) => {
                          updateStaticObjectEntries(
                            row,
                            objectEntries.map((item) => item.id === entry.id ? { ...item, key: next } : item),
                          );
                        }}
                      />
                      <AntdSelectInput
                        value={entry.valueMode}
                        options={[
                          { label: '字段值', value: 'fieldValue' },
                          { label: '当前值', value: 'eventValue' },
                          { label: '表单路径', value: 'formPath' },
                          { label: '原始表达式', value: 'expression' },
                          { label: '静态值', value: 'static' },
                        ]}
                        onChange={(next) => {
                          updateStaticObjectEntries(
                            row,
                            objectEntries.map((item) => item.id === entry.id ? { ...item, valueMode: next as StaticObjectValueMode, value: '' } : item),
                          );
                        }}
                      />
                      {entry.valueMode === 'fieldValue' ? (
                        <AntdSelectInput
                          value={entry.value}
                          options={[
                            { label: '选择字段', value: '' },
                            ...fields.map((field) => ({ label: field, value: field })),
                          ]}
                          onChange={(next) => {
                            updateStaticObjectEntries(
                              row,
                              objectEntries.map((item) => item.id === entry.id ? { ...item, value: String(next) } : item),
                            );
                          }}
                        />
                      ) : (
                        <AntdTextInput
                          value={entry.value}
                          placeholder={entry.valueMode === 'formPath' ? 'address.city' : entry.valueMode === 'expression' ? '$form.address.city' : '值'}
                          onChange={(next) => {
                            updateStaticObjectEntries(
                              row,
                              objectEntries.map((item) => item.id === entry.id ? { ...item, value: next } : item),
                            );
                          }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => updateStaticObjectEntries(row, objectEntries.filter((item) => item.id !== entry.id))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="prop-static-object-add"
                    onClick={() => updateStaticObjectEntries(row, [...objectEntries, {
                      id: createRuleId('obj'),
                      key: '',
                      valueMode: 'fieldValue',
                      value: '',
                    }])}
                  >
                    添加字段
                  </button>
                </div>
              </div>
            );
          }
        }
        return (
          <div className="prop-static-json-editor">
            {parseStaticObjectEntries(row.value) && (
              <div className="prop-static-object-toolbar">
                <span>原始 JSON</span>
                <button
                  type="button"
                  onClick={() => setJsonEditorModes((current) => ({ ...current, [row.id]: 'object' }))}
                >
                  结构化
                </button>
              </div>
            )}
            <AntdTextAreaInput
              value={row.value}
              autoSize={{ minRows: 4, maxRows: 8 }}
              placeholder={'"文本" / 123 / true / {} / []'}
              onChange={(next) => updateRow(row.id, { value: next })}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const variableRows = draftRows.filter((row) => row.targetType === 'variable');
  const portRows = draftRows.filter((row) => row.targetType === 'nodePort');
  const unsupportedCount = parseResult.unsupportedEntries.length + parseResult.errors.length;
  const showVariableGroup = variableNames.length > 0 || variableRows.length > 0;
  const statusBits = [
    `${variableRows.length} 个变量`,
    `${portRows.length} 个端口`,
    ...(unsupportedCount > 0 ? [`${unsupportedCount} 个高级项`] : []),
    ...(codeError ? ['代码有错误'] : []),
  ];

  return (
    <div className={`prop-flow-trigger ${enabled ? 'enabled' : ''}`}>
      <label className="prop-flow-trigger-toggle">
        <AntdSwitchInput checked={enabled} onChange={(checked) => toggle(checked)} />
        <span>触发流程</span>
      </label>
      {enabled && workflows.length === 0 && (
        <div className="prop-flow-trigger-empty">请先在流程画布中创建并保存流程</div>
      )}
      {enabled && workflows.length > 0 && (
        <div className="prop-flow-trigger-body">
          <label className="prop-field">
            <span>运行流程</span>
            <AntdSelectInput
              value={value?.workflowId || workflow?.id || workflows[0].id}
              options={workflows.map((item) => ({ label: item.name, value: item.id }))}
              onChange={(next) => selectWorkflow(String(next))}
            />
          </label>
          <div className="prop-flow-trigger-mode">
            <button type="button" className={mode === 'ui' ? 'active' : ''} onClick={() => onModeChange('ui')}>UI</button>
            <button type="button" className={mode === 'code' ? 'active' : ''} onClick={() => onModeChange('code')}>代码</button>
          </div>
          {workflow && variableNames.length > 0 && (
            <div className="prop-flow-trigger-vars">
              <span>流程变量</span>
              {variableNames.map((name) => <code key={name}>{name}</code>)}
            </div>
          )}
          {mode === 'ui' ? (
            <div className="prop-flow-trigger-ui">
              {showVariableGroup && (
                <div className="prop-flow-trigger-group">
                  <div className="prop-flow-trigger-group-head">
                    <strong>变量参数</strong>
                    <button type="button" onClick={() => addRow('variable')}>添加</button>
                  </div>
                  {variableRows.length === 0 ? (
                    <div className="prop-flow-trigger-empty">当前流程还没有变量映射</div>
                  ) : variableRows.map((row) => (
                    <div key={row.id} className="prop-flow-trigger-card">
                      <div className="prop-flow-trigger-card-head">
                        <label className="prop-flow-trigger-row-toggle">
                          <AntdSwitchInput checked={row.enabled} onChange={(checked) => updateRow(row.id, { enabled: checked })} />
                          <span>启用</span>
                        </label>
                        <button type="button" onClick={() => removeRow(row.id)}>删除</button>
                      </div>
                      <div className="prop-flow-trigger-card-grid">
                        <label className="prop-field">
                          <span>变量</span>
                          <AntdSelectInput
                            value={row.targetKey}
                            options={[
                              { label: '选择变量', value: '' },
                              ...variableNames.map((name) => ({ label: name, value: name })),
                            ]}
                            onChange={(next) => updateRow(row.id, { targetKey: String(next) })}
                          />
                        </label>
                        <label className="prop-field">
                          <span>值来源</span>
                          <AntdSelectInput
                            value={row.valueMode}
                            options={[
                              { label: '当前值', value: 'eventValue' },
                              { label: '当前字段名', value: 'fieldName' },
                              { label: '当前事件名', value: 'eventName' },
                              { label: '全部表单值', value: 'formData' },
                              { label: '原始表单值', value: 'originalValues' },
                              { label: '上一个值', value: 'previousValue' },
                              { label: '事件 detail', value: 'detail' },
                              { label: '时间戳', value: 'timestamp' },
                              { label: 'dirty', value: 'dirty' },
                              { label: 'changedFields', value: 'changedFields' },
                              { label: '当前组件', value: 'component' },
                              { label: '指定字段值', value: 'fieldValue' },
                              { label: '表单路径', value: 'formPath' },
                              { label: '原始值路径', value: 'originalPath' },
                              { label: 'detail 路径', value: 'detailPath' },
                              { label: 'context 路径', value: 'contextPath' },
                              { label: '静态 JSON', value: 'staticJson' },
                              { label: '原始表达式', value: 'expression' },
                            ]}
                            onChange={(next) => updateRow(row.id, { valueMode: next as FlowParameterDraftRow['valueMode'], value: '' })}
                          />
                        </label>
                        {renderValueInput(row) && (
                          <label className="prop-field prop-flow-trigger-extra-field">
                            <span>{row.valueMode === 'staticJson' ? '值' : '补充参数'}</span>
                            {renderValueInput(row)}
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="prop-flow-trigger-group">
                <div className="prop-flow-trigger-group-head">
                  <strong>节点端口</strong>
                  <button type="button" onClick={() => addRow('nodePort')}>添加</button>
                </div>
                {portRows.length === 0 ? (
                  <div className="prop-flow-trigger-empty">
                    {workflowPorts.length === 0 ? '当前流程还没有可识别输入端口' : '当前还没有端口参数'}
                  </div>
                ) : portRows.map((row) => {
                  const [nodeId = '', portName = ''] = row.targetKey.split('.');
                  const nodeOptions = Array.from(new Map(workflowPorts.map((item) => [item.nodeId, item.nodeLabel])).entries());
                  const portOptions = workflowPorts.filter((item) => item.nodeId === nodeId);
                  return (
                    <div key={row.id} className="prop-flow-trigger-card">
                      <div className="prop-flow-trigger-card-head">
                        <label className="prop-flow-trigger-row-toggle">
                          <AntdSwitchInput checked={row.enabled} onChange={(checked) => updateRow(row.id, { enabled: checked })} />
                          <span>启用</span>
                        </label>
                        <button type="button" onClick={() => removeRow(row.id)}>删除</button>
                      </div>
                      <div className="prop-flow-trigger-card-grid">
                        <label className="prop-field">
                          <span>节点</span>
                          <AntdSelectInput
                            value={nodeId}
                            options={[
                              { label: '选择节点', value: '' },
                              ...nodeOptions.map(([id, label]) => ({ label, value: id })),
                            ]}
                            onChange={(next) => {
                              const nextNodeId = String(next);
                              const nextPort = workflowPorts.find((item) => item.nodeId === nextNodeId);
                              updateRow(row.id, { targetKey: nextPort ? `${nextNodeId}.${nextPort.portName}` : '' });
                            }}
                          />
                        </label>
                        <label className="prop-field">
                          <span>端口</span>
                          <AntdSelectInput
                            value={portName}
                            options={[
                              { label: '选择端口', value: '' },
                              ...portOptions.map((item) => ({ label: item.portLabel, value: item.portName })),
                            ]}
                            onChange={(next) => updateRow(row.id, { targetKey: nodeId ? `${nodeId}.${String(next)}` : '' })}
                          />
                        </label>
                        <label className="prop-field">
                          <span>值来源</span>
                          <AntdSelectInput
                            value={row.valueMode}
                            options={[
                              { label: '当前值', value: 'eventValue' },
                              { label: '指定字段值', value: 'fieldValue' },
                              { label: '表单路径', value: 'formPath' },
                              { label: '原始值路径', value: 'originalPath' },
                              { label: 'detail 路径', value: 'detailPath' },
                              { label: 'context 路径', value: 'contextPath' },
                              { label: '静态 JSON', value: 'staticJson' },
                              { label: '原始表达式', value: 'expression' },
                            ]}
                            onChange={(next) => updateRow(row.id, { valueMode: next as FlowParameterDraftRow['valueMode'], value: '' })}
                          />
                        </label>
                        {renderValueInput(row) && (
                          <label className="prop-field prop-flow-trigger-extra-field">
                            <span>{row.valueMode === 'staticJson' ? '值' : '补充参数'}</span>
                            {renderValueInput(row)}
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {unsupportedCount > 0 && (
                <div className="prop-flow-trigger-status warning">
                  含 {unsupportedCount} 个高级结构，建议切回代码模式调整
                </div>
              )}
            </div>
          ) : (
            <div className="prop-field prop-flow-parameters">
              <span>传入参数</span>
              <CodeEditor
                value={parameterText}
                onChange={(next) => {
                  setParameterText(next);
                  try {
                    const parsed = JSON.parse(next);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                      setCodeError('');
                      onChange({ ...value!, enabled: true, workflowId: workflow?.id || workflows[0].id, targetNodeId: value?.targetNodeId, parameterMap: parsed });
                    } else {
                      setCodeError('参数必须是 JSON 对象');
                    }
                  } catch {
                    setCodeError('JSON 格式无效');
                  }
                }}
                language="json"
                theme="light"
                height={140}
                minHeight={110}
                lineNumbers
                compact
                fullscreen
                title="流程传入参数"
                suggestions={createFlowParameterSuggestions(workflow, fields)}
                suggestionTriggerCharacters={['"', ':', ',', '{', '$']}
                options={{ folding: true, lineNumbersMinChars: 2, scrollbar: { vertical: 'hidden', horizontal: 'auto' } }}
              />
              {codeError && <div className="prop-flow-trigger-status error">{codeError}</div>}
            </div>
          )}
          <div className="prop-flow-trigger-statuses">
            {statusBits.map((bit) => <span key={bit} className="prop-flow-trigger-chip">{bit}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function LinkageRulesEditor({
  eventName,
  fieldName,
  rules,
  fields,
  components,
  workflows,
  onChange,
}: {
  eventName: string;
  fieldName: string;
  rules: FormLinkageRule[];
  fields: string[];
  components: DesignComponent[];
  workflows: WorkflowFile[];
  onChange: (next: FormLinkageRule[]) => void;
}) {
  const componentOptions = components
    .map((component) => ({ id: component.id, label: String(component.props.label || component.props.name || component.type || component.id) }))
    .filter((option) => option.id);

  const updateRule = (ruleId: string, patch: Partial<FormLinkageRule>) => {
    onChange(rules.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule));
  };

  const updateConditions = (ruleId: string, updater: (conditions: FormLinkageCondition[]) => FormLinkageCondition[]) => {
    onChange(rules.map((rule) => rule.id === ruleId ? { ...rule, conditions: updater(rule.conditions) } : rule));
  };

  const updateActions = (ruleId: string, updater: (actions: FormLinkageAction[]) => FormLinkageAction[]) => {
    onChange(rules.map((rule) => rule.id === ruleId ? { ...rule, actions: updater(rule.actions) } : rule));
  };

  return (
    <div className="prop-linkage-editor">
      {rules.map((rule) => (
          <div key={rule.id} className="prop-linkage-rule">
          <div className="prop-linkage-rule-head">
            <AntdTextInput
              value={rule.name}
              onChange={(next) => updateRule(rule.id, { name: next })}
              placeholder="规则名称"
            />
            <label><AntdSwitchInput checked={rule.enabled} onChange={(checked) => updateRule(rule.id, { enabled: checked })} />启用</label>
            <label>优先级<AntdNumberInput value={rule.priority} onChange={(next) => updateRule(rule.id, { priority: Number(next) || 0 })} /></label>
            <button type="button" onClick={() => onChange(rules.filter((item) => item.id !== rule.id))}>删除</button>
          </div>
          <div className="prop-linkage-grid">
            <label className="prop-field">
              <span>触发事件</span>
              <AntdTextInput value={eventName} disabled />
            </label>
            <label className="prop-field">
              <span>来源字段</span>
              <AntdSelectInput
                value={rule.trigger.sourceField || fieldName}
                options={[fieldName, ...fields.filter((item) => item !== fieldName)].map((field) => ({ label: field, value: field }))}
                onChange={(next) => updateRule(rule.id, { trigger: { ...rule.trigger, sourceField: String(next) } })}
              />
            </label>
            <label className="prop-field">
              <span>条件关系</span>
              <AntdSelectInput
                value={rule.conditionMode || 'all'}
                options={[
                  { label: '全部满足', value: 'all' },
                  { label: '任意满足', value: 'any' },
                ]}
                onChange={(next) => updateRule(rule.id, { conditionMode: next as 'all' | 'any' })}
              />
            </label>
          </div>

          <div className="prop-linkage-section">
            <div className="prop-linkage-section-head">
              <strong>条件</strong>
              <button type="button" onClick={() => updateConditions(rule.id, (conditions) => [...conditions, createDefaultLinkageCondition(fieldName)])}>添加条件</button>
            </div>
            {rule.conditions.map((condition) => (
              <div key={condition.id} className="prop-linkage-row">
                <AntdSelectInput
                  value={condition.field || ''}
                  options={fields.map((field) => ({ label: field, value: field }))}
                  onChange={(next) => updateConditions(rule.id, (conditions) => conditions.map((item) => item.id === condition.id ? { ...item, field: String(next) } : item))}
                />
                <AntdSelectInput
                  value={condition.operator}
                  options={[
                    { label: '等于', value: 'equals' },
                    { label: '不等于', value: 'notEquals' },
                    { label: '为空', value: 'isEmpty' },
                    { label: '非空', value: 'isNotEmpty' },
                    { label: '包含', value: 'contains' },
                    { label: '大于', value: 'greaterThan' },
                    { label: '小于', value: 'lessThan' },
                    { label: '大于等于', value: 'greaterOrEqual' },
                    { label: '小于等于', value: 'lessOrEqual' },
                  ]}
                  onChange={(next) => updateConditions(rule.id, (conditions) => conditions.map((item) => item.id === condition.id ? { ...item, operator: next as FormLinkageCondition['operator'] } : item))}
                />
                {!['isEmpty', 'isNotEmpty'].includes(condition.operator) && (
                  <AntdTextInput
                    value={String(condition.value ?? '')}
                    placeholder="比较值"
                    onChange={(next) => updateConditions(rule.id, (conditions) => conditions.map((item) => item.id === condition.id ? { ...item, value: next } : item))}
                  />
                )}
                <button type="button" onClick={() => updateConditions(rule.id, (conditions) => conditions.filter((item) => item.id !== condition.id))}>×</button>
              </div>
            ))}
          </div>

          <div className="prop-linkage-section">
            <div className="prop-linkage-section-head">
              <strong>动作</strong>
              <button type="button" onClick={() => updateActions(rule.id, (actions) => [...actions, createDefaultLinkageAction()])}>添加动作</button>
            </div>
            {rule.actions.map((action) => (
              <div key={action.id} className="prop-linkage-action-card">
                <div className="prop-linkage-row">
                  <AntdSelectInput
                    value={action.type}
                    options={[
                      { label: '设置字段值', value: 'setValue' },
                      { label: '显示/隐藏控件', value: 'setVisible' },
                      { label: '启用/禁用控件', value: 'setDisabled' },
                      { label: '设置字段必填', value: 'setRequired' },
                      { label: '显示提示', value: 'showMessage' },
                      { label: '执行流程', value: 'runWorkflow' },
                    ]}
                    onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, type: next as FormLinkageAction['type'] } : item))}
                  />
                  <button type="button" onClick={() => updateActions(rule.id, (actions) => actions.filter((item) => item.id !== action.id))}>删除</button>
                </div>

                {action.type === 'setValue' && (
                  <div className="prop-linkage-grid">
                    <label className="prop-field">
                      <span>目标字段</span>
                      <AntdSelectInput
                        value={action.targetField || ''}
                        options={[
                          { label: '选择字段', value: '' },
                          ...fields.map((field) => ({ label: field, value: field })),
                        ]}
                        onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, targetField: String(next) } : item))}
                      />
                    </label>
                    <label className="prop-field">
                      <span>值来源</span>
                      <AntdSelectInput
                        value={action.valueSource || 'static'}
                        options={[
                          { label: '当前事件值', value: 'event' },
                          { label: '其他字段值', value: 'field' },
                          { label: '静态值', value: 'static' },
                        ]}
                        onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, valueSource: next as FormLinkageAction['valueSource'] } : item))}
                      />
                    </label>
                    {action.valueSource === 'field' ? (
                      <label className="prop-field">
                        <span>来源字段</span>
                        <AntdSelectInput
                          value={action.sourceField || ''}
                          options={[
                            { label: '选择字段', value: '' },
                            ...fields.map((field) => ({ label: field, value: field })),
                          ]}
                          onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, sourceField: String(next) } : item))}
                        />
                      </label>
                    ) : action.valueSource === 'static' ? (
                      <label className="prop-field">
                        <span>静态值</span>
                        <AntdTextInput value={String(action.value ?? '')} onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, value: next } : item))} />
                      </label>
                    ) : null}
                  </div>
                )}

                {action.type === 'setVisible' && (
                  <div className="prop-linkage-grid">
                    <label className="prop-field">
                      <span>目标控件</span>
                      <AntdSelectInput
                        value={action.targetComponentId || ''}
                        options={[
                          { label: '选择控件', value: '' },
                          ...componentOptions.map((option) => ({ label: option.label, value: option.id })),
                        ]}
                        onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, targetComponentId: String(next) } : item))}
                      />
                    </label>
                    <label className="prop-field">
                      <span>动作</span>
                      <AntdSelectInput
                        value={action.visible === false ? 'hide' : 'show'}
                        options={[
                          { label: '显示', value: 'show' },
                          { label: '隐藏', value: 'hide' },
                        ]}
                        onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, visible: next === 'show' } : item))}
                      />
                    </label>
                  </div>
                )}

                {action.type === 'setDisabled' && (
                  <div className="prop-linkage-grid">
                    <label className="prop-field">
                      <span>目标控件</span>
                      <AntdSelectInput
                        value={action.targetComponentId || ''}
                        options={[
                          { label: '选择控件', value: '' },
                          ...componentOptions.map((option) => ({ label: option.label, value: option.id })),
                        ]}
                        onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, targetComponentId: String(next) } : item))}
                      />
                    </label>
                    <label className="prop-field">
                      <span>动作</span>
                      <AntdSelectInput
                        value={action.disabled ? 'disable' : 'enable'}
                        options={[
                          { label: '禁用', value: 'disable' },
                          { label: '启用', value: 'enable' },
                        ]}
                        onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, disabled: next === 'disable' } : item))}
                      />
                    </label>
                  </div>
                )}

                {action.type === 'setRequired' && (
                  <div className="prop-linkage-grid">
                    <label className="prop-field">
                      <span>目标字段</span>
                      <AntdSelectInput
                        value={action.targetField || ''}
                        options={[
                          { label: '选择字段', value: '' },
                          ...fields.map((field) => ({ label: field, value: field })),
                        ]}
                        onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, targetField: String(next) } : item))}
                      />
                    </label>
                    <label className="prop-field">
                      <span>动作</span>
                      <AntdSelectInput
                        value={action.required === false ? 'optional' : 'required'}
                        options={[
                          { label: '设为必填', value: 'required' },
                          { label: '取消必填', value: 'optional' },
                        ]}
                        onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, required: next === 'required' } : item))}
                      />
                    </label>
                  </div>
                )}

                {action.type === 'showMessage' && (
                  <div className="prop-linkage-grid">
                    <label className="prop-field">
                      <span>提示内容</span>
                      <AntdTextInput value={action.message || ''} onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, message: next } : item))} />
                    </label>
                    <label className="prop-field">
                      <span>类型</span>
                      <AntdSelectInput
                        value={action.level || 'info'}
                        options={[
                          { label: '信息', value: 'info' },
                          { label: '成功', value: 'success' },
                          { label: '警告', value: 'warning' },
                          { label: '错误', value: 'error' },
                        ]}
                        onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, level: next as FormLinkageAction['level'] } : item))}
                      />
                    </label>
                  </div>
                )}

                {action.type === 'runWorkflow' && (
                  <div className="prop-linkage-grid">
                    <label className="prop-field">
                      <span>目标流程</span>
                      <AntdSelectInput
                        value={action.workflowId || ''}
                        options={[
                          { label: '当前绑定流程', value: '' },
                          ...workflows.map((workflow) => ({ label: workflow.name, value: workflow.id })),
                        ]}
                        onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, workflowId: String(next) } : item))}
                      />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <button type="button" className="prop-linkage-add" onClick={() => onChange([...rules, createDefaultLinkageRule(eventName, fieldName)])}>
        + 添加联动规则
      </button>
    </div>
  );
}

export function PropertyPanel({ component, components = [], onUpdate, onRemove }: Props) {
  const projectId = useProjectStore((state) => state.project?.config.id || '');
  const workflows = useProjectStore((state) => state.project?.workflows || []);
  const tables = useProjectStore((state) => state.project?.srcTable || []);
  const [flowTriggerModes, setFlowTriggerModes] = useState<Record<string, FlowTriggerEditorMode>>({});
  const fieldDescriptors = useMemo<EventFieldDescriptor[]>(() => {
    const fromTables = tables.flatMap((table) => table.sheets.flatMap((sheet) => sheet.columns.map((column) => ({
      name: column.name,
      type: column.dataType,
    }))));
    const fromComponents = components.map((item) => {
      const name = String(item.fieldBinding || item.props.name || '').trim();
      if (!name) return null;
      if (item.type === 'number' || item.type === 'rating') return { name, type: 'number' };
      if (item.type === 'switch') return { name, type: 'boolean' };
      if (item.type === 'checkbox') return { name, type: 'array' };
      return { name, type: 'string' };
    }).filter(Boolean) as EventFieldDescriptor[];
    return [...new Map([...fromTables, ...fromComponents].map((field) => [field.name, field])).values()];
  }, [components, tables]);
  const fields = useMemo(() => fieldDescriptors.map((field) => field.name), [fieldDescriptors]);
  if (!component) {
    return (
      <div className="designer-properties">
        <div style={{ padding: '20px 0', color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
          点击画布上的控件编辑属性
        </div>
      </div>
    );
  }

  const control = getControl(component.type);
  if (!control) return null;

  const groups = new Map<string, PropDef[]>();
  for (const def of control.propSchema) {
    const g = def.group || '基础';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(def);
  }

  const rangeDef = control.propSchema.find(d => d.type === 'range');
  const rangeValue = rangeDef ? component.props[rangeDef.key] as RangeRef | null : null;

  return (
    <FormAntdProvider>
    <div className="designer-properties">
      <div className="properties-header">
        <span className="properties-type">
          <DesignerIcon name={component.type} fallback={control.icon} />
          {control.label}
        </span>
        <button className="properties-delete" onClick={() => onRemove(component.id)}>删除</button>
      </div>
      <div className="properties-body">
        {[...groups.entries()].map(([group, defs]) => (
          <div key={group} className="properties-group">
            <h4>{group}</h4>
            {defs.map((def) => {
              if (def.type === 'range') {
                return (
                  <RangeField
                    key={def.key}
                    value={rangeValue}
                    onChange={(v) => onUpdate(component.id, { [def.key]: v })}
                  />
                );
              }
              if ((def as any).type === 'dimMetric') {
                return (
                  <DimMetricField
                    key={def.key}
                    rangeRef={rangeValue}
                    dimensions={(component.props.dimensions as number[]) || []}
                    metrics={(component.props.metrics as MetricConfig[]) || []}
                    onChange={(dims, mets) => onUpdate(component.id, { dimensions: dims, metrics: mets })}
                  />
                );
              }
              return (
                <PropField
                  key={def.key}
                  def={
                    component.type === 'datePicker' && (def.key === 'minDate' || def.key === 'maxDate')
                      ? { ...def, type: component.props.showTime ? 'datetime' : 'date' }
                      : def
                  }
                  value={component.props[def.key]}
                  onChange={(v) => onUpdate(component.id, { [def.key]: v })}
                />
              );
            })}
          </div>
        ))}
        <div className="properties-group">
          <h4>布局</h4>
          <div className="prop-row">
            <span>X: {Math.round(component.x)}</span>
            <span>Y: {Math.round(component.y)}</span>
          </div>
          <div className="prop-row">
            <span>W: {Math.round(component.width)}</span>
            <span>H: {Math.round(component.height)}</span>
          </div>
        </div>
        {control.eventSchema && control.eventSchema.length > 0 && (
          <div className="properties-group">
            <h4>事件</h4>
            {control.eventSchema.map((evt) => {
              const eventCode = component.props.events?.[evt.key] || getDefaultEventCode(evt.key, component.props.name || component.type);
              const flowTriggers = (component.props.flowTriggers || {}) as Record<string, FormFlowTriggerConfig>;
              const linkageRuleMap = (component.props.linkageRules || {}) as Record<string, FormLinkageRule[]>;
              const eventRules = linkageRuleMap[evt.key] || [];
              const modeKey = `${component.id}:${evt.key}`;
              const editorMode = flowTriggerModes[modeKey]
                || (parseParameterMapToDraftRows(flowTriggers[evt.key]?.parameterMap, workflows.find((item) => item.id === flowTriggers[evt.key]?.workflowId)).unsupportedEntries.length > 0 ? 'code' : 'ui');
              const impactFields = [...new Set(eventRules.flatMap((rule) => rule.actions.map((action) => action.targetField).filter(Boolean) as string[]))];
              const impactComponents = [...new Set(eventRules.flatMap((rule) => rule.actions.map((action) => action.targetComponentId).filter(Boolean) as string[]))];
              const controlSnippets = getControlSnippetExamples({
                components,
                currentField: String(component.fieldBinding || component.props.name || component.type),
                eventName: evt.key,
              });
              const docsQuery = {
                fromProject: projectId,
                fromPage: 'workspace' as const,
                fromTab: 'designer',
              };
              const eventDoc = getBehaviorEventDoc(evt.key, 'control');
              return (
                <div key={evt.key} className="prop-event">
                  <div className="prop-event-header">
                    <span className="prop-event-key">{evt.key}</span>
                    <span className="prop-event-label">{evt.label}</span>
                  </div>
                  <div className="prop-event-section">
                    <div className="prop-event-section-title">联动规则</div>
                    <LinkageRulesEditor
                      eventName={evt.key}
                      fieldName={String(component.fieldBinding || component.props.name || component.type)}
                      rules={eventRules}
                      fields={fields}
                      components={components}
                      workflows={workflows}
                      onChange={(nextRules) => onUpdate(component.id, {
                        linkageRules: { ...linkageRuleMap, [evt.key]: nextRules },
                      })}
                    />
                  </div>
                  <div className="prop-event-section">
                    <div className="prop-event-section-title">流程绑定</div>
                  <FlowTriggerEditor
                    value={flowTriggers[evt.key]}
                    workflows={workflows}
                    componentName={component.props.name || component.type}
                    fields={fields}
                    mode={editorMode}
                    onModeChange={(nextMode) => setFlowTriggerModes((current) => ({ ...current, [modeKey]: nextMode }))}
                    onChange={(trigger) => onUpdate(component.id, {
                      flowTriggers: { ...flowTriggers, [evt.key]: trigger },
                    })}
                  />
                  </div>
                  <div className="prop-event-section">
                    <div className="prop-event-section-title">高级脚本</div>
                  <CodeEditor
                    value={eventCode}
                    placeholder={evt.description}
                    height={160}
                    minHeight={120}
                    path={`inmemory://model/form-event-${component.id}-${evt.key}.js`}
                    compact
                    fullscreen
                    lineNumbers
                    theme="light"
                    extraLibs={[
                      createEventContextExtraLib({
                        filePath: `inmemory://model/form-event-${component.id}-${evt.key}.d.ts`,
                        fields: fieldDescriptors,
                        currentField: String(component.fieldBinding || component.props.name || component.type),
                        eventName: evt.key,
                      }),
                    ]}
                    suggestions={createEventContextSuggestions({
                      fields: fieldDescriptors,
                      workflows,
                      eventName: evt.key,
                      currentField: String(component.fieldBinding || component.props.name || component.type),
                    })}
                    suggestionTriggerCharacters={['.', "'", '"', '(']}
                    options={{ folding: true, lineNumbersMinChars: 2, scrollbar: { vertical: 'hidden', horizontal: 'auto' } }}
                    title={`${control.label} · ${evt.label}`}
                    onChange={(code) => {
                      const events = { ...(component.props.events || {}), [evt.key]: code };
                      onUpdate(component.id, { events });
                    }}
                  />
                  </div>
                  <div className="prop-event-section">
                    <div className="prop-event-section-title">ctx.controls 参考</div>
                    <div className="prop-event-doc-links">
                      <Link to={buildDocsPath('control-handles-reference', docsQuery)} className="prop-event-doc-link">控件句柄 Reference</Link>
                      <Link to={buildDocsPath('context-reference', docsQuery)} className="prop-event-doc-link">上下文总览</Link>
                      <Link to={buildDocsPath(eventDoc?.slug, docsQuery)} className="prop-event-doc-link">事件文档</Link>
                    </div>
                    <div className="prop-event-snippets">
                      {controlSnippets.map((snippet) => (
                        <div key={snippet.id} className="prop-event-snippet-card">
                          <div className="prop-event-snippet-head">
                            <strong>{snippet.title}</strong>
                            <button
                              type="button"
                              onClick={() => {
                                const current = String(component.props.events?.[evt.key] || '').trim();
                                const nextCode = current ? `${current}\n\n${snippet.code}` : snippet.code;
                                onUpdate(component.id, { events: { ...(component.props.events || {}), [evt.key]: nextCode } });
                              }}
                            >
                              插入示例
                            </button>
                          </div>
                          <span>{snippet.summary}</span>
                          <code>{snippet.code}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="prop-event-impact">
                    <strong>影响面</strong>
                    <div>
                      {impactFields.length > 0 ? <span>字段：{impactFields.join('、')}</span> : <span>字段：—</span>}
                      {impactComponents.length > 0 ? <span>控件：{impactComponents.join('、')}</span> : <span>控件：—</span>}
                      <span>流程：{flowTriggers[evt.key]?.workflowId || '—'}</span>
                      <span>脚本：{eventCode.trim() ? `${eventCode.trim().split('\n').length} 行` : '—'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </FormAntdProvider>
  );
}
