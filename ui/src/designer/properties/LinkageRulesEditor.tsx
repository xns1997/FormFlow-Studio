import React from 'react';
import type { DesignComponent, FormLinkageAction, FormLinkageCondition, FormLinkageRule, WorkflowFile } from '../../project/types';
import {
  AntdNumberInput,
  AntdSelectInput,
  AntdSwitchInput,
  AntdTextAreaInput,
  AntdTextInput,
} from '../../components/AntdFormControls';
import { createDefaultLinkageCondition, createDefaultLinkageAction, createDefaultLinkageRule } from './utils';
import { useProjectStore } from '../../project/store';
import RangeSelector from '../../components/RangeSelector';
import { rangeToAddress } from '../../services/data/rangeResolver';

export function LinkageRulesEditor({
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
  const tables = useProjectStore((state) => state.project?.srcTable || []);
  const [rangeActionTarget, setRangeActionTarget] = React.useState<string | null>(null);
  const componentOptions = components
    .map((component) => ({ id: component.id, label: String(component.props.label || component.props.name || component.type || component.id) }))
    .filter((option) => option.id);
  const dateFieldOptions = components
    .filter((component) => ['datePicker', 'timePicker', 'dateRange'].includes(component.type))
    .map((component) => {
      const field = String(component.fieldBinding || component.props.name || component.id);
      return { label: `${String(component.props.label || component.props.name || component.type)} · ${component.type}`, value: field };
    });
  const optionFieldOptions = components
    .filter((component) => ['select', 'radio', 'checkbox', 'segmented'].includes(component.type))
    .map((component) => {
      const field = String(component.fieldBinding || component.props.name || component.id);
      return { label: `${String(component.props.label || component.props.name || component.type)} · ${component.type}`, value: field };
    });
  const activeRangeConfig = rules
    .flatMap((rule) => rule.actions)
    .find((action) => action.id === rangeActionTarget && action.optionsConfig?.mode === 'range')?.optionsConfig;
  const appendDateShortcutRule = (preset: 'start-end' | 'booking-clear' | 'deadline-default') => {
    const targetField = fieldName;
    const relatedDateField = dateFieldOptions.find((option) => option.value !== targetField)?.value || '';
    if (preset === 'start-end') {
      onChange([...rules, {
        id: `rule_date_${Date.now()}`,
        name: '开始结束日期校验',
        trigger: { eventName, sourceField: targetField },
        conditions: [],
        conditionMode: 'all',
        actions: [
          { id: `action_date_${Date.now()}_1`, type: 'showMessage', message: '结束日期若早于开始日期，请清空后重新选择', level: 'warning' },
          { id: `action_date_${Date.now()}_2`, type: 'setValue', targetField: relatedDateField, valueSource: 'static', value: '' },
        ],
        scope: 'current-form',
        enabled: true,
        priority: 10,
      }]);
      return;
    }
    if (preset === 'booking-clear') {
      onChange([...rules, {
        id: `rule_date_${Date.now()}`,
        name: '切换日期后清空预约时间',
        trigger: { eventName, sourceField: targetField },
        conditions: [],
        conditionMode: 'all',
        actions: [
          { id: `action_date_${Date.now()}_1`, type: 'setValue', targetField: relatedDateField, valueSource: 'static', value: '' },
          { id: `action_date_${Date.now()}_2`, type: 'showMessage', message: '日期已变化，预约时间已清空', level: 'info' },
        ],
        scope: 'current-form',
        enabled: true,
        priority: 10,
      }]);
      return;
    }
    onChange([...rules, {
      id: `rule_date_${Date.now()}`,
      name: '默认日期提示',
      trigger: { eventName, sourceField: targetField },
      conditions: [],
      conditionMode: 'all',
      actions: [
        { id: `action_date_${Date.now()}_1`, type: 'showMessage', message: '建议在控件属性 → 默认值向导中设置默认日期', level: 'info' },
      ],
      scope: 'current-form',
      enabled: true,
      priority: 10,
    }]);
  };

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
      {!!dateFieldOptions.length && (
        <div className="prop-linkage-section">
          <div className="prop-linkage-section-head">
            <strong>日期时间捷径</strong>
          </div>
          <div className="prop-linkage-row">
            <button type="button" onClick={() => appendDateShortcutRule('start-end')}>开始→结束清理</button>
            <button type="button" onClick={() => appendDateShortcutRule('booking-clear')}>日期切换清空预约</button>
            <button type="button" onClick={() => appendDateShortcutRule('deadline-default')}>默认日期提示</button>
          </div>
        </div>
      )}
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
                      { label: '刷新选项', value: 'setOptions' },
                      { label: '显示提示', value: 'showMessage' },
                      { label: '执行流程', value: 'runWorkflow' },
                    ]}
                    onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? {
                      ...item,
                      type: next as FormLinkageAction['type'],
                      ...(next === 'setOptions' && !item.optionsConfig ? { optionsConfig: { mode: 'table', table: tables[0]?.id || '', filterField: '', filterValueRef: { source: 'event' }, unique: true, sortOrder: 'none' } } : {}),
                    } : item))}
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

                {action.type === 'setOptions' && (
                  <div className="prop-linkage-grid">
                    <label className="prop-field">
                      <span>目标字段</span>
                      <AntdSelectInput
                        value={action.targetField || ''}
                        options={[{ label: '选择选项字段', value: '' }, ...optionFieldOptions]}
                        onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? { ...item, targetField: String(next) } : item))}
                      />
                    </label>
                    <label className="prop-field">
                      <span>来源类型</span>
                      <AntdSelectInput
                        value={action.optionsConfig?.mode || 'table'}
                        options={[{ label: '数据表字段', value: 'table' }, { label: '数据范围', value: 'range' }, { label: '静态映射', value: 'staticMap' }]}
                        onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id ? {
                          ...item,
                          optionsConfig: next === 'range'
                            ? { mode: 'range', rangeRef: null as any, labelColumn: 0, valueColumn: 0, filterValueRef: { source: 'event' }, unique: true, sortOrder: 'none' }
                            : next === 'staticMap'
                              ? { mode: 'staticMap', mapping: {}, valueRef: { source: 'event' } }
                              : { mode: 'table', table: tables[0]?.id || '', filterField: '', filterValueRef: { source: 'event' }, unique: true, sortOrder: 'none' },
                        } : item))}
                      />
                    </label>
                    {action.optionsConfig?.mode === 'table' && (
                      <>
                        <label className="prop-field">
                          <span>数据表</span>
                          <AntdSelectInput
                            value={action.optionsConfig.table || ''}
                            options={tables.map((table) => ({ label: table.fileName, value: table.id }))}
                            onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id && item.optionsConfig?.mode === 'table' ? { ...item, optionsConfig: { ...item.optionsConfig, table: String(next) } } : item))}
                          />
                        </label>
                        <label className="prop-field">
                          <span>过滤字段</span>
                          <AntdTextInput
                            value={action.optionsConfig.filterField || ''}
                            onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id && item.optionsConfig?.mode === 'table' ? { ...item, optionsConfig: { ...item.optionsConfig, filterField: next } } : item))}
                          />
                        </label>
                        <label className="prop-field">
                          <span>过滤值来源</span>
                          <AntdSelectInput
                            value={action.optionsConfig.filterValueRef?.source || 'event'}
                            options={[{ label: '当前事件值', value: 'event' }, { label: '其他字段值', value: 'field' }, { label: '静态值', value: 'static' }]}
                            onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id && item.optionsConfig?.mode === 'table' ? { ...item, optionsConfig: { ...item.optionsConfig, filterValueRef: { source: next as 'event' | 'field' | 'static', field: item.optionsConfig.filterValueRef?.field, value: item.optionsConfig.filterValueRef?.value } } } : item))}
                          />
                        </label>
                        {action.optionsConfig.filterValueRef?.source === 'field' ? (
                          <label className="prop-field"><span>来源字段</span><AntdSelectInput value={action.optionsConfig.filterValueRef?.field || ''} options={fields.map((field) => ({ label: field, value: field }))} onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id && item.optionsConfig?.mode === 'table' ? { ...item, optionsConfig: { ...item.optionsConfig, filterValueRef: { source: 'field', field: String(next), value: item.optionsConfig.filterValueRef?.value } } } : item))} /></label>
                        ) : action.optionsConfig.filterValueRef?.source === 'static' ? (
                          <label className="prop-field"><span>静态值</span><AntdTextInput value={String(action.optionsConfig.filterValueRef?.value ?? '')} onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id && item.optionsConfig?.mode === 'table' ? { ...item, optionsConfig: { ...item.optionsConfig, filterValueRef: { source: 'static', field: item.optionsConfig.filterValueRef?.field, value: next } } } : item))} /></label>
                        ) : null}
                        <label className="prop-field"><span>显示字段</span><AntdTextInput value={action.optionsConfig.labelField || ''} onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id && item.optionsConfig?.mode === 'table' ? { ...item, optionsConfig: { ...item.optionsConfig, labelField: next } } : item))} /></label>
                        <label className="prop-field"><span>值字段</span><AntdTextInput value={action.optionsConfig.valueField || ''} onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id && item.optionsConfig?.mode === 'table' ? { ...item, optionsConfig: { ...item.optionsConfig, valueField: next } } : item))} /></label>
                      </>
                    )}
                    {action.optionsConfig?.mode === 'range' && (
                      <>
                        <div className="prop-field"><span>数据范围</span><button type="button" onClick={() => setRangeActionTarget(action.id)}>{action.optionsConfig.rangeRef ? `已选择 · ${rangeToAddress(action.optionsConfig.rangeRef)}` : '选择范围'}</button></div>
                        <label className="prop-field"><span>显示列</span><AntdNumberInput value={action.optionsConfig.labelColumn ?? 0} onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id && item.optionsConfig?.mode === 'range' ? { ...item, optionsConfig: { ...item.optionsConfig, labelColumn: Number(next) || 0 } } : item))} /></label>
                        <label className="prop-field"><span>值列</span><AntdNumberInput value={action.optionsConfig.valueColumn ?? 0} onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id && item.optionsConfig?.mode === 'range' ? { ...item, optionsConfig: { ...item.optionsConfig, valueColumn: Number(next) || 0 } } : item))} /></label>
                        <label className="prop-field"><span>过滤列</span><AntdNumberInput value={action.optionsConfig.filterColumn ?? ''} onChange={(next) => updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id && item.optionsConfig?.mode === 'range' ? { ...item, optionsConfig: { ...item.optionsConfig, filterColumn: next === '' ? undefined : Number(next) } } : item))} /></label>
                      </>
                    )}
                    {action.optionsConfig?.mode === 'staticMap' && (
                      <label className="prop-field" style={{ gridColumn: '1 / -1' }}>
                        <span>静态映射 JSON</span>
                        <AntdTextAreaInput
                          rows={6}
                          value={JSON.stringify(action.optionsConfig.mapping || {}, null, 2)}
                          onChange={(next) => {
                            try {
                              const mapping = JSON.parse(next);
                              updateActions(rule.id, (actions) => actions.map((item) => item.id === action.id && item.optionsConfig?.mode === 'staticMap' ? { ...item, optionsConfig: { ...item.optionsConfig, mapping } } : item));
                            } catch { /* keep draft only after valid JSON */ }
                          }}
                        />
                      </label>
                    )}
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
      {rangeActionTarget && (
        <RangeSelector
          tables={tables}
          value={activeRangeConfig && activeRangeConfig.mode === 'range' ? activeRangeConfig.rangeRef : null}
          onConfirm={(ref) => {
            onChange(rules.map((rule) => ({
              ...rule,
              actions: rule.actions.map((action) => action.id === rangeActionTarget && action.optionsConfig?.mode === 'range'
                ? { ...action, optionsConfig: { ...action.optionsConfig, rangeRef: ref } }
                : action),
            })));
            setRangeActionTarget(null);
          }}
          onCancel={() => setRangeActionTarget(null)}
        />
      )}
    </div>
  );
}
