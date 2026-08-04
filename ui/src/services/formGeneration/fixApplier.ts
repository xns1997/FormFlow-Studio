/**
 * Unified quick-fix executor for form diagnostics.
 *
 * Every `FormDiagnostic` produced by `diagnoseForm` carries a machine-readable
 * `quickFix`. `applyDiagnosticFix` executes a single one through caller-provided
 * operations; `applyDiagnosticFixes` implements the "one-click attempt fix"
 * loop, re-running diagnosis between fixes so cascading issues (for example
 * an invalid flow trigger that then leaves the button without an action) are
 * resolved in the same pass.
 */
import type { DesignComponent, SrcTableEntry, WorkflowFile, TableConfig } from '../../project/types';
import type { FormDiagnostic, QuickFix } from './formDiagnostics';
import { computeSheetKeyValidation } from '../data/tableKeys';

export interface FixContext {
  components: DesignComponent[];
  tables: SrcTableEntry[];
  workflows: WorkflowFile[];
}

export interface FixOperations {
  updateComponentProps: (componentId: string, patch: Record<string, unknown>) => void;
  updateComponentField?: (componentId: string, fieldName: string) => void;
  updateComponentGeometry?: (componentId: string, geometry: Partial<Pick<DesignComponent, 'x' | 'y' | 'width' | 'height'>>) => void;
  addComponent?: (type: string, position?: { x?: number; y?: number }, initialProps?: Record<string, unknown>) => string | void;
  updateWorkflow?: (workflowId: string, patch: Partial<WorkflowFile>) => void;
  updateTableSheetConfig?: (tableId: string, sheetName: string, patch: Partial<TableConfig>) => void;
  navigateTo?: (target: 'data' | 'flow') => void;
}

export interface FixOutcome {
  ok: boolean;
  kind: 'applied' | 'navigated' | 'skipped' | 'failed';
  message: string;
}

export interface FixBatchSummary {
  applied: number;
  navigated: number;
  skipped: number;
  failed: number;
  messages: string[];
  remainingCount: number;
}

function navigateOrFail(ops: FixOperations, message: string): FixOutcome {
  if (ops.navigateTo) {
    ops.navigateTo('data');
    return { ok: true, kind: 'navigated', message };
  }
  return { ok: false, kind: 'failed', message: '需要跳转到数据工作区手动处理主键。' };
}

function applyTableConfigFix(fix: QuickFix, ctx: FixContext, ops: FixOperations): FixOutcome {
  if (!fix.tableId || !fix.sheetName) return { ok: false, kind: 'failed', message: '缺少数据表信息。' };
  const table = ctx.tables.find((item) => item.id === fix.tableId);
  const sheet = table?.sheets.find((item) => item.name === fix.sheetName);
  if (!sheet || !ops.updateTableSheetConfig) {
    return navigateOrFail(ops, '当前上下文找不到该数据表，请跳转到数据工作区处理。');
  }

  if (fix.tablePatch) {
    ops.updateTableSheetConfig(fix.tableId, fix.sheetName, fix.tablePatch);
    return { ok: true, kind: 'applied', message: `已应用：${fix.label}` };
  }

  const keyFields = sheet.config?.keyFields || [];
  if (keyFields.length) {
    const result = computeSheetKeyValidation(sheet, keyFields);
    if (result?.valid) {
      ops.updateTableSheetConfig(fix.tableId, fix.sheetName, { keyValidation: result });
      return { ok: true, kind: 'applied', message: `主键已通过重新校验：${fix.sheetName}` };
    }
    return navigateOrFail(ops, `主键仍包含空值或重复值，已跳转到数据工作区处理：${fix.sheetName}`);
  }

  const candidates = sheet.columns.filter((column) => !column.hidden && column.visible !== false);
  for (const column of candidates) {
    const result = computeSheetKeyValidation(sheet, [column.name]);
    if (result?.valid) {
      ops.updateTableSheetConfig(fix.tableId, fix.sheetName, { keyFields: [column.name], keyValidation: result });
      return { ok: true, kind: 'applied', message: `已自动选择主键：${fix.sheetName}.${column.name}` };
    }
  }
  return navigateOrFail(ops, `未找到唯一且非空的候选主键，已跳转到数据工作区处理：${fix.sheetName}`);
}

export function applyDiagnosticFix(diagnostic: FormDiagnostic, ctx: FixContext, ops: FixOperations): FixOutcome {
  const fix = diagnostic.quickFix;
  if (!fix) return { ok: false, kind: 'skipped', message: `“${diagnostic.title}”暂无自动修复，请按建议手动调整。` };

  switch (fix.kind || 'component-props') {
    case 'component-props': {
      const componentId = fix.componentId || diagnostic.componentId;
      if (!componentId || !fix.props) {
        return fix.description
          ? { ok: false, kind: 'skipped', message: fix.description }
          : { ok: false, kind: 'failed', message: '缺少修复目标，无法应用。' };
      }
      ops.updateComponentProps(componentId, fix.props);
      return { ok: true, kind: 'applied', message: `已应用：${fix.label}` };
    }
    case 'component-field': {
      const componentId = fix.componentId || diagnostic.componentId;
      if (!componentId || !fix.field) return { ok: false, kind: 'failed', message: '缺少字段名，无法重命名。' };
      if (ops.updateComponentField) {
        ops.updateComponentField(componentId, fix.field);
      } else if (fix.props) {
        ops.updateComponentProps(componentId, fix.props);
      } else {
        return { ok: false, kind: 'failed', message: '缺少字段名，无法重命名。' };
      }
      return { ok: true, kind: 'applied', message: `已应用：${fix.label}` };
    }
    case 'component-geometry': {
      const componentId = fix.componentId || diagnostic.componentId;
      if (!componentId || !fix.geometry || !ops.updateComponentGeometry) {
        return { ok: false, kind: 'failed', message: '无法移动控件，请手动拖拽。' };
      }
      ops.updateComponentGeometry(componentId, fix.geometry);
      return { ok: true, kind: 'applied', message: `已应用：${fix.label}` };
    }
    case 'add-component': {
      if (!ops.addComponent) return { ok: false, kind: 'failed', message: '无法在当前页面添加控件。' };
      ops.addComponent(fix.componentType || 'input', fix.geometry);
      return { ok: true, kind: 'applied', message: `已应用：${fix.label}` };
    }
    case 'workflow-patch': {
      if (!fix.workflowId || !fix.workflowPatch || !ops.updateWorkflow) {
        return { ok: false, kind: 'failed', message: '无法修改流程，请到流程工作区处理。' };
      }
      ops.updateWorkflow(fix.workflowId, fix.workflowPatch);
      return { ok: true, kind: 'applied', message: `已应用：${fix.label}` };
    }
    case 'table-config': {
      return applyTableConfigFix(fix, ctx, ops);
    }
    case 'navigate': {
      if (!fix.navigateTo || !ops.navigateTo) {
        return { ok: false, kind: 'failed', message: '需要跳转到其他工作区手动处理。' };
      }
      ops.navigateTo(fix.navigateTo);
      return { ok: true, kind: 'navigated', message: `已跳转：${fix.label}` };
    }
    default:
      return { ok: false, kind: 'failed', message: '未知的修复类型。' };
  }
}

export function applyDiagnosticFixes(
  diagnostics: FormDiagnostic[],
  ctx: FixContext,
  ops: FixOperations,
  options: { recheck?: () => FormDiagnostic[]; maxFixes?: number } = {},
): FixBatchSummary {
  const maxFixes = options.maxFixes ?? 20;
  const summary: FixBatchSummary = {
    applied: 0,
    navigated: 0,
    skipped: 0,
    failed: 0,
    messages: [],
    remainingCount: diagnostics.length,
  };
  let current = diagnostics;
  const attempted = new Set<string>();

  for (let step = 0; step < maxFixes; step++) {
    const candidate = current.find((item) => item.quickFix && item.quickFix.auto !== false && !attempted.has(item.id));
    if (!candidate) break;
    const outcome = applyDiagnosticFix(candidate, ctx, ops);
    summary.messages.push(outcome.message);
    if (outcome.ok) {
      attempted.add(candidate.id);
      if (outcome.kind === 'applied') summary.applied += 1;
      else if (outcome.kind === 'navigated') summary.navigated += 1;
    } else if (outcome.kind === 'skipped') {
      attempted.add(candidate.id);
      summary.skipped += 1;
    } else {
      attempted.add(candidate.id);
      summary.failed += 1;
    }
    if (options.recheck) {
      current = options.recheck();
    } else {
      current = current.filter((item) => item.id !== candidate.id);
    }
  }

  summary.remainingCount = current.filter((item) => item.quickFix).length;
  return summary;
}
