import { useCallback } from 'react';
import type { DesignerState } from './useDesignerState';

interface DesignerHistoryCtx extends DesignerState {
  syncComponentsFromGraph: () => void;
}

export function useDesignerHistory(ctx: DesignerHistoryCtx) {
  const { graphRef, syncComponentsFromGraph, bumpHistoryRevision } = ctx;

  const undo = useCallback(() => {
    graphRef.current?.undo();
    bumpHistoryRevision();
    requestAnimationFrame(syncComponentsFromGraph);
  }, [graphRef, syncComponentsFromGraph, bumpHistoryRevision]);

  const redo = useCallback(() => {
    graphRef.current?.redo();
    bumpHistoryRevision();
    requestAnimationFrame(syncComponentsFromGraph);
  }, [graphRef, syncComponentsFromGraph, bumpHistoryRevision]);

  return { undo, redo };
}
