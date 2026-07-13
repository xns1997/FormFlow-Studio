import React from 'react';
import type { PropertyEditorContext } from '../propertyEditorRegistry';
import { ArrayRowsVisual, DataBindingVisual, KeyValueVisual, OptionsVisual, StringListVisual } from './CollectionPropertyEditors';
import { ExpressionVisual, RegexVisual, ValidationRulesVisual } from './LogicPropertyEditors';
import { CompositeVisual, ScalarStyleVisual } from './StylePropertyEditors';

export function VisualPropertyEditor({ kind, draft, context, setDraft, setValid }: { kind: string; draft: unknown; context: PropertyEditorContext; setDraft: (value: unknown) => void; setValid: (value: boolean) => void }) {
  if (kind === 'regex') return <RegexVisual value={draft} onChange={setDraft} onValidity={setValid} />;
  if (kind === 'options') return <OptionsVisual value={draft} onChange={setDraft} onValidity={setValid} />;
  if (kind === 'validation-rules') return <ValidationRulesVisual value={draft} fields={context.fields} onChange={setDraft} onValidity={setValid} />;
  if (['tabs', 'steps', 'string-list'].includes(kind)) return <StringListVisual value={draft} onChange={setDraft} onValidity={setValid} />;
  if (['table-columns', 'filters', 'sorting'].includes(kind)) return <ArrayRowsVisual kind={kind} value={draft} fields={context.fields} onChange={setDraft as (value: unknown[]) => void} onValidity={setValid} />;
  if (['key-value', 'mapping'].includes(kind)) return <KeyValueVisual value={draft} fields={context.fields} onChange={setDraft} onValidity={setValid} />;
  if (kind === 'data-binding') return <DataBindingVisual value={draft} context={context} onChange={setDraft} onValidity={setValid} />;
  if (['expression', 'template'].includes(kind)) return <ExpressionVisual kind={kind} value={draft} context={context} onChange={setDraft} onValidity={setValid} />;
  if (['radius', 'opacity', 'dimension'].includes(kind)) return <ScalarStyleVisual kind={kind as 'radius' | 'opacity' | 'dimension'} value={draft} onChange={setDraft} onValidity={setValid} />;
  if (['number-range', 'date-range', 'selection-range', 'spacing', 'typography', 'border', 'shadow', 'upload-constraints'].includes(kind)) return <CompositeVisual kind={kind} value={draft} onChange={setDraft} onValidity={setValid} />;
  return <div className="property-editor-help">该配置使用源码编辑器；有效 JSON 才能应用。</div>;
}
