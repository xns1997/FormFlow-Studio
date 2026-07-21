import React, { useState } from 'react';
import { Dropdown } from 'antd';
import { isCompositePropDef } from '../types';
import { getPropertyEditorDescriptor, resolvePropertyEditorKind, type PropertyEditorContext } from './propertyEditorRegistry';
import { decodePropertyClipboard, encodePropertyClipboard, validatePropertyClipboard } from './propertyClipboard';

function effectiveValue(context: PropertyEditorContext) {
  return isCompositePropDef(context.def)
    ? Object.fromEntries(context.def.keys.map((key) => [key, context.values[key]]))
    : context.value;
}

function defaultValue(context: PropertyEditorContext) {
  if (isCompositePropDef(context.def)) return Object.fromEntries(context.def.keys.map((key) => [key, context.defaultValues?.[key]]));
  return context.defaultValue;
}

export function resetProperty(context: PropertyEditorContext) {
  if (resolvePropertyEditorKind(context.def) === 'data-binding') {
    context.onPatch({ dataBinding: { version: 1, source: { kind: 'none' }, direction: 'dataToUi', valueMode: 'auto' } });
    return;
  }
  if (isCompositePropDef(context.def)) {
    context.onPatch(defaultValue(context) as Record<string, unknown>);
  } else {
    context.onChange(context.defaultValue ?? context.def.default);
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
  const runAction = (key: string) => {
    if (key === 'copy') void copy();
    else if (key === 'paste') void paste();
    else if (key === 'reset') { resetProperty(context); setMessage('已恢复默认'); }
  };
  return <div className="property-field-actions" onClick={(event) => event.stopPropagation()}>
    <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: [
      { key: 'copy', label: '复制配置' }, { key: 'paste', label: '粘贴配置' }, { type: 'divider' }, { key: 'reset', label: '恢复默认', disabled: !context.status?.changed },
    ], onClick: ({ key }) => runAction(key) }}>
      <button type="button" className="property-action-trigger" title="属性操作" aria-label="属性操作" aria-haspopup="menu">…</button>
    </Dropdown>
    {message && <small role="status" title={message}>{message}</small>}
  </div>;
}
