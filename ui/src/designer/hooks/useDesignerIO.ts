import { useCallback } from 'react';
import { createDefaultFormWindow, normalizeDesignFile, type DesignComponent, type DesignFile } from '../../project/types';
import type { DesignerState } from './useDesignerState';
import { autoResizeContainers } from '../utils';
import { hydrateControlComponent } from '../registry';

interface DesignerIOCtx extends DesignerState {
  renderDesignOnGraph: (graph: any, design: DesignFile) => void;
  selectComponent: (id: string | null) => void;
}

export function useDesignerIO(ctx: DesignerIOCtx) {
  const {
    graphRef,
    componentsRef,
    formWindowRef,
    pendingDesignRef,
    viewportRef,
    clampSize,
    commitComponents,
    renderDesignOnGraph,
    selectComponent,
    setZoom,
    setFormWindow,
  } = ctx;

  const exportDesign = useCallback((): DesignComponent[] => {
    return componentsRef.current;
  }, [componentsRef]);

  const loadDesign = useCallback((design: DesignFile) => {
    const normalizedDesign = normalizeDesignFile(design, design.name);
    formWindowRef.current = normalizedDesign.formWindow;
    setFormWindow(normalizedDesign.formWindow);
    const graph = graphRef.current;
    if (!graph) {
      viewportRef.current = normalizedDesign.viewport;
      pendingDesignRef.current = normalizedDesign;
      const normalized = autoResizeContainers(normalizedDesign.components.map((source) => {
        const comp = hydrateControlComponent(source);
        const size = clampSize(comp.type, comp.width, comp.height);
        return { ...comp, width: size.width, height: size.height };
      }));
      commitComponents(normalized);
      selectComponent(null);
      return;
    }
    renderDesignOnGraph(graph, normalizedDesign);
  }, [graphRef, pendingDesignRef, viewportRef, formWindowRef, clampSize, commitComponents, renderDesignOnGraph, selectComponent, setFormWindow]);

  const clearDesign = useCallback(() => {
    const graph = graphRef.current;
    if (graph) graph.clearCells();
    commitComponents([]);
    const emptyWindow = createDefaultFormWindow();
    formWindowRef.current = emptyWindow;
    setFormWindow(emptyWindow);
    selectComponent(null);
    pendingDesignRef.current = null;
  }, [graphRef, commitComponents, selectComponent, pendingDesignRef, formWindowRef, setFormWindow]);

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
