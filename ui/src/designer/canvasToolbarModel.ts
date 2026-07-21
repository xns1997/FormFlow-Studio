export interface CanvasToolbarAvailabilityInput {
  selectedId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  canPaste: boolean;
}

export function getCanvasToolbarAvailability(input: CanvasToolbarAvailabilityInput) {
  const hasSelection = !!input.selectedId;
  return {
    undo: input.canUndo,
    redo: input.canRedo,
    copy: hasSelection,
    paste: input.canPaste,
    duplicate: hasSelection,
    delete: hasSelection,
    layer: hasSelection,
  };
}
