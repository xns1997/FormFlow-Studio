import React, { Suspense, lazy, useState } from 'react';
import Modal, { ModalFooter, ModalHeader } from '../../components/Modal';
import { jsonSuggestions } from '../../components/codeEditorSuggestions';
import { extractPropertyReferences } from '../../services/engine/propertyDependencies';
import { compileRegex } from '../../services/engine/regexTester';
import { isCompositePropDef } from '../types';
import { PropertyFieldActions } from './PropertyFieldActions';
import type { PropertyEditorContext } from './propertyEditorRegistry';
import { getPropertyEditorDescriptor } from './propertyEditorRegistry';
import { VisualPropertyEditor } from './visuals/VisualPropertyEditor';

const LazyCodeEditor = lazy(() => import('../../components/CodeEditor'));
type DraftMode = 'visual' | 'source';

function cloneValue<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function initialValue(context: PropertyEditorContext) {
  if (isCompositePropDef(context.def)) return Object.fromEntries(context.def.keys.map((key) => [key, context.values[key]]));
  return context.value ?? context.def.default ?? (String(context.def.type).includes('[]') || context.def.type === 'array' ? [] : context.def.type === 'object' ? {} : '');
}

function summarize(value: unknown, kind: string) {
  if (kind === 'regex') return value ? `/${String(value)}/` : '未配置';
  if (kind === 'expression' || kind === 'template') return value ? String(value).slice(0, 36) : '未配置';
  if (Array.isArray(value)) return value.length ? `${value.length} 项` : '未配置';
  if (value && typeof value === 'object') {
    const count = Object.values(value).filter((item) => item !== '' && item !== undefined && item !== null && item !== 0).length;
    return count ? `${count} 项约束` : '未配置';
  }
  return value === '' || value === undefined || value === null ? '未配置' : String(value);
}

export function ComplexPropertyEditor(context: PropertyEditorContext & { kind: string }) {
  const { def, kind } = context;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DraftMode>('visual');
  const [draft, setDraft] = useState<unknown>(() => cloneValue(initialValue(context)));
  const [source, setSource] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [visualValid, setVisualValid] = useState(true);
  const [applyError, setApplyError] = useState('');
  const descriptor = getPropertyEditorDescriptor(kind);
  const effectiveValue = isCompositePropDef(def) ? Object.fromEntries(def.keys.map((key) => [key, context.values[key]])) : context.value;

  const resetDraft = () => {
    const next = cloneValue(initialValue(context));
    setDraft(next); setSource(JSON.stringify(next, null, 2)); setSourceError(''); setVisualValid(true); setMode('visual');
  };
  const launch = () => { resetDraft(); setOpen(true); };
  const switchMode = (next: DraftMode) => {
    if (next === 'source' && !sourceError) setSource(typeof draft === 'string' && ['regex', 'expression', 'template'].includes(kind) ? draft : JSON.stringify(draft, null, 2));
    setMode(next);
  };
  const sourceLanguage = ['regex', 'expression', 'template'].includes(kind) ? 'plaintext' : 'json';
  const apply = () => {
    const normalized = descriptor?.normalize ? descriptor.normalize(draft, context) : draft;
    const error = descriptor?.validate?.(normalized, context) || '';
    if (error) { setApplyError(error); return; }
    if (isCompositePropDef(def)) context.onPatch(normalized && typeof normalized === 'object' ? normalized as Record<string, unknown> : {});
    else context.onChange(normalized);
    setOpen(false);
  };
  const valid = mode === 'source' ? !sourceError : visualValid;
  const title = `${def.label}配置`;
  const impactFields = typeof draft === 'string' ? extractPropertyReferences(draft) : [];
  const impactCount = Array.isArray(draft) ? draft.length : draft && typeof draft === 'object' ? Object.values(draft).filter((item) => item !== undefined && item !== null && item !== '').length : draft === undefined || draft === null || draft === '' ? 0 : 1;

  return <div className="prop-field property-summary-field">
    <div className="property-summary-label"><span>{def.label}</span>{def.help && <small title={def.help}>?</small>}<PropertyFieldActions context={context} /></div>
    <button type="button" className="property-summary-button" aria-label={`配置${def.label}`} disabled={context.disabled} onClick={launch}><span>{descriptor?.summarize?.(effectiveValue, context) || summarize(effectiveValue, kind)}</span><b>配置</b></button>
    {open && <Modal open onClose={() => setOpen(false)} width="min(920px, 94vw)" maxWidth="94vw" maxHeight="88vh" containerClassName="property-editor-modal">
      <ModalHeader title={title} onClose={() => setOpen(false)} />
      <div className="modal-body property-editor-modal-body">
        <div className="property-editor-topbar"><div><button type="button" className={mode === 'visual' ? 'active' : ''} onClick={() => switchMode('visual')}>可视化</button><button type="button" className={mode === 'source' ? 'active' : ''} onClick={() => switchMode('source')}>源码</button></div>{def.help && <p>{def.help}</p>}</div>
        <div className="property-impact-summary" aria-live="polite"><span>将更新 <b>{def.label}</b></span><span>{impactCount} 项配置</span>{impactFields.length > 0 && <span>关联 {impactFields.length} 个字段</span>}<span className={valid ? 'valid' : 'invalid'}>{valid ? '可以应用' : '需要修正'}</span></div>
        {mode === 'visual' ? <VisualPropertyEditor kind={kind} draft={draft} context={context} setDraft={(next) => { setDraft(next); setApplyError(''); }} setValid={setVisualValid} /> : <div className="property-source-editor"><Suspense fallback={<div className="property-editor-loading">正在加载源码编辑器…</div>}><LazyCodeEditor value={source} onChange={(next) => {
          setSource(next);
          if (sourceLanguage === 'plaintext') { setDraft(next); setSourceError(kind === 'regex' ? compileRegex(next) || '' : ''); return; }
          try { setDraft(JSON.parse(next)); setSourceError(''); } catch (error) { setSourceError(error instanceof Error ? error.message : String(error)); }
        }} language={sourceLanguage} title={title} theme="light" height={460} minHeight={320} lineNumbers suggestions={sourceLanguage === 'json' ? jsonSuggestions : undefined} compact fullscreen /></Suspense>{sourceError && <div className="property-editor-error">源码无效：{sourceError}</div>}</div>}{applyError && <div className="property-editor-error">配置无效：{applyError}</div>}
      </div>
      <ModalFooter><button type="button" className="toolbar-btn" onClick={() => setOpen(false)}>取消</button><button type="button" className="toolbar-btn primary" disabled={!valid} onClick={apply}>应用</button></ModalFooter>
    </Modal>}
  </div>;
}
