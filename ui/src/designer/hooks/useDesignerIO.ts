import { useCallback } from 'react';
import type { DesignComponent, DesignFile } from '../../project/types';
import type { DesignerState } from './useDesignerState';
import { autoResizeContainers } from '../utils';

interface DesignerIOCtx extends DesignerState {
  renderDesignOnGraph: (graph: any, design: DesignFile) => void;
  selectComponent: (id: string | null) => void;
}

export function useDesignerIO(ctx: DesignerIOCtx) {
  const {
    graphRef,
    componentsRef,
    pendingDesignRef,
    viewportRef,
    clampSize,
    commitComponents,
    renderDesignOnGraph,
    selectComponent,
    setZoom,
  } = ctx;

  const exportDesign = useCallback((): DesignComponent[] => {
    return componentsRef.current;
  }, [componentsRef]);

  const loadDesign = useCallback((design: DesignFile) => {
    const graph = graphRef.current;
    if (!graph) {
      viewportRef.current = design.viewport;
      pendingDesignRef.current = design;
      const normalized = autoResizeContainers(design.components.map((comp) => {
        const size = clampSize(comp.type, comp.width, comp.height);
        return { ...comp, width: size.width, height: size.height };
      }));
      commitComponents(normalized);
      selectComponent(null);
      return;
    }
    renderDesignOnGraph(graph, design);
  }, [graphRef, pendingDesignRef, viewportRef, clampSize, commitComponents, renderDesignOnGraph, selectComponent]);

  const clearDesign = useCallback(() => {
    const graph = graphRef.current;
    if (graph) graph.clearCells();
    commitComponents([]);
    selectComponent(null);
    pendingDesignRef.current = null;
  }, [graphRef, commitComponents, selectComponent, pendingDesignRef]);

  const toggleMode = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    ctx.setMode((prev: 'design' | 'preview') => {
      const next = prev === 'design' ? 'preview' : 'design';
      ctx.modeRef.current = next;
      if (next === 'preview') {
        selectComponent(null);
      }
      return next;
    });
  }, [graphRef, selectComponent, ctx]);

  return { exportDesign, loadDesign, clearDesign, toggleMode };
}
