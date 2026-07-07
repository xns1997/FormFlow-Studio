import type { SrcSheetInfo, SrcTableEntry, TableConfig } from '../../project/types';

export interface SheetKeyValidationResult {
  hasNulls: boolean;
  duplicateCount: number;
  valid: boolean;
  checkedAt: string;
}

function isEmptyKeyValue(value: unknown) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

function normalizeKeyFieldList(sheet: SrcSheetInfo, keyFields: string[] | undefined) {
  if (!Array.isArray(keyFields)) return [];
  const seen = new Set<string>();
  return keyFields
    .filter((field) => typeof field === 'string' && field && sheet.headers.includes(field) && !seen.has(field) && seen.add(field));
}

export function computeSheetKeyValidation(sheet: SrcSheetInfo, keyFields: string[] | undefined): SheetKeyValidationResult | undefined {
  const normalized = normalizeKeyFieldList(sheet, keyFields);
  if (normalized.length === 0) return undefined;
  const seen = new Set<string>();
  let hasNulls = false;
  let duplicateCount = 0;
  for (const row of sheet.preview || []) {
    const values = normalized.map((field) => row[field]);
    if (values.some(isEmptyKeyValue)) {
      hasNulls = true;
      continue;
    }
    const signature = JSON.stringify(values);
    if (seen.has(signature)) duplicateCount += 1;
    else seen.add(signature);
  }
  return {
    hasNulls,
    duplicateCount,
    valid: !hasNulls && duplicateCount === 0,
    checkedAt: new Date().toISOString(),
  };
}

export function applySheetKeyConfig(sheet: SrcSheetInfo, keyFields: string[] | undefined): Partial<TableConfig> {
  const normalized = normalizeKeyFieldList(sheet, keyFields);
  return {
    keyFields: normalized,
    keyValidation: computeSheetKeyValidation(sheet, normalized),
  };
}

export function getSheetKeyConfig(tables: SrcTableEntry[], tableId: string, sheetName: string) {
  const sheet = tables.find((table) => table.id === tableId)?.sheets.find((item) => item.name === sheetName);
  return sheet?.config ? {
    keyFields: normalizeKeyFieldList(sheet, sheet.config.keyFields),
    keyValidation: sheet.config.keyValidation,
  } : null;
}

export function resolveSheetKeyFields(tables: SrcTableEntry[], tableId: string, sheetName: string): string[] {
  return getSheetKeyConfig(tables, tableId, sheetName)?.keyFields || [];
}

export function resolveSingleKeyField(tables: SrcTableEntry[], tableId: string, sheetName: string): string | undefined {
  const keyFields = resolveSheetKeyFields(tables, tableId, sheetName);
  return keyFields.length === 1 ? keyFields[0] : undefined;
}
