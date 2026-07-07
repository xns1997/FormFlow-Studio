import type { FlowExecutionResult } from '../engine/flowEngine';
import { collectFlowSideEffects, type DeleteTableRowSideEffect, type FlowSideEffect, type InsertTableRowSideEffect, type ShowMessageSideEffect, type TableRowMutationBase, type UpdateTableRowSideEffect, type UpsertTableRowSideEffect } from '../engine/flowSideEffects';
import type { ProjectStructure, SrcSheetInfo } from '../../project/types';

export type TableRowWriteBack = UpsertTableRowSideEffect;
type TableRowSideEffect = UpsertTableRowSideEffect | UpdateTableRowSideEffect | InsertTableRowSideEffect | DeleteTableRowSideEffect;

export interface PreviewFlowSideEffectResult {
  project: ProjectStructure;
  applied: number;
  formValuePatches: Record<string, unknown>;
  componentVisibilityPatches: Record<string, boolean>;
  componentDisabledPatches: Record<string, boolean>;
  fieldRequiredPatches: Record<string, boolean>;
  messages: ShowMessageSideEffect[];
}

function isTableRowEffect(effect: FlowSideEffect): effect is TableRowSideEffect {
  return effect.kind === 'upsert-table-row'
    || effect.kind === 'update-table-row'
    || effect.kind === 'insert-table-row'
    || effect.kind === 'delete-table-row';
}

function cloneRow(row: Record<string, unknown>) {
  return { ...row };
}

function updateSheetColumns(sheet: SrcSheetInfo, preview: Array<Record<string, unknown>>): SrcSheetInfo {
  const headers = [...sheet.headers];
  for (const row of preview) {
    for (const field of Object.keys(row)) if (!headers.includes(field)) headers.push(field);
  }
  const columns = headers.map((name, index) => {
    const previous = sheet.columns.find((column) => column.name === name);
    const values = preview.map((row) => row[name]);
    const sample = values.find((value) => value !== null && value !== undefined);
    return {
      ...(previous || {
        name, index,
        dataType: typeof sample === 'number' ? 'number' as const : typeof sample === 'boolean' ? 'boolean' as const : 'string' as const,
        nullable: false,
        uniqueCount: 0,
        sampleValues: [],
      }),
      index,
      nullable: values.some((value) => value == null),
      uniqueCount: new Set(values.map((value) => JSON.stringify(value))).size,
      sampleValues: values.slice(0, 5),
    };
  });
  return { ...sheet, preview, headers, columns, rowCount: preview.length, colCount: headers.length };
}

function findRowIndex(sheet: SrcSheetInfo, effect: TableRowMutationBase) {
  return sheet.preview.findIndex((row) => row[effect.keyField] === effect.keyValue);
}

function applyRowEffect(sheet: SrcSheetInfo, effect: TableRowSideEffect): SrcSheetInfo {
  const rowIndex = findRowIndex(sheet, effect);
  switch (effect.kind) {
    case 'upsert-table-row': {
      const preview = rowIndex >= 0
        ? sheet.preview.map((row, index) => index === rowIndex ? { ...row, ...cloneRow(effect.row) } : row)
        : [...sheet.preview, cloneRow(effect.row)];
      return updateSheetColumns(sheet, preview);
    }
    case 'update-table-row': {
      if (rowIndex < 0) throw new Error(`更新目标不存在: ${effect.tableId}/${effect.sheetName}/${String(effect.keyValue)}`);
      const preview = sheet.preview.map((row, index) => index === rowIndex ? { ...row, ...cloneRow(effect.row) } : row);
      return updateSheetColumns(sheet, preview);
    }
    case 'insert-table-row': {
      if (rowIndex >= 0) throw new Error(`插入目标已存在: ${effect.tableId}/${effect.sheetName}/${String(effect.keyValue)}`);
      return updateSheetColumns(sheet, [...sheet.preview, cloneRow(effect.row)]);
    }
    case 'delete-table-row': {
      if (rowIndex < 0) throw new Error(`删除目标不存在: ${effect.tableId}/${effect.sheetName}/${String(effect.keyValue)}`);
      return updateSheetColumns(sheet, sheet.preview.filter((_, index) => index !== rowIndex));
    }
  }
}

function applyProjectTableEffects(project: ProjectStructure, effects: TableRowSideEffect[]): { project: ProjectStructure; applied: number } {
  if (effects.length === 0) return { project, applied: 0 };
  let applied = 0;
  let srcTable = project.srcTable;
  for (const effect of effects) {
    let matchedTable = false;
    let matchedSheet = false;
    srcTable = srcTable.map((table) => {
      if (table.id !== effect.tableId) return table;
      matchedTable = true;
      const sheets = table.sheets.map((sheet) => {
        if (sheet.name !== effect.sheetName) return sheet;
        matchedSheet = true;
        return applyRowEffect(sheet, effect);
      });
      return matchedSheet ? { ...table, sheets, dataHash: `writeback-${Date.now()}-${applied}` } : table;
    });
    if (!matchedTable || !matchedSheet) throw new Error(`写回目标不存在: ${effect.tableId}/${effect.sheetName}`);
    applied += 1;
  }
  return {
    project: { ...project, srcTable, config: { ...project.config, updatedAt: new Date().toISOString() } },
    applied,
  };
}

export function collectTableRowWriteBacks(result: FlowExecutionResult): TableRowWriteBack[] {
  return collectFlowSideEffects(result).filter((effect): effect is TableRowWriteBack => effect.kind === 'upsert-table-row');
}

export function applyPreviewFlowSideEffects(project: ProjectStructure, effects: FlowSideEffect[]): PreviewFlowSideEffectResult {
  const tableEffects = effects.filter(isTableRowEffect);
  const formValuePatches = Object.fromEntries(
    effects
      .filter((effect): effect is Extract<FlowSideEffect, { kind: 'set-form-value' }> => effect.kind === 'set-form-value')
      .map((effect) => [effect.field, effect.value]),
  );
  const componentVisibilityPatches = Object.fromEntries(
    effects
      .filter((effect): effect is Extract<FlowSideEffect, { kind: 'set-component-visible' }> => effect.kind === 'set-component-visible')
      .map((effect) => [effect.componentId, effect.visible]),
  );
  const componentDisabledPatches = Object.fromEntries(
    effects
      .filter((effect): effect is Extract<FlowSideEffect, { kind: 'set-component-disabled' }> => effect.kind === 'set-component-disabled')
      .map((effect) => [effect.componentId, effect.disabled]),
  );
  const fieldRequiredPatches = Object.fromEntries(
    effects
      .filter((effect): effect is Extract<FlowSideEffect, { kind: 'set-field-required' }> => effect.kind === 'set-field-required')
      .map((effect) => [effect.field, effect.required]),
  );
  const messages = effects.filter((effect): effect is ShowMessageSideEffect => effect.kind === 'show-message');
  const tableResult = applyProjectTableEffects(project, tableEffects);
  return {
    project: tableResult.project,
    applied: tableResult.applied,
    formValuePatches,
    componentVisibilityPatches,
    componentDisabledPatches,
    fieldRequiredPatches,
    messages,
  };
}

export function applyProjectWriteBacks(project: ProjectStructure, result: FlowExecutionResult) {
  return applyPreviewFlowSideEffects(project, collectFlowSideEffects(result));
}
