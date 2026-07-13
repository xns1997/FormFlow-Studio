import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { AutoComplete } from 'antd';
import {
  AntdColorInput, AntdDateInput, AntdNumberInput, AntdSelectInput, AntdSwitchInput,
  AntdTextAreaInput, AntdTextInput, AntdTimeInput,
} from '../../components/AntdFormControls';
import type { PropDef, PropertyEditorKind } from '../types';
import {
  getPropertyEditor, getPropertyEditorDescriptor, registerPropertyEditor, resolvePropertyEditorKind,
  type PropertyEditorComponent, type PropertyEditorContext,
} from './propertyEditorRegistry';
import { PropertyFieldActions } from './PropertyFieldActions';

function scalarDef(context: PropertyEditorContext): PropDef {
  return context.def as PropDef;
}

function validateSchemaValue(def: PropDef, value: unknown) {
  const rule = def.validation;
  if (!rule) return '';
  const text = String(value ?? '');
  if (rule.required && !text) return rule.message || '此项不能为空';
  if (rule.minLength !== undefined && text.length < rule.minLength) return rule.message || `至少 ${rule.minLength} 个字符`;
  if (rule.maxLength !== undefined && text.length > rule.maxLength) return rule.message || `最多 ${rule.maxLength} 个字符`;
  if (rule.min !== undefined && Number(value) < rule.min) return rule.message || `不能小于 ${rule.min}`;
  if (rule.max !== undefined && Number(value) > rule.max) return rule.message || `不能大于 ${rule.max}`;
  if (rule.pattern && text) { try { if (!new RegExp(rule.pattern).test(text)) return rule.message || '格式不正确'; } catch { return rule.message || '校验表达式无效'; } }
  return '';
}

function FieldShell({ context, children }: { context: PropertyEditorContext; children: React.ReactNode }) {
  return <div className="prop-field"><div className="property-field-heading"><span>{context.def.label}</span><PropertyFieldActions context={context} /></div>{children}{context.def.help && <small className="prop-field-help">{context.def.help}</small>}</div>;
}

function useCommittedDraft<T>(external: T, commit: (value: T) => void, validate?: (value: T) => string) {
  const [draft, setDraft] = useState(external);
  const [error, setError] = useState('');
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(external); }, [external]);
  return {
    draft,
    setDraft: (value: T) => { setDraft(value); setError(''); },
    error,
    focus: () => { focused.current = true; },
    commit: () => { focused.current = false; const nextError = validate?.(draft) || ''; setError(nextError); if (!nextError && !Object.is(draft, external)) commit(draft); },
  };
}

const TextEditor: PropertyEditorComponent = (context) => {
  const value = String(context.value ?? scalarDef(context).default ?? '');
  const state = useCommittedDraft(value, context.onChange, (next) => validateSchemaValue(scalarDef(context), next));
  return <FieldShell context={context}><AntdTextInput value={state.draft} placeholder={scalarDef(context).placeholder} disabled={context.disabled} onFocus={state.focus} onChange={state.setDraft} onBlur={state.commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />{state.error && <small className="property-inline-error">{state.error}</small>}</FieldShell>;
};
const TextareaEditor: PropertyEditorComponent = (context) => {
  const value = String(context.value ?? scalarDef(context).default ?? '');
  const state = useCommittedDraft(value, context.onChange, (next) => validateSchemaValue(scalarDef(context), next));
  return <FieldShell context={context}><AntdTextAreaInput value={state.draft} placeholder={scalarDef(context).placeholder} disabled={context.disabled} rows={4} onFocus={state.focus} onChange={state.setDraft} onBlur={state.commit} />{state.error && <small className="property-inline-error">{state.error}</small>}</FieldShell>;
};
const NumberEditor: PropertyEditorComponent = (context) => {
  const def = scalarDef(context);
  const value = context.value as number ?? def.default ?? '';
  const state = useCommittedDraft<number | string>(value, (next) => context.onChange(next === '' ? '' : Number(next)), (next) => validateSchemaValue(def, next));
  return <FieldShell context={context}><AntdNumberInput value={state.draft} min={def.min} max={def.max} step={def.step} disabled={context.disabled} onFocus={state.focus} onChange={state.setDraft} onBlur={state.commit} />{state.error && <small className="property-inline-error">{state.error}</small>}</FieldShell>;
};
const SwitchEditor: PropertyEditorComponent = (context) => <div className="prop-field property-toggle-field">
  <div className="property-toggle-label"><span>{context.def.label}</span>{context.def.help && <small title={context.def.help}>?</small>}</div>
  <div className="property-toggle-control"><PropertyFieldActions context={context} /><AntdSwitchInput checked={!!context.value} disabled={context.disabled} onChange={context.onChange} /></div>
</div>;
const SelectEditor: PropertyEditorComponent = (context) => { const def = scalarDef(context); return <FieldShell context={context}><AntdSelectInput value={context.value as string ?? def.default ?? ''} options={def.options || []} disabled={context.disabled} onChange={context.onChange} /></FieldShell>; };
const ColorEditor: PropertyEditorComponent = (context) => <div className="prop-field property-compact-field">
  <div className="property-compact-label"><span>{context.def.label}</span>{context.def.help && <small title={context.def.help}>?</small>}</div>
  <div className="property-compact-control"><PropertyFieldActions context={context} /><AntdColorInput value={String(context.value ?? '#000000')} disabled={context.disabled} onChange={context.onChange} /></div>
</div>;
const DateEditor: PropertyEditorComponent = (context) => { const def = scalarDef(context); return <FieldShell context={context}><AntdDateInput value={String(context.value ?? '')} placeholder={def.placeholder} disabled={context.disabled} showTime={resolvePropertyEditorKind(def) === 'datetime'} onChange={context.onChange} /></FieldShell>; };
const TimeEditor: PropertyEditorComponent = (context) => { const def = scalarDef(context); return <FieldShell context={context}><AntdTimeInput value={String(context.value ?? '')} placeholder={def.placeholder} disabled={context.disabled} onChange={context.onChange} /></FieldShell>; };
const FieldPathEditor: PropertyEditorComponent = (context) => {
  const state = useCommittedDraft(String(context.value ?? ''), context.onChange);
  const options = (context.fieldCatalog || context.fields.map((path) => ({ path, label: path, type: 'unknown' as const, source: 'context' as const, sourceLabel: undefined }))).map((field) => ({ label: `${field.label} · ${field.type}${field.sourceLabel ? ` · ${field.sourceLabel}` : ''}`, value: field.path }));
  return <FieldShell context={context}><AutoComplete className="ff-antd-control" value={state.draft} options={options} disabled={context.disabled} allowClear filterOption={(input, option) => `${option?.value || ''} ${option?.label || ''}`.toLowerCase().includes(input.toLowerCase())} placeholder={scalarDef(context).placeholder || '输入或搜索字段路径'} onFocus={state.focus} onBlur={state.commit} onChange={state.setDraft} onSelect={(value) => context.onChange(value)} /></FieldShell>;
};
const UrlEditor: PropertyEditorComponent = (context) => {
  const external = String(context.value ?? '');
  const [url, setUrl] = useState(external);
  useEffect(() => setUrl(external), [external]);
  const valid = !url || /^https?:\/\/[^\s]+$/i.test(url);
  const image = /\.(?:png|jpe?g|gif|webp|svg)(?:\?|$)/i.test(url);
  return <div className="prop-field"><span className="property-field-heading"><span>{context.def.label}</span><PropertyFieldActions context={context} /></span><AntdTextInput value={url} placeholder="https://" disabled={context.disabled} onChange={setUrl} onBlur={() => { if (valid && url !== external) context.onChange(url); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />{!valid && <small className="property-inline-error">请输入 HTTP(S) 地址；无效内容不会覆盖当前配置</small>}{valid && !!url && <>{image && <img className="prop-url-image-preview" src={url} alt="URL 预览" />}<a className="prop-url-preview" href={url} target="_blank" rel="noreferrer">测试链接 ↗</a></>}</div>;
};
const IconEditor: PropertyEditorComponent = (context) => { const icons = ['✓', '＋', '✎', '🔍', '📎', '🖼️', '🚀', '⚙️', '📊', '↗']; return <FieldShell context={context}><div className="prop-icon-editor"><span>{String(context.value || '◻︎')}</span><AntdTextInput value={String(context.value ?? '')} placeholder="搜索或输入 emoji" disabled={context.disabled} onChange={context.onChange} /></div><div className="prop-icon-presets">{icons.map((icon) => <button key={icon} type="button" title={`选择 ${icon}`} onClick={() => context.onChange(icon)}>{icon}</button>)}</div></FieldShell>; };

const complexKinds = new Set<PropertyEditorKind>([
  'json', 'regex', 'validation-rules', 'number-range', 'date-range', 'selection-range', 'options',
  'string-list', 'table-columns', 'key-value', 'mapping', 'filters', 'sorting', 'expression', 'template',
  'typography', 'spacing', 'border', 'radius', 'shadow', 'opacity', 'dimension', 'upload-constraints',
  'tabs', 'steps', 'data-binding',
]);

function summarizeComplex(value: unknown, kind: string) {
  if (value === undefined || value === null || value === '') return '未配置';
  if (kind === 'regex') return `/${String(value)}/`;
  if (kind === 'expression' || kind === 'template') return String(value).slice(0, 36);
  if (kind === 'data-binding' && value && typeof value === 'object') {
    const binding = value as any; const source = binding.source || {};
    const sourceText = source.kind === 'formField' ? source.path : source.kind === 'range' ? `${source.ref?.sheetName || '范围'}` : source.kind === 'tableCell' ? `${source.sheetName || '工作表'}.${source.column || '列'}` : '未配置';
    return `${sourceText} · ${binding.direction || 'dataToUi'}`;
  }
  if (Array.isArray(value)) return value.length ? `${value.length} 项` : '未配置';
  if (typeof value === 'object') return `${Object.values(value).filter((item) => item !== undefined && item !== null && item !== '').length} 项配置`;
  return String(value);
}

let builtinsRegistered = false;
export function registerBuiltinPropertyEditors() {
  if (builtinsRegistered) return;
  builtinsRegistered = true;
  registerPropertyEditor('text', TextEditor);
  registerPropertyEditor('textarea', TextareaEditor);
  registerPropertyEditor('number', NumberEditor);
  registerPropertyEditor('switch', SwitchEditor);
  registerPropertyEditor('select', SelectEditor);
  registerPropertyEditor('color', ColorEditor);
  registerPropertyEditor('date', DateEditor);
  registerPropertyEditor('datetime', DateEditor);
  registerPropertyEditor('time', TimeEditor);
  registerPropertyEditor('field-path', FieldPathEditor);
  registerPropertyEditor('url', UrlEditor);
  registerPropertyEditor('icon', IconEditor);
  for (const kind of complexKinds) registerPropertyEditor({
    kind,
    load: () => import('./ComplexPropertyEditor').then(({ ComplexPropertyEditor }) => ({
      default: (context: PropertyEditorContext) => <ComplexPropertyEditor {...context} kind={kind} />,
    })),
    supportsSource: true,
    contextNeeds: ['fields', 'samples', 'dependencies', 'component'],
    normalize: (value) => value,
    summarize: (value) => summarizeComplex(value, kind),
    validate: (value) => {
      if (kind === 'regex') { try { new RegExp(String(value || '')); } catch (error) { return error instanceof Error ? error.message : String(error); } }
      if (['options', 'string-list', 'table-columns', 'filters', 'sorting', 'tabs', 'steps', 'validation-rules'].includes(kind) && !Array.isArray(value)) return '配置必须是列表';
      if (['key-value', 'mapping', 'data-binding'].includes(kind) && (!value || typeof value !== 'object' || Array.isArray(value))) return '配置必须是对象';
      if (kind === 'data-binding' && value && typeof value === 'object' && !Array.isArray(value)) {
        const binding = value as any; const source = binding.source;
        if (binding.version !== 1 || !source?.kind) return '绑定结构不完整';
        if (binding.direction !== 'dataToUi' && source.kind !== 'tableCell') return '只有表格单元格来源支持写回';
      }
      return null;
    },
  });
}

registerBuiltinPropertyEditors();

export function PropertyEditorField(context: PropertyEditorContext) {
  const kind = resolvePropertyEditorKind(context.def);
  const descriptor = getPropertyEditorDescriptor(kind) || getPropertyEditorDescriptor('json');
  let Editor = descriptor?.component || getPropertyEditor(kind) || getPropertyEditor('json');
  if (!Editor && descriptor?.load) {
    descriptor.lazyComponent ||= lazy(descriptor.load);
    Editor = descriptor.lazyComponent;
  }
  const Resolved = Editor || TextEditor;
  return <Suspense fallback={<div className="property-editor-loading" aria-live="polite">正在加载配置编辑器…</div>}><Resolved {...context} /></Suspense>;
}
