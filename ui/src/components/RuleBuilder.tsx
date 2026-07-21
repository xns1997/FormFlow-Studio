// 可视化规则构建器 — 触发器/条件/动作 UI，与代码双向同步

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { AntdCompatSelect } from './AntdFormControls';
import type { EventFieldDescriptor } from './codeEditorSuggestions';

// ── 类型定义 ──────────────────────────────────────────

export interface RuleConfig {
  trigger: { type: string; fieldName?: string };
  conditions: Array<{ field: string; operator: string; value: string; logic: 'AND' | 'OR' }>;
  actions: Array<{ type: string; target: string; value: string }>;
}

interface RuleBuilderProps {
  code: string;
  eventName: string;
  fields: EventFieldDescriptor[];
  onChange: (code: string) => void;
}

const TRIGGER_TYPES = [
  // 基础事件
  { value: 'onFormLoad', label: '表单加载' },
  { value: 'onFormReady', label: '表单就绪' },
  { value: 'onFormReset', label: '表单重置' },
  { value: 'onRowLoad', label: '行加载' },
  { value: 'onRowSelect', label: '行选择' },
  { value: 'onRowAdd', label: '新增行' },
  { value: 'onRowDelete', label: '删除行' },
  { value: 'onFieldChange', label: '字段变化' },
  { value: 'onFieldBlur', label: '字段失焦' },
  { value: 'onFieldFocus', label: '字段聚焦' },
  { value: 'onFieldKeyDown', label: '按键' },
  { value: 'onFieldPaste', label: '粘贴' },
  { value: 'onFieldClear', label: '清空字段' },
  { value: 'onValueChange', label: '值变化' },
  { value: 'onButtonClick', label: '按钮点击' },
  { value: 'onBeforeSubmit', label: '提交前' },
  { value: 'onSubmit', label: '提交' },
  { value: 'onSubmitSuccess', label: '提交成功' },
  { value: 'onSubmitError', label: '提交失败' },
  { value: 'onValidate', label: '校验' },
  { value: 'onDataImport', label: '数据导入' },
  { value: 'onDataExport', label: '数据导出' },
  { value: 'onDataSourceChange', label: '数据源变化' },
  { value: 'onTabChange', label: 'Tab 切换' },
];

const CONDITION_OPERATORS = [
  { value: '==', label: '等于' },
  { value: '!=', label: '不等于' },
  { value: '>', label: '大于' },
  { value: '<', label: '小于' },
  { value: '>=', label: '大于等于' },
  { value: '<=', label: '小于等于' },
  { value: 'contains', label: '包含' },
  { value: 'isEmpty', label: '为空' },
  { value: 'isNotEmpty', label: '不为空' },
];

const ACTION_TYPES = [
  { value: 'setValue', label: '设置值', needsTarget: true, needsValue: true },
  { value: 'clearValue', label: '清空值', needsTarget: true, needsValue: false },
  { value: 'setVisible', label: '显示', needsTarget: true, needsValue: false },
  { value: 'setHidden', label: '隐藏', needsTarget: true, needsValue: false },
  { value: 'setEnabled', label: '启用', needsTarget: true, needsValue: false },
  { value: 'setDisabled', label: '禁用', needsTarget: true, needsValue: false },
  { value: 'setRequired', label: '设为必填', needsTarget: true, needsValue: false },
  { value: 'setOptional', label: '取消必填', needsTarget: true, needsValue: false },
  { value: 'showMessage', label: '显示提示', needsTarget: false, needsValue: true },
];

// ── 代码解析 ──────────────────────────────────────────

function parseCodeToRule(code: string, eventName: string): RuleConfig {
  const rule: RuleConfig = {
    trigger: { type: eventName },
    conditions: [],
    actions: [],
  };

  // 解析 getValue 调用作为条件
  const getValuePattern = /ctx\.getValue\(['"]([^'"]+)['"]\)/g;
  let match;
  while ((match = getValuePattern.exec(code)) !== null) {
    // 检查是否在条件上下文中
    const lineStart = code.lastIndexOf('\n', match.index) + 1;
    const lineEnd = code.indexOf('\n', match.index);
    const line = code.slice(lineStart, lineEnd === -1 ? code.length : lineEnd).trim();
    if (line.includes('===') || line.includes('==') || line.includes('!==') || line.includes('!=')) {
      const opMatch = line.match(/(===?|!==?|[><]=?)\s*['"]?([^'";\s]+)['"]?/);
      if (opMatch) {
        rule.conditions.push({
          field: match[1],
          operator: opMatch[1] === '===' ? '==' : opMatch[1] === '!==' ? '!=' : opMatch[1],
          value: opMatch[2].replace(/['"]/g, ''),
          logic: 'AND',
        });
      }
    }
  }

  // 解析 setValue 调用
  const setValuePattern = /ctx\.setValue\(['"]([^'"]+)['"],\s*([^)]+)\)/g;
  while ((match = setValuePattern.exec(code)) !== null) {
    rule.actions.push({
      type: 'setValue',
      target: match[1],
      value: match[2].replace(/['"]/g, '').trim(),
    });
  }

  // 解析 setVisible 调用
  const setVisiblePattern = /ctx\.setVisible\(['"]([^'"]+)['"],\s*(true|false)\)/g;
  while ((match = setVisiblePattern.exec(code)) !== null) {
    rule.actions.push({
      type: match[2] === 'true' ? 'setVisible' : 'setHidden',
      target: match[1],
      value: '',
    });
  }

  // 解析 setDisabled 调用
  const setDisabledPattern = /ctx\.setDisabled\(['"]([^'"]+)['"],\s*(true|false)\)/g;
  while ((match = setDisabledPattern.exec(code)) !== null) {
    rule.actions.push({
      type: match[2] === 'true' ? 'setDisabled' : 'setEnabled',
      target: match[1],
      value: '',
    });
  }

  // 解析 showMessage 调用
  const showMessagePattern = /ctx\.showMessage\(['"]([^'"]+)['"]/g;
  while ((match = showMessagePattern.exec(code)) !== null) {
    rule.actions.push({
      type: 'showMessage',
      target: '',
      value: match[1],
    });
  }

  return rule;
}

function ruleToCode(rule: RuleConfig): string {
  const lines: string[] = [];
  lines.push(`// ${TRIGGER_TYPES.find((t) => t.value === rule.trigger.type)?.label || rule.trigger.type}`);

  // 读取值
  const allFields = new Set<string>();
  rule.conditions.forEach((c) => allFields.add(c.field));
  rule.actions.forEach((a) => { if (a.target) allFields.add(a.target); });

  allFields.forEach((field) => {
    lines.push(`const ${field} = ctx.getValue('${field}');`);
  });

  // 条件
  if (rule.conditions.length > 0) {
    const condParts = rule.conditions.map((c) => {
      if (c.operator === 'isEmpty') return `!${c.field}`;
      if (c.operator === 'isNotEmpty') return `!!${c.field}`;
      return `${c.field} ${c.operator === '==' ? '===' : c.operator === '!=' ? '!==' : c.operator} '${c.value}'`;
    });
    lines.push('');
    lines.push(`if (${condParts.join(' && ')}) {`);

    // 动作（带缩进）
    rule.actions.forEach((a) => {
      lines.push('  ' + generateActionCode(a));
    });

    lines.push('}');
  } else {
    // 无条件，直接执行动作
    lines.push('');
    rule.actions.forEach((a) => {
      lines.push(generateActionCode(a));
    });
  }

  return lines.join('\n');
}

function generateActionCode(action: { type: string; target: string; value: string }): string {
  switch (action.type) {
    case 'setValue': return `ctx.setValue('${action.target}', '${action.value}');`;
    case 'clearValue': return `ctx.setValue('${action.target}', '');`;
    case 'setVisible': return `ctx.setVisible('${action.target}', true);`;
    case 'setHidden': return `ctx.setVisible('${action.target}', false);`;
    case 'setEnabled': return `ctx.setDisabled('${action.target}', false);`;
    case 'setDisabled': return `ctx.setDisabled('${action.target}', true);`;
    case 'setRequired': return `ctx.setRequired('${action.target}', true);`;
    case 'setOptional': return `ctx.setRequired('${action.target}', false);`;
    case 'showMessage': return `ctx.showMessage('${action.value}', 'info');`;
    default: return `// ${action.type}`;
  }
}

// ── 组件 ──────────────────────────────────────────────

export default function RuleBuilder({ code, eventName, fields, onChange }: RuleBuilderProps) {
  const [rule, setRule] = useState<RuleConfig>(() => parseCodeToRule(code, eventName));
  const [isSyncing, setIsSyncing] = useState(false);

  // 代码变化时解析为规则
  useEffect(() => {
    if (isSyncing) return;
    setRule(parseCodeToRule(code, eventName));
  }, [code, eventName]);

  // 规则变化时生成代码
  const updateRule = useCallback((updater: (prev: RuleConfig) => RuleConfig) => {
    setRule((prev) => {
      const next = updater(prev);
      setIsSyncing(true);
      onChange(ruleToCode(next));
      setTimeout(() => setIsSyncing(false), 100);
      return next;
    });
  }, [onChange]);

  const fieldNames = useMemo(() => fields.map((f) => f.name), [fields]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, fontSize: 12 }}>
      {/* 触发器 */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>触发器</div>
        <AntdCompatSelect
          value={rule.trigger.type}
          onChange={(e) => updateRule((prev) => ({ ...prev, trigger: { ...prev.trigger, type: e.target.value } }))}
          style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--panel)' }}
        >
          {TRIGGER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </AntdCompatSelect>
      </div>

      {/* 条件 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>条件</span>
          <button type="button"
            onClick={() => updateRule((prev) => ({
              ...prev,
              conditions: [...prev.conditions, { field: fieldNames[0] || '', operator: '==', value: '', logic: 'AND' }],
            }))}
            style={{ padding: '2px 8px', fontSize: 10, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel)', cursor: 'pointer' }}
          >
            + 添加
          </button>
        </div>
        {rule.conditions.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 0' }}>无条件（直接执行动作）</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rule.conditions.map((cond, i) => (
              <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {i > 0 && (
                  <AntdCompatSelect
                    value={cond.logic}
                    onChange={(e) => updateRule((prev) => {
                      const conds = [...prev.conditions];
                      conds[i] = { ...conds[i], logic: e.target.value as 'AND' | 'OR' };
                      return { ...prev, conditions: conds };
                    })}
                    style={{ padding: '4px', fontSize: 10, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel-soft)', width: 48 }}
                  >
                    <option value="AND">且</option>
                    <option value="OR">或</option>
                  </AntdCompatSelect>
                )}
                <AntdCompatSelect
                  value={cond.field}
                  onChange={(e) => updateRule((prev) => {
                    const conds = [...prev.conditions];
                    conds[i] = { ...conds[i], field: e.target.value };
                    return { ...prev, conditions: conds };
                  })}
                  style={{ flex: 1, padding: '4px 6px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel)' }}
                >
                  {fieldNames.map((f) => <option key={f} value={f}>{f}</option>)}
                </AntdCompatSelect>
                <AntdCompatSelect
                  value={cond.operator}
                  onChange={(e) => updateRule((prev) => {
                    const conds = [...prev.conditions];
                    conds[i] = { ...conds[i], operator: e.target.value };
                    return { ...prev, conditions: conds };
                  })}
                  style={{ width: 80, padding: '4px 6px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel)' }}
                >
                  {CONDITION_OPERATORS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                </AntdCompatSelect>
                {!['isEmpty', 'isNotEmpty'].includes(cond.operator) && (
                  <input
                    type="text"
                    value={cond.value}
                    onChange={(e) => updateRule((prev) => {
                      const conds = [...prev.conditions];
                      conds[i] = { ...conds[i], value: e.target.value };
                      return { ...prev, conditions: conds };
                    })}
                    placeholder="值"
                    style={{ flex: 1, padding: '4px 6px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel)' }}
                  />
                )}
                <button type="button"
                  onClick={() => updateRule((prev) => ({ ...prev, conditions: prev.conditions.filter((_, j) => j !== i) }))}
                  style={{ padding: '2px 6px', fontSize: 12, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 动作 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>动作</span>
          <button type="button"
            onClick={() => updateRule((prev) => ({
              ...prev,
              actions: [...prev.actions, { type: 'setValue', target: fieldNames[0] || '', value: '' }],
            }))}
            style={{ padding: '2px 8px', fontSize: 10, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel)', cursor: 'pointer' }}
          >
            + 添加
          </button>
        </div>
        {rule.actions.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 0' }}>无动作</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rule.actions.map((action, i) => {
              const actionType = ACTION_TYPES.find((a) => a.value === action.type);
              return (
                <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <AntdCompatSelect
                    value={action.type}
                    onChange={(e) => updateRule((prev) => {
                      const acts = [...prev.actions];
                      acts[i] = { ...acts[i], type: e.target.value };
                      return { ...prev, actions: acts };
                    })}
                    style={{ width: 90, padding: '4px 6px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel)' }}
                  >
                    {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </AntdCompatSelect>
                  {actionType?.needsTarget !== false && (
                    <AntdCompatSelect
                      value={action.target}
                      onChange={(e) => updateRule((prev) => {
                        const acts = [...prev.actions];
                        acts[i] = { ...acts[i], target: e.target.value };
                        return { ...prev, actions: acts };
                      })}
                      style={{ flex: 1, padding: '4px 6px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel)' }}
                    >
                      {fieldNames.map((f) => <option key={f} value={f}>{f}</option>)}
                    </AntdCompatSelect>
                  )}
                  {actionType?.needsValue !== false && (
                    <input
                      type="text"
                      value={action.value}
                      onChange={(e) => updateRule((prev) => {
                        const acts = [...prev.actions];
                        acts[i] = { ...acts[i], value: e.target.value };
                        return { ...prev, actions: acts };
                      })}
                      placeholder="值"
                      style={{ flex: 1, padding: '4px 6px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel)' }}
                    />
                  )}
                  <button type="button"
                    onClick={() => updateRule((prev) => ({ ...prev, actions: prev.actions.filter((_, j) => j !== i) }))}
                    style={{ padding: '2px 6px', fontSize: 12, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 预览 */}
      {rule.conditions.length > 0 || rule.actions.length > 0 ? (
        <div style={{ marginTop: 4, padding: 8, background: 'var(--panel-soft)', borderRadius: 6, fontSize: 11, color: 'var(--muted)' }}>
          <span style={{ fontWeight: 600 }}>预览：</span>
          当「{TRIGGER_TYPES.find((t) => t.value === rule.trigger.type)?.label}」
          {rule.conditions.length > 0 && <> 且 {rule.conditions.map((c, i) => <span key={i}>{i > 0 ? ` ${c.logic === 'AND' ? '且' : '或'} ` : ''}「{c.field}」{CONDITION_OPERATORS.find((o) => o.value === c.operator)?.label}{c.value ? ` "${c.value}"` : ''}</span>)}</>}
          {rule.actions.length > 0 && <> 则 {rule.actions.map((a, i) => <span key={i}>{i > 0 ? '，' : ''}{ACTION_TYPES.find((t) => t.value === a.type)?.label}{a.target ? `「${a.target}」` : ''}{a.value ? ` "${a.value}"` : ''}</span>)}</>}
        </div>
      ) : null}
    </div>
  );
}
