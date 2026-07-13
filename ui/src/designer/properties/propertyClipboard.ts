import type { PropSchemaEntry, PropValueType, PropertyEditorKind } from '../types';
import { isCompositePropDef } from '../types';

export interface PropertyClipboardPayload {
  formflowProperty: 1;
  editor: PropertyEditorKind | string;
  storageType: PropValueType | 'composite';
  value: unknown;
}

export function encodePropertyClipboard(payload: Omit<PropertyClipboardPayload, 'formflowProperty'>) {
  return JSON.stringify({ formflowProperty: 1, ...payload }, null, 2);
}

export function decodePropertyClipboard(text: string): PropertyClipboardPayload {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('剪贴板不是有效的 FormFlow 属性配置'); }
  if (!value || typeof value !== 'object' || (value as PropertyClipboardPayload).formflowProperty !== 1) {
    throw new Error('剪贴板中没有可识别的 FormFlow 属性配置');
  }
  return value as PropertyClipboardPayload;
}

function matchesStorageType(type: PropValueType | 'composite', value: unknown) {
  if (type === 'composite') return !!value && typeof value === 'object' && !Array.isArray(value);
  if (['array', 'string[]', 'object[]', 'unknown[][]'].includes(type)) return Array.isArray(value);
  if (['object', 'json'].includes(type)) return value === null || typeof value === 'object';
  if (type === 'number') return value === '' || typeof value === 'number';
  if (type === 'boolean') return typeof value === 'boolean';
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

export function validatePropertyClipboard(payload: PropertyClipboardPayload, def: PropSchemaEntry) {
  const expected = isCompositePropDef(def) ? 'composite' : def.type;
  if (!matchesStorageType(expected, payload.value)) return `配置值与“${def.label}”的数据类型不兼容`;
  if (isCompositePropDef(def)) {
    const keys = Object.keys(payload.value as object);
    if (!keys.some((key) => def.keys.includes(key))) return `配置中缺少“${def.label}”需要的属性`;
  }
  return null;
}
