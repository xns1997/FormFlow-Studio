import React from 'react';
import type { DesignComponent, FormLinkageAction, FormLinkageCondition, FormLinkageRule, WorkflowFile } from '../../project/types';
import {
  AntdNumberInput,
  AntdSelectInput,
  AntdSwitchInput,
  AntdTextInput,
} from '../../components/AntdFormControls';
import { createDefaultLinkageCondition, createDefaultLinkageAction, createDefaultLinkageRule } from './utils';

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
