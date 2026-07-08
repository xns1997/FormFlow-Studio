import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { WorkflowFile } from '../../project/types';
import {
  createDefaultParameterMap,
  type FormFlowTriggerConfig,
} from '../../services/engine/formFlowTrigger';
import {
  buildParameterMapFromDraftRows,
  createDefaultDraftRows,
  getWorkflowPortTargets,
  parseParameterMapToDraftRows,
  remapDraftRowsForWorkflow,
  type FlowParameterDraftRow,
  type FlowTriggerEditorMode,
} from '../../services/engine/flowTriggerEditor';
import {
  AntdNumberInput,
  AntdSelectInput,
  AntdSwitchInput,
  AntdTextAreaInput,
  AntdTextInput,
} from '../../components/AntdFormControls';
import CodeEditor from '../../components/CodeEditor';
import { createFlowParameterSuggestions } from '../../components/codeEditorSuggestions';
import Modal, { ModalFooter, ModalHeader } from '../../components/Modal';
import {
  createRuleId,
  StaticObjectValueMode,
  StaticObjectEntry,
  parseStaticObjectEntries,
  buildStaticObjectJson,
  normalizeMappingName,
} from './utils';

export function FlowTriggerEditor({
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
  const workflowPorts = useMemo(() => getWorkflowPortTargets(workflow), [workflow]);
  const parseResult = useMemo(() => parseParameterMapToDraftRows(value?.parameterMap, workflow), [value?.parameterMap, workflow]);
  const [parameterText, setParameterText] = useState(() => JSON.stringify(value?.parameterMap || {}, null, 2));
  const [draftRows, setDraftRows] = useState<FlowParameterDraftRow[]>(() => parseResult.rows);
  const [codeError, setCodeError] = useState('');
  const [jsonEditorModes, setJsonEditorModes] = useState<Record<string, 'object' | 'raw'>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [targetFilter, setTargetFilter] = useState<'all' | 'nodePort' | 'mapped' | 'unmapped'>('all');

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
      parameterMap: buildParameterMapFromDraftRows(nextRows),
    });
  }, [onChange, workflow?.id, workflows]);

  const toggle = (nextEnabled: boolean) => {
    const selected = workflow || workflows[0];
    onChange({
      enabled: nextEnabled,
      workflowId: selected?.id || '',
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
        targetKey: defaultPort?.key || '',
        valueMode: 'eventValue',
        value: '',
        enabled: true,
      },
    ]);
  }, [commitRows, draftRows, workflowPorts]);

  const updateStaticObjectEntries = useCallback((row: FlowParameterDraftRow, entries: StaticObjectEntry[]) => {
    updateRow(row.id, { value: buildStaticObjectJson(entries) });
  }, [updateRow]);

  const buildFieldMappingEntries = useCallback(() => (
    fields.map((field) => ({
      id: createRuleId('obj'),
      key: field,
      valueMode: 'fieldValue' as StaticObjectValueMode,
      value: field,
    }))
  ), [fields]);

  const autoMapObjectEntries = useCallback((row: FlowParameterDraftRow, strategy: 'fill' | 'replace') => {
    const currentEntries = parseStaticObjectEntries(row.value) || [];
    if (strategy === 'replace') {
      updateStaticObjectEntries(row, buildFieldMappingEntries());
      return;
    }
    const seen = new Set(currentEntries.map((entry) => normalizeMappingName(entry.key)));
    const additions = fields
      .filter((field) => !seen.has(normalizeMappingName(field)))
      .map((field) => ({
        id: createRuleId('obj'),
        key: field,
        valueMode: 'fieldValue' as StaticObjectValueMode,
        value: field,
      }));
    updateStaticObjectEntries(row, [...currentEntries, ...additions]);
  }, [buildFieldMappingEntries, fields, updateStaticObjectEntries]);

  const isRowConfigured = useCallback((row: FlowParameterDraftRow) => {
    if (!row.enabled) return false;
    if (!String(row.targetKey || '').trim()) return false;
    if (['fieldValue', 'formPath', 'originalPath', 'detailPath', 'contextPath', 'expression'].includes(row.valueMode)) {
      return !!String(row.value || '').trim();
    }
    if (row.valueMode === 'staticJson') return !!String(row.value || '').trim();
    return true;
  }, []);

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
              <div className="flow-mapping-auto-note">
                已启用结构化字段映射，共 {objectEntries.length} 项，可在下方表格中编辑
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

  const portRows = draftRows.filter((row) => row.targetType === 'nodePort');
  const unsupportedCount = parseResult.unsupportedEntries.length + parseResult.errors.length;
  const configuredRows = draftRows.filter(isRowConfigured);
  const objectMappingCount = draftRows.reduce((sum, row) => (
    row.valueMode === 'staticJson' ? sum + (parseStaticObjectEntries(row.value)?.length || 0) : sum
  ), 0);
  const filteredRows = draftRows.filter((row) => {
    const keyword = searchText.trim().toLowerCase();
    const searchMatched = !keyword
      || row.targetKey.toLowerCase().includes(keyword)
      || row.value.toLowerCase().includes(keyword)
      || row.valueMode.toLowerCase().includes(keyword);
    if (!searchMatched) return false;
    if (targetFilter === 'nodePort') return row.targetType === 'nodePort';
    if (targetFilter === 'mapped') return isRowConfigured(row);
    if (targetFilter === 'unmapped') return !isRowConfigured(row);
    return true;
  });
  const visibleRowIds = new Set(filteredRows.map((row) => row.id));
  const visiblePortRows = portRows.filter((row) => visibleRowIds.has(row.id));
  const statusBits = [
    `${portRows.length} 个导入字段`,
    `${configuredRows.length}/${draftRows.length} 已配置`,
    `${objectMappingCount} 个字段映射`,
    ...(unsupportedCount > 0 ? [`${unsupportedCount} 个高级项`] : []),
    ...(codeError ? ['代码有错误'] : []),
  ];

  const portValueModeOptions = [
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
  ];

  const renderObjectEntryTable = (row: FlowParameterDraftRow) => {
    const objectEntries = parseStaticObjectEntries(row.value);
    if (!objectEntries || (jsonEditorModes[row.id] ?? 'object') === 'raw') return null;
    return (
      <div className="flow-mapping-object-editor">
        <div className="flow-mapping-object-toolbar">
          <strong>对象字段映射</strong>
          <div className="flow-mapping-inline-actions">
            <button type="button" onClick={() => autoMapObjectEntries(row, 'fill')}>补齐同名字段</button>
            <button type="button" onClick={() => autoMapObjectEntries(row, 'replace')}>按表单字段重建</button>
            <button type="button" onClick={() => setJsonEditorModes((current) => ({ ...current, [row.id]: 'raw' }))}>代码视图</button>
          </div>
        </div>
        <div className="flow-mapping-object-head flow-mapping-object-grid">
          <span>目标字段</span>
          <span>来源类型</span>
          <span>来源值</span>
          <span>操作</span>
        </div>
        {objectEntries.map((entry) => (
          <div key={entry.id} className="flow-mapping-object-grid flow-mapping-object-row">
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
              className="flow-mapping-icon-btn"
              onClick={() => updateStaticObjectEntries(row, objectEntries.filter((item) => item.id !== entry.id))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="flow-mapping-add-row"
          onClick={() => updateStaticObjectEntries(row, [...objectEntries, {
            id: createRuleId('obj'),
            key: '',
            valueMode: 'fieldValue',
            value: '',
          }])}
        >
          添加映射字段
        </button>
      </div>
    );
  };

  const renderMappingRow = (row: FlowParameterDraftRow) => {
    const valueInput = renderValueInput(row);
    const [nodeId = '', portName = ''] = row.targetKey.split('.');
    const nodeOptions = Array.from(new Map(workflowPorts.map((item) => [item.nodeId, item.nodeLabel])).entries());
    const portOptions = workflowPorts.filter((item) => item.nodeId === nodeId);
    return (
      <div key={row.id} className={`flow-mapping-table-row ${isRowConfigured(row) ? 'configured' : 'pending'}`}>
        <div className="flow-mapping-row-main flow-mapping-grid-port">
          <label className="prop-flow-trigger-row-toggle flow-mapping-enabled">
            <AntdSwitchInput checked={row.enabled} onChange={(checked) => updateRow(row.id, { enabled: checked })} />
            <span>启用</span>
          </label>
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
          <AntdSelectInput
            value={portName}
            options={[
              { label: '选择端口', value: '' },
              ...portOptions.map((item) => ({ label: item.portLabel, value: item.portName })),
            ]}
            onChange={(next) => updateRow(row.id, { targetKey: nodeId ? `${nodeId}.${String(next)}` : '' })}
          />
          <AntdSelectInput
            value={row.valueMode}
            options={portValueModeOptions}
            onChange={(next) => updateRow(row.id, { valueMode: next as FlowParameterDraftRow['valueMode'], value: '' })}
          />
          <div className="flow-mapping-value-cell">
            {valueInput || <div className="flow-mapping-auto-note">直接传当前事件值</div>}
          </div>
          <button type="button" className="flow-mapping-icon-btn" onClick={() => removeRow(row.id)}>删除</button>
        </div>
        {row.valueMode === 'staticJson' && renderObjectEntryTable(row)}
      </div>
    );
  };

  return (
    <>
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
            <div className="prop-flow-trigger-summary">
              <div className="prop-flow-trigger-summary-head">
                <strong>映射摘要</strong>
                <button type="button" onClick={() => setEditorOpen(true)}>编辑映射</button>
              </div>
              <div className="prop-flow-trigger-statuses">
                {statusBits.map((bit) => <span key={bit} className="prop-flow-trigger-chip">{bit}</span>)}
              </div>
              {unsupportedCount > 0 && (
                <div className="prop-flow-trigger-status warning">
                  含 {unsupportedCount} 个高级结构，建议在弹窗里切到代码模式调整
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        width="min(1180px, 94vw)"
        maxWidth="94vw"
        maxHeight="88vh"
        containerClassName="flow-mapping-modal"
      >
        <ModalHeader title="流程映射编辑器" onClose={() => setEditorOpen(false)} />
        <div className="modal-body flow-mapping-modal-body">
          <div className="flow-mapping-topbar">
            <label className="prop-field">
              <span>运行流程</span>
              <AntdSelectInput
                value={value?.workflowId || workflow?.id || workflows[0].id}
                options={workflows.map((item) => ({ label: item.name, value: item.id }))}
                onChange={(next) => selectWorkflow(String(next))}
              />
            </label>
            <div className="prop-flow-trigger-mode">
              <button type="button" className={mode === 'ui' ? 'active' : ''} onClick={() => onModeChange('ui')}>表格</button>
              <button type="button" className={mode === 'code' ? 'active' : ''} onClick={() => onModeChange('code')}>代码</button>
            </div>
          </div>

          {mode === 'ui' ? (
            <>
              <div className="flow-mapping-toolbar">
                <AntdTextInput value={searchText} placeholder="搜索导入字段或路径" onChange={setSearchText} />
                <AntdSelectInput
                  value={targetFilter}
                  options={[
                    { label: '全部映射', value: 'all' },
                    { label: '导入字段', value: 'nodePort' },
                    { label: '已配置', value: 'mapped' },
                    { label: '待补全', value: 'unmapped' },
                  ]}
                  onChange={(next) => setTargetFilter(next as typeof targetFilter)}
                />
                <div className="flow-mapping-inline-actions">
                  <button type="button" onClick={() => addRow('nodePort')}>添加端口</button>
                </div>
              </div>

              <section className="flow-mapping-section">
                <div className="flow-mapping-section-head">
                  <strong>导入字段</strong>
                  <span>{visiblePortRows.length}/{portRows.length} 行</span>
                </div>
                {visiblePortRows.length === 0 ? (
                  <div className="prop-flow-trigger-empty">
                    {portRows.length === 0
                      ? (workflowPorts.length === 0 ? '当前流程还没有导入节点字段' : '当前还没有导入字段映射')
                      : '当前筛选结果里没有端口映射'}
                  </div>
                ) : visiblePortRows.map(renderMappingRow)}
              </section>
            </>
          ) : (
            <div className="prop-field prop-flow-parameters flow-mapping-code-editor">
              <span>传入参数</span>
              <CodeEditor
                value={parameterText}
                onChange={(next) => {
                  setParameterText(next);
                  try {
                    const parsed = JSON.parse(next);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                      setCodeError('');
                      onChange({ ...value!, enabled: true, workflowId: workflow?.id || workflows[0].id, parameterMap: parsed });
                    } else {
                      setCodeError('参数必须是 JSON 对象');
                    }
                  } catch {
                    setCodeError('JSON 格式无效');
                  }
                }}
                language="json"
                theme="light"
                height={420}
                minHeight={320}
                lineNumbers
                compact
                fullscreen
                title="流程传入参数"
                suggestions={createFlowParameterSuggestions(workflow, fields)}
                autoSuggestPolicy="json-contextual"
                suggestionTriggerCharacters={['"', ':', ',', '{', '$']}
                options={{ folding: true, lineNumbersMinChars: 2, scrollbar: { vertical: 'hidden', horizontal: 'auto' } }}
              />
              {codeError && <div className="prop-flow-trigger-status error">{codeError}</div>}
            </div>
          )}
        </div>
        <ModalFooter>
          <button type="button" className="toolbar-btn" onClick={() => setEditorOpen(false)}>完成</button>
        </ModalFooter>
      </Modal>
    </>
  );
}
