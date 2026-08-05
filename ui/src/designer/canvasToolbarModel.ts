import { FORM_WINDOW_CELL_ID } from './formWindowModel';

export interface CanvasToolbarAvailabilityInput {
  selectedId: string | null;
  selectedIds?: string[];
  canUndo: boolean;
  canRedo: boolean;
  canPaste: boolean;
}

/** 计算画布工具栏可用状态（按选中/剪贴板/历史栈）。 */
export function getCanvasToolbarAvailability(input: CanvasToolbarAvailabilityInput) {
  const selectedIds = input.selectedIds ?? (input.selectedId ? [input.selectedId] : []);
  const hasEditableControlSelection = selectedIds.length > 0 && !selectedIds.includes(FORM_WINDOW_CELL_ID);
  return {
    undo: input.canUndo,
    redo: input.canRedo,
    copy: hasEditableControlSelection,
    paste: input.canPaste,
    duplicate: hasEditableControlSelection,
    delete: hasEditableControlSelection,
    layer: hasEditableControlSelection,
  };
}
