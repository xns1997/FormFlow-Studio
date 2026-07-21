import { useRef, useCallback, useState } from 'react';
import type { Node } from '@antv/x6';
import type { DesignComponent, DesignFile } from '../../project/types';
import { SINGLE_LINE_FIELD_HEIGHT } from '../controls/geometry';

export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export const DESIGNER_MIN_SIZES: Record<string, { w: number; h: number }> = {
  input: { w: 160, h: SINGLE_LINE_FIELD_HEIGHT },
  textarea: { w: 180, h: 92 },
  number: { w: 150, h: SINGLE_LINE_FIELD_HEIGHT },
  datePicker: { w: 160, h: SINGLE_LINE_FIELD_HEIGHT },
  timePicker: { w: 160, h: SINGLE_LINE_FIELD_HEIGHT },
  dateRange: { w: 240, h: SINGLE_LINE_FIELD_HEIGHT },
  select: { w: 170, h: SINGLE_LINE_FIELD_HEIGHT },
  segmented: { w: 220, h: SINGLE_LINE_FIELD_HEIGHT },
  radio: { w: 180, h: 112 },
  checkbox: { w: 180, h: 112 },
  tagInput: { w: 220, h: 84 },
  switch: { w: 150, h: 44 },
  rating: { w: 170, h: 44 },
  upload: { w: 240, h: 104 },
  imageUpload: { w: 240, h: 132 },
  button: { w: 120, h: 40 },
  text: { w: 80, h: 28 },
  image: { w: 120, h: 90 },
  table: { w: 480, h: 200 },
  chart: { w: 220, h: 140 },
  card: { w: 220, h: 140 },
  tabs: { w: 240, h: 140 },
  steps: { w: 320, h: 88 },
  divider: { w: 32, h: 8 },
  form: { w: 360, h: 420 },
};

export function clampDesignerSize(type: string, width: number, height: number) {
  const min = DESIGNER_MIN_SIZES[type] ?? { w: 96, h: 28 };
  return { width: Number.isFinite(width) && width > 0 ? Math.max(min.w, width) : min.w, height: Number.isFinite(height) && height > 0 ? Math.max(min.h, height) : min.h };
}

export interface SelectionOverlay {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function useDesignerState() {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const pendingDesignRef = useRef<DesignFile | null>(null);
  const componentsRef = useRef<DesignComponent[]>([]);
  const suppressMoveSyncRef = useRef(false);
  const viewportRef = useRef<DesignFile['viewport']>({ zoom: 1, panX: 0, panY: 0 });
  const modeRef = useRef<'design' | 'preview'>('design');

  // State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionOverlay, setSelectionOverlay] = useState<SelectionOverlay | null>(null);
  const [components, setComponents] = useState<DesignComponent[]>([]);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<'design' | 'preview'>('design');
  const [historyRevision, setHistoryRevision] = useState(0);

  // Helper functions
  const commitComponents = useCallback((updater: React.SetStateAction<DesignComponent[]>) => {
    setComponents((prev) => {
      const next = typeof updater === 'function'
        ? (updater as (value: DesignComponent[]) => DesignComponent[])(prev)
        : updater;
      componentsRef.current = next;
      return next;
    });
  }, []);

  const setNodeComponentData = useCallback((node: Node, component: DesignComponent, selected = selectedIdRef.current === node.id) => {
    node.setData({
      componentType: component.type,
      designComponent: component,
      selected,
      mode: modeRef.current,
    });
  }, []);

  const clampSize = useCallback((type: string, width: number, height: number) => {
    return clampDesignerSize(type, width, height);
  }, []);
  const bumpHistoryRevision = useCallback(() => setHistoryRevision((value) => value + 1), []);

  return {
    // Refs
    containerRef,
    graphRef,
    resizeObserverRef,
    selectedIdRef,
    pendingDesignRef,
    componentsRef,
    suppressMoveSyncRef,
    viewportRef,
    modeRef,
    // State
    selectedId,
    setSelectedId,
    selectionOverlay,
    setSelectionOverlay,
    components,
    setComponents,
    zoom,
    setZoom,
    mode,
    setMode,
    historyRevision,
    bumpHistoryRevision,
    // Helpers
    commitComponents,
    setNodeComponentData,
    clampSize,
  };
}

export type DesignerState = ReturnType<typeof useDesignerState>;
