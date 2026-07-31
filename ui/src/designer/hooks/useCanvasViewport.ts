import { useCallback, type RefObject } from 'react';

/**
 * Canvas viewport operations: zoom, pan, fit.
 * Extracted from useDesigner to improve locality and testability.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- X6 graph type is complex
export function useCanvasViewport(
  graphRef: RefObject<any>,
  setZoom: (zoom: number) => void,
  syncSelectionOverlay: () => void,
) {
  const zoomToNearestStep = useCallback((direction: 1 | -1) => {
    const graph = graphRef.current;
    if (!graph) return;
    const current = graph.zoom();
    const steps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
    const next = direction > 0
      ? steps.find((step) => step > current + 0.001) ?? current * 1.2
      : [...steps].reverse().find((step) => step < current - 0.001) ?? current / 1.2;
    graph.zoomTo(next);
    setZoom(next);
  }, [graphRef, setZoom]);

  const zoomIn = useCallback(() => zoomToNearestStep(1), [zoomToNearestStep]);
  const zoomOut = useCallback(() => zoomToNearestStep(-1), [zoomToNearestStep]);

  const resetView = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.zoomTo(1);
    graph.centerContent();
    setZoom(1);
  }, [graphRef, setZoom]);

  const fitContent = useCallback(() => {
    graphRef.current?.zoomToFit({ padding: 48 });
    requestAnimationFrame(() => syncSelectionOverlay());
  }, [graphRef, syncSelectionOverlay]);

  return { zoomToNearestStep, zoomIn, zoomOut, resetView, fitContent };
}
