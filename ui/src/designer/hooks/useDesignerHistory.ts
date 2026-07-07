import { useCallback } from 'react';
import type { DesignerState } from './useDesignerState';

interface DesignerHistoryCtx extends DesignerState {
  syncComponentsFromGraph: () => void;
}

export function useDesignerHistory(ctx: DesignerHistoryCtx) {
  const { graphRef, syncComponentsFromGraph } = ctx;

  const undo = useCallback(() => {
    graphRef.current?.undo();
    requestAnimationFrame(syncComponentsFromGraph);
  }, [graphRef, syncComponentsFromGraph]);

  const redo = useCallback(() => {
    graphRef.current?.redo();
    requestAnimationFrame(syncComponentsFromGraph);
  }, [graphRef, syncComponentsFromGraph]);

  return { undo, redo };
}
