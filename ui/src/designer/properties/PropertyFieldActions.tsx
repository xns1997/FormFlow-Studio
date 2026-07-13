import React, { useState } from 'react';
import { isCompositePropDef } from '../types';
import { getPropertyEditorDescriptor, resolvePropertyEditorKind, type PropertyEditorContext } from './propertyEditorRegistry';
import { decodePropertyClipboard, encodePropertyClipboard, validatePropertyClipboard } from './propertyClipboard';

function effectiveValue(context: PropertyEditorContext) {
  return isCompositePropDef(context.def)
    ? Object.fromEntries(context.def.keys.map((key) => [key, context.values[key]]))
    : context.value;
}

export function resetProperty(context: PropertyEditorContext) {
  if (resolvePropertyEditorKind(context.def) === 'data-binding') {
    context.onPatch({ dataBinding: { version: 1, source: { kind: 'none' }, direction: 'dataToUi', valueMode: 'auto' } });
    return;
  }
  if (isCompositePropDef(context.def)) {
    context.onPatch(Object.fromEntries(context.def.keys.map((key) => [key, undefined])));
  } else {
    context.onChange(context.def.default ?? undefined);
  }
}

export function PropertyFieldActions({ context }: { context: PropertyEditorContext }) {
  const [message, setMessage] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(encodePropertyClipboard({
        editor: resolvePropertyEditorKind(context.def),
        storageType: isCompositePropDef(context.def) ? 'composite' : context.def.type,
        value: effectiveValue(context),
      }));
      setMessage('已复制');
    } catch { setMessage('复制失败'); }
  };
  const paste = async () => {
    try {
      const payload = decodePropertyClipboard(await navigator.clipboard.readText());
      const error = validatePropertyClipboard(payload, context.def);
      if (error) { setMessage(error); return; }
      const descriptorError = getPropertyEditorDescriptor(resolvePropertyEditorKind(context.def))?.validate?.(payload.value, context);
      if (descriptorError) { setMessage(descriptorError); return; }
      if (isCompositePropDef(context.def)) context.onPatch(payload.value as Record<string, unknown>);
      else context.onChange(payload.value);
      setMessage('已粘贴');
    } catch (error) { setMessage(error instanceof Error ? error.message : '粘贴失败'); }
  };
  return <div className="property-field-actions" onClick={(event) => event.preventDefault()}>
    <button type="button" title="复制属性配置" aria-label="复制属性配置" onClick={() => void copy()}>复制</button>
    <button type="button" title="粘贴属性配置" aria-label="粘贴属性配置" onClick={() => void paste()}>粘贴</button>
    <button type="button" title="恢复默认值" aria-label="恢复默认值" onClick={() => { resetProperty(context); setMessage('已恢复默认'); }}>重置</button>
    {message && <small role="status" title={message}>{message}</small>}
  </div>;
}
