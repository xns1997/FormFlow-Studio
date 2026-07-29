import { useRef, useCallback, useEffect, useState } from 'react';
import { Graph, type Node, Selection, Snapline, Clipboard, Keyboard, History } from '@antv/x6';
import { register } from '@antv/x6-react-shape';
import React from 'react';
import type { DesignComponent, DesignFile, FormWindowConfig } from '../project/types';
import { getControl, hydrateControlComponent } from './registry';
import { useDesignerState, type SelectionOverlay, type ResizeHandle } from './hooks/useDesignerState';
import { useDesignerActions } from './hooks/useDesignerActions';
import { useDesignerClipboard } from './hooks/useDesignerClipboard';
import { useDesignerHistory } from './hooks/useDesignerHistory';
import { useDesignerIO } from './hooks/useDesignerIO';
import { useCanvasViewport } from './hooks/useCanvasViewport';
import {
  findContainerParent,
  normalizeContainerChildren,
  isContainerComponent,
  getDescendantIds,
  autoResizeContainers,
} from './utils';
import { layoutForm, type MeasuredNodeBox } from '../services/layout';
import { FORM_WINDOW_CELL_ID } from './formWindowModel';
import { FormWindowFrame } from './FormWindowFrame';
import {
  canvasToLocalRect,
  clampComponentToContent,
  getFormWindowLayout,
  growFormWindowToFit,
  localToCanvasPoint,
  localToCanvasRect,
} from '../../../shared/form-window-layout';
import { measureRenderedControls } from './formLayoutMeasurement';

const DesignNodeView = ({ node }: { node: any }) => {
  const data = node.getData();
  const control = getControl(data.componentType);
  if (!control) return <div style={{ padding: 4, color: '#999', fontSize: 10 }}>Unknown: {data.componentType}</div>;
  const C = control.render;
  const graph = typeof node.getGraph === 'function' ? node.getGraph() : null;
  const liveChildren = graph?.getNodes?.()
    ?.filter((candidate: any) => {
      if (candidate.id === node.id) return false;
      const childData = candidate.getData?.();
      return childData?.designComponent?.parentId === node.id;
    })
    ?.map((candidate: any) => candidate.id) || data.designComponent?.children || [];
  const hydratedComponent = {
    ...data.designComponent,
    children: liveChildren,
  };
  return (
    <div
      className={`ios-design-node ${data.selected ? 'selected' : ''}`}
      style={{ width: '100%', height: '100%', minWidth: 0, maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box' }}
    >
      <C component={hydratedComponent} selected={data.selected} mode={data.mode} />
    </div>
  );
};

const DesignFormWindowView = ({ node }: { node: any }) => {
  const data = node.getData();
  const formWindow = data.formWindowConfig as FormWindowConfig;
  if (!formWindow) return null;
  return <FormWindowFrame formWindow={formWindow} mode="design" selected={!!data.selected} />;
};

let registered = false;
function ensureRegistered() {
  if (registered) return;
  try {
    register({
      shape: 'design-node',
      component: DesignNodeView,
      attrs: {
        body: { fill: 'none', stroke: 'none', refWidth: '100%', refHeight: '100%' },
        fo: { refWidth: '100%', refHeight: '100%' },
        foContent: { style: { width: '100%', height: '100%' } },
      },
    } as any);
    register({
      shape: 'design-form-window',
      component: DesignFormWindowView,
      attrs: {
        body: { fill: 'none', stroke: 'none', refWidth: '100%', refHeight: '100%' },
        fo: { refWidth: '100%', refHeight: '100%' },
        foContent: { style: { width: '100%', height: '100%' } },
      },
    } as any);
    registered = true;
  } catch (e) {
    console.warn('[designer] X6 register failed:', e);
  }
}

export { type SelectionOverlay, type ResizeHandle };

export function useDesigner() {
  const state = useDesignerState();
  const {
    containerRef,
    graphRef,
    resizeObserverRef,
    selectedIdRef,
    selectedIdsRef,
    pendingDesignRef,
    componentsRef,
    formWindowRef,
    suppressMoveSyncRef,
    viewportRef,
    modeRef,
    selectedId,
    setSelectedId,
    selectedIds,
    setSelectedIds,
    selectionOverlay,
    setSelectionOverlay,
    components,
    formWindow,
    setFormWindow,
    setComponents,
    zoom,
    setZoom,
    mode,
    setMode,
    bumpHistoryRevision,
    commitComponents,
    setNodeComponentData,
    clampSize,
  } = state;

  const syncGraphSelectionState = useCallback((ids: string[]) => {
    const graph = graphRef.current;
    if (!graph) return;
    const selected = new Set(ids);
    graph.getNodes().forEach((node: Node) => {
      const data = node.getData();
      node.setData({ ...data, selected: selected.has(node.id) }, { overwrite: false });
    });
  }, [graphRef]);

  const ensureHierarchyZ = useCallback((items: DesignComponent[]) => {
    const graph = graphRef.current;
    let next = items;
    let changed = true;
    while (changed) {
      changed = false;
      next = next.map((component) => {
        if (!component.parentId) return component;
        const parent = next.find((item) => item.id === component.parentId);
        if (!parent) return component;
        const parentZ = parent.zIndex ?? 0;
        const childZ = component.zIndex ?? 0;
        if (childZ > parentZ) return component;
        changed = true;
        const raised = { ...component, zIndex: parentZ + 1 };
        const node = graph?.getCellById(component.id) as Node | null;
        node?.setZIndex(raised.zIndex);
        if (node?.isNode()) setNodeComponentData(node, raised);
        return raised;
      });
    }
    return next;
  }, [graphRef, setNodeComponentData]);

  const syncGraphEmbedding = useCallback((graph: Graph, source: DesignComponent[]) => {
    const byId = new Map(source.map((component) => [component.id, component] as const));
    const nodes = new Map(graph.getNodes().map((node) => [node.id, node] as const));
    source.forEach((component) => {
      const node = nodes.get(component.id);
      if (!node) return;
      const currentParent = node.getParent() as Node | null;
      const nextParent = component.parentId ? nodes.get(component.parentId) || null : null;
      if (nextParent && currentParent?.id !== nextParent.id) {
        nextParent.embed(node, { ui: true });
      } else if (!nextParent && currentParent) {
        currentParent.unembed(node, { ui: true });
      }
      const liveParentId = node.getParent()?.id;
      const sourceParentId = byId.get(component.id)?.parentId;
      if (liveParentId !== sourceParentId) {
        const liveComponent = byId.get(component.id);
        if (liveComponent) liveComponent.parentId = liveParentId || undefined;
      }
    });
  }, []);

  const commitFormWindowConfig = useCallback((next: FormWindowConfig) => {
    formWindowRef.current = next;
    setFormWindow(next);
    const node = graphRef.current?.getCellById(FORM_WINDOW_CELL_ID) as Node | null;
    if (!node?.isNode()) return;
    const data = node.getData();
    node.setPosition(next.x, next.y);
    node.setSize(next.width, next.height);
    node.setData({
      ...data,
      formWindow: true,
      formWindowConfig: next,
      selected: selectedIdRef.current === FORM_WINDOW_CELL_ID,
    });
  }, [formWindowRef, graphRef, selectedIdRef, setFormWindow]);

  const finalizeComponents = useCallback((items: DesignComponent[]) => {
    const normalized = normalizeContainerChildren(ensureHierarchyZ(autoResizeContainers(
      items.map((component) => clampComponentToContent(component)),
    )));
    const fittedWindow = growFormWindowToFit(formWindowRef.current, normalized);
    commitFormWindowConfig(fittedWindow);
    const graph = graphRef.current;
    if (graph) {
      syncGraphEmbedding(graph, normalized);
      normalized.forEach((component) => {
        const node = graph.getCellById(component.id) as Node | null;
        if (!node || !node.isNode()) return;
        const canvasComponent = localToCanvasRect(fittedWindow, component);
        const pos = node.getPosition();
        const size = node.getSize();
        if (Math.round(pos.x) !== Math.round(canvasComponent.x) || Math.round(pos.y) !== Math.round(canvasComponent.y)) {
          node.setPosition(canvasComponent.x, canvasComponent.y);
        }
        if (Math.round(size.width) !== component.width || Math.round(size.height) !== component.height) {
          node.setSize(component.width, component.height);
        }
        setNodeComponentData(node, component, selectedIdRef.current === component.id);
      });
    }
    return normalized;
  }, [commitFormWindowConfig, formWindowRef, graphRef, selectedIdRef, ensureHierarchyZ, setNodeComponentData, syncGraphEmbedding]);

  const syncSelectionOverlay = useCallback((id: string | null = selectedIdRef.current) => {
    const graph = graphRef.current;
    const shell = containerRef.current?.parentElement;
    if (!graph || !shell) {
      setSelectionOverlay(null);
      return;
    }
    const selectedNodes = graph.getSelectedCells().filter((cell: Node): cell is Node => cell.isNode());
    const stateSelection = selectedIdsRef.current;
    if (
      selectedNodes.length !== 1
      || stateSelection.length !== 1
      || selectedNodes[0].id !== stateSelection[0]
      || (id !== null && selectedNodes[0].id !== id)
    ) {
      setSelectionOverlay(null);
      return;
    }
    const resolvedId = selectedNodes[0].id;
    if (!resolvedId) {
      setSelectionOverlay(null);
      return;
    }
    const node = graph.getCellById(resolvedId) as Node | null;
    if (!node || !node.isNode()) {
      setSelectionOverlay(null);
      return;
    }
    const cellElement = containerRef.current?.querySelector(`[data-cell-id="${resolvedId}"]`) as SVGGraphicsElement | null;
    const renderedNode = (cellElement?.querySelector('foreignObject') || cellElement) as SVGGraphicsElement | null;
    if (!renderedNode) {
      setSelectionOverlay(null);
      return;
    }
    const clientRect = renderedNode.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const nextOverlay = {
      id: resolvedId,
      ids: [resolvedId],
      left: clientRect.x - shellRect.left,
      top: clientRect.y - shellRect.top,
      width: clientRect.width,
      height: clientRect.height,
    };
    setSelectionOverlay(nextOverlay);
  }, [containerRef, graphRef, selectedIdsRef, setSelectionOverlay]);

  const syncSelectionOverlayWhenRendered = useCallback((id: string, attempt = 0) => {
    requestAnimationFrame(() => {
      const graph = graphRef.current;
      const renderedNode = containerRef.current?.querySelector(`[data-cell-id="${id}"]`);
      if (graph?.getCellById(id) && !renderedNode && attempt < 8) {
        syncSelectionOverlayWhenRendered(id, attempt + 1);
        return;
      }
      syncSelectionOverlay(id);
    });
  }, [containerRef, graphRef, syncSelectionOverlay]);

  const selectComponent = useCallback((id: string | null) => {
    const graph = graphRef.current;
    selectedIdRef.current = id;
    selectedIdsRef.current = id ? [id] : [];
    setSelectedId(id);
    setSelectedIds(id ? [id] : []);
    if (!graph) {
      setSelectionOverlay(null);
      return;
    }
    graph.cleanSelection();
    if (id) {
      const cell = graph.getCellById(id);
      if (cell) graph.select(cell);
    }
    syncGraphSelectionState(id ? [id] : []);
    if (id) {
      syncSelectionOverlayWhenRendered(id);
    } else {
      setSelectionOverlay(null);
    }
  }, [graphRef, selectedIdRef, selectedIdsRef, setSelectedId, setSelectedIds, setSelectionOverlay, syncGraphSelectionState, syncSelectionOverlayWhenRendered]);

  const syncSelectionFromGraph = useCallback((graph: Graph, preferredId?: string) => {
    const ids = graph.getSelectedCells()
      .filter((cell): cell is Node => cell.isNode())
      .map((node) => node.id);
    const hasWindow = ids.includes(FORM_WINDOW_CELL_ID);
    let normalizedIds = ids;
    if (hasWindow && ids.length > 1) {
      normalizedIds = preferredId === FORM_WINDOW_CELL_ID
        ? [FORM_WINDOW_CELL_ID]
        : ids.filter((id) => id !== FORM_WINDOW_CELL_ID);
      graph.resetSelection(normalizedIds);
      return;
    }
    const primaryId = normalizedIds.length === 1 ? normalizedIds[0] : null;
    selectedIdsRef.current = normalizedIds;
    selectedIdRef.current = primaryId;
    setSelectedIds(normalizedIds);
    setSelectedId(primaryId);
    syncGraphSelectionState(normalizedIds);
    requestAnimationFrame(() => syncSelectionOverlay(primaryId));
  }, [selectedIdRef, selectedIdsRef, setSelectedId, setSelectedIds, syncGraphSelectionState, syncSelectionOverlay]);

  const syncComponentsFromGraph = useCallback((expectedGraph?: Graph) => {
    const graph = graphRef.current;
    if (!graph || (expectedGraph && graph !== expectedGraph)) return;
    const formNode = graph.getCellById(FORM_WINDOW_CELL_ID) as Node | null;
    if (formNode?.isNode()) {
      const position = formNode.getPosition();
      const size = formNode.getSize();
      const nodeConfig = formNode.getData()?.formWindowConfig as FormWindowConfig | undefined;
      const nextWindow = {
        ...(nodeConfig || formWindowRef.current),
        x: Math.round(position.x),
        y: Math.round(position.y),
        width: Math.round(size.width),
        height: Math.round(size.height),
      };
      formWindowRef.current = nextWindow;
      setFormWindow(nextWindow);
    }
    const next: DesignComponent[] = [];
    graph.getNodes().forEach((node: Node) => {
      const data = node.getData();
      const source = data.designComponent as DesignComponent | undefined;
      if (!source) return;
      const pos = node.getPosition();
      const size = node.getSize();
      const bounded = clampSize(source.type, size.width, size.height);
      if (bounded.width !== size.width || bounded.height !== size.height) {
        node.setSize(bounded.width, bounded.height);
      }
      const component = clampComponentToContent(canvasToLocalRect(formWindowRef.current, {
        ...source,
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        width: Math.round(bounded.width),
        height: Math.round(bounded.height),
        zIndex: node.getZIndex() ?? source.zIndex,
        parentId: node.getParent()?.id || undefined,
      }));
      setNodeComponentData(node, component);
      next.push(component);
    });
    const withParents = next.map((component) => {
      if (component.parentId) return component;
      return {
        ...component,
        parentId: findContainerParent(component, next),
      };
    });
    commitComponents(finalizeComponents(withParents));
    if (selectedIdRef.current && !graph.getCellById(selectedIdRef.current)) {
      selectComponent(null);
    } else {
      syncGraphSelectionState(selectedIdsRef.current);
      syncSelectionOverlay(selectedIdRef.current);
    }
  }, [formWindowRef, graphRef, selectedIdRef, selectedIdsRef, clampSize, commitComponents, finalizeComponents, selectComponent, setFormWindow, setNodeComponentData, syncGraphSelectionState, syncSelectionOverlay]);

  const drawComponentsOnGraph = useCallback((graph: Graph, source: DesignComponent[], windowConfig: FormWindowConfig = formWindowRef.current) => {
    graph.clearCells();
    graph.addNode({
      id: FORM_WINDOW_CELL_ID,
      x: windowConfig.x,
      y: windowConfig.y,
      width: windowConfig.width,
      height: windowConfig.height,
      zIndex: -1000,
      shape: 'design-form-window',
      data: { formWindow: true, formWindowConfig: windowConfig, selected: false },
    });
    const normalized = autoResizeContainers(source.map((item) => {
      const comp = hydrateControlComponent(item);
      const size = clampSize(comp.type, comp.width, comp.height);
      return { ...comp, width: size.width, height: size.height };
    }));
    for (const comp of normalized) {
      const canvasComponent = localToCanvasRect(windowConfig, comp);
      graph.addNode({
        id: comp.id,
        x: canvasComponent.x, y: canvasComponent.y,
        width: comp.width, height: comp.height,
        zIndex: comp.zIndex,
        shape: 'design-node',
        data: { componentType: comp.type, designComponent: comp, selected: false },
      });
    }
    return finalizeComponents(normalized);
  }, [clampSize, finalizeComponents, formWindowRef]);

  const renderDesignOnGraph = useCallback((graph: Graph, design: DesignFile) => {
    viewportRef.current = design.viewport;
    formWindowRef.current = design.formWindow;
    setFormWindow(design.formWindow);
    const normalized = drawComponentsOnGraph(graph, design.components, design.formWindow);
    graph.zoomTo(design.viewport.zoom);
    graph.translate(design.viewport.panX, design.viewport.panY);
    setZoom(design.viewport.zoom);
    commitComponents(normalized);
    selectComponent(null);
  }, [viewportRef, formWindowRef, drawComponentsOnGraph, setZoom, commitComponents, selectComponent, setFormWindow]);

  const syncGraphSize = useCallback(() => {
    const graph = graphRef.current;
    const container = containerRef.current;
    if (!graph || !container) return;
    const host = container.parentElement;
    const width = Math.round(host?.clientWidth || container.clientWidth || 0);
    const height = Math.round(host?.clientHeight || container.clientHeight || 0);
    if (width <= 0 || height <= 0) return;
    graph.resize(width, height);
    requestAnimationFrame(() => syncSelectionOverlay());
  }, [containerRef, graphRef, syncSelectionOverlay]);

  const graphCtx = {
    ...state,
    finalizeComponents,
    selectComponent,
    syncComponentsFromGraph,
    syncSelectionOverlay,
    renderDesignOnGraph,
  };

  const actions = useDesignerActions(graphCtx);
  const clipboard = useDesignerClipboard(graphCtx);
  const history = useDesignerHistory(graphCtx);
  const io = useDesignerIO(graphCtx);

  const initGraph = useCallback(() => {
    if (!containerRef.current || graphRef.current) return;
    ensureRegistered();
    const graph = new Graph({
      container: containerRef.current,
      grid: { visible: true, size: 12, type: 'doubleMesh', args: [{ color: 'rgba(120,120,128,0.10)', thickness: 1 }, { color: 'rgba(0,122,255,0.08)', thickness: 1, factor: 4 }] },
      background: { color: '#f5f5f7' },
      mousewheel: { enabled: true, modifiers: ['ctrl', 'meta'] },
      panning: { enabled: true, eventTypes: ['rightMouseDown', 'mouseWheel'] },
      snapline: true,
      resizing: false,
      interacting: { nodeMovable: true, edgeMovable: false },
      connecting: { allowBlank: false, allowLoop: false, highlight: true },
      embedding: {
        enabled: true,
        frontOnly: false,
        findParent: ({ node: child }: { node: Node }) => {
          const childComponent = componentsRef.current.find((component) => component.id === child.id);
          const descendants = childComponent ? getDescendantIds(componentsRef.current, childComponent.id) : new Set<string>();
          const box = child.getBBox();
          return graph.getNodes().filter((candidate) => {
            if (candidate.id === child.id) return false;
            if (descendants.has(candidate.id)) return false;
            const component = componentsRef.current.find((item) => item.id === candidate.id);
            if (!isContainerComponent(component)) return false;
            return box.isIntersectWithRect(candidate.getBBox());
          }).sort((a, b) => (a.size().width * a.size().height) - (b.size().width * b.size().height));
        },
        validate: ({ child, parent }: { child: Node; parent: Node }) => {
          if (child.id === parent.id) return false;
          const parentComponent = componentsRef.current.find((component) => component.id === parent.id);
          if (!isContainerComponent(parentComponent)) return false;
          const descendants = getDescendantIds(componentsRef.current, child.id);
          return !descendants.has(parent.id);
        },
      },
      highlighting: {
        embedding: {
          name: 'stroke',
          args: {
            padding: 2,
            attrs: {
              stroke: '#73d13d',
              strokeWidth: 2,
              strokeDasharray: '6 4',
            },
          },
        },
      },
    } as any);
    graph.use(new Selection({
      enabled: true,
      showNodeSelectionBox: true,
      multiple: true,
      multipleSelectionModifiers: ['shift', 'meta', 'ctrl'],
      rubberband: true,
      strict: true,
      movable: true,
      following: true,
      pointerEvents: 'none',
      content: (selection) => selection.length > 1 ? `${selection.length} 个控件` : '',
    }));
    graph.use(new Snapline({ enabled: true }));
    graph.use(new Clipboard({ enabled: true, useLocalStorage: false }));
    graph.use(new Keyboard({ enabled: true, global: false }));
    graph.use(new History({ enabled: true }));
    graph.on('selection:changed', ({ added }) => {
      if (modeRef.current === 'preview') return;
      syncSelectionFromGraph(graph, added[added.length - 1]?.id);
    });
    graph.on('blank:click', () => {
      selectComponent(null);
    });
    graph.on('node:change:parent', () => {
      requestAnimationFrame(() => syncComponentsFromGraph(graph));
    });
    graph.on('scale', ({ sx }) => {
      setZoom(sx);
      requestAnimationFrame(() => syncSelectionOverlay());
    });
    graph.on('resize', () => requestAnimationFrame(() => syncSelectionOverlay()));
    graph.on('node:change:position', ({ node }) => {
      if (node.id === FORM_WINDOW_CELL_ID && !suppressMoveSyncRef.current) {
        const position = node.getPosition();
        const current = formWindowRef.current;
        const dx = position.x - current.x;
        const dy = position.y - current.y;
        if (dx || dy) {
          formWindowRef.current = { ...current, x: position.x, y: position.y };
          setFormWindow(formWindowRef.current);
          graph.getNodes()
            .filter((candidate) => candidate.id !== FORM_WINDOW_CELL_ID)
            .forEach((candidate) => candidate.translate(dx, dy));
        }
      }
      requestAnimationFrame(() => syncSelectionOverlay(node.id));
    });
    graph.on('node:change:size', ({ node }) => requestAnimationFrame(() => syncSelectionOverlay(node.id)));
    graph.on('node:moved', ({ node }) => {
      if (suppressMoveSyncRef.current) return;
      const pos = node.getPosition();
      const snappedX = Math.round(pos.x / 10) * 10;
      const snappedY = Math.round(pos.y / 10) * 10;
      suppressMoveSyncRef.current = true;
      node.setPosition(snappedX, snappedY, { deep: true });
      requestAnimationFrame(() => {
        if (node.id === FORM_WINDOW_CELL_ID) {
          const current = formWindowRef.current;
          const next = { ...current, x: snappedX, y: snappedY };
          commitFormWindowConfig(next);
          commitComponents((items) => finalizeComponents(items));
          suppressMoveSyncRef.current = false;
          syncSelectionOverlay(node.id);
          return;
        }
        syncComponentsFromGraph(graph);
        suppressMoveSyncRef.current = false;
        syncSelectionOverlay(node.id);
      });
    });
    graph.on('translate', () => requestAnimationFrame(() => syncSelectionOverlay()));
    graph.bindKey(['backspace', 'delete'], () => {
      actions.deleteSelected();
      return false;
    });
    graph.bindKey(['meta+c', 'ctrl+c'], () => {
      graph.copy(graph.getSelectedCells().filter((cell) => cell.id !== FORM_WINDOW_CELL_ID));
      return false;
    });
    graph.bindKey(['meta+a', 'ctrl+a'], () => {
      const nodes = graph.getNodes().filter((node) => node.id !== FORM_WINDOW_CELL_ID);
      graph.resetSelection(nodes);
      return false;
    });
    graph.bindKey(['meta+v', 'ctrl+v'], () => {
      const pasted = graph.paste({ offset: 24 });
      const nextComponents: DesignComponent[] = [];
      pasted.forEach((cell) => {
        if (!cell.isNode()) return;
        const node = cell as Node;
        const data = node.getData();
        const pos = node.getPosition();
        const size = node.getSize();
        const bounded = clampSize(data.componentType, size.width, size.height);
        const comp = clampComponentToContent(canvasToLocalRect(formWindowRef.current, {
          ...data.designComponent,
          id: node.id,
          x: pos.x,
          y: pos.y,
          width: bounded.width,
          height: bounded.height,
          zIndex: node.getZIndex() ?? data.designComponent?.zIndex,
        })) as DesignComponent;
        node.setSize(bounded.width, bounded.height);
        setNodeComponentData(node, comp, true);
        nextComponents.push(comp);
      });
      if (nextComponents.length) {
        commitComponents((prev) => finalizeComponents([...prev, ...nextComponents].map((component) => ({
          ...component,
          parentId: findContainerParent(component, [...prev, ...nextComponents]),
        }))));
        graph.resetSelection(nextComponents.map((component) => component.id));
      }
      return false;
    });
    graph.bindKey(['meta+z', 'ctrl+z'], () => {
      graph.undo();
      state.bumpHistoryRevision();
      requestAnimationFrame(() => syncComponentsFromGraph(graph));
      return false;
    });
    graph.bindKey(['meta+shift+z', 'ctrl+shift+z'], () => {
      graph.redo();
      state.bumpHistoryRevision();
      requestAnimationFrame(() => syncComponentsFromGraph(graph));
      return false;
    });
    const nudge = (dx: number, dy: number) => {
      const nodes = graph.getSelectedCells().filter((cell): cell is Node => cell.isNode());
      if (!nodes.length) return false;
      const formWindowNode = nodes.find((node) => node.id === FORM_WINDOW_CELL_ID);
      if (formWindowNode) {
        formWindowNode.translate(dx, dy);
        const pos = formWindowNode.getPosition();
        const next = { ...formWindowRef.current, x: pos.x, y: pos.y };
        commitFormWindowConfig(next);
        commitComponents((items) => finalizeComponents(items));
        syncSelectionOverlay(FORM_WINDOW_CELL_ID);
        return false;
      }
      nodes.forEach((node) => {
        node.translate(dx, dy, { deep: true });
      });
      syncComponentsFromGraph(graph);
      return false;
    };
    graph.bindKey('up', () => nudge(0, -1));
    graph.bindKey('down', () => nudge(0, 1));
    graph.bindKey('left', () => nudge(-1, 0));
    graph.bindKey('right', () => nudge(1, 0));
    graph.bindKey('shift+up', () => nudge(0, -10));
    graph.bindKey('shift+down', () => nudge(0, 10));
    graph.bindKey('shift+left', () => nudge(-10, 0));
    graph.bindKey('shift+right', () => nudge(10, 0));
    graphRef.current = graph;
    syncGraphSize();
    resizeObserverRef.current?.disconnect();
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      const observer = new ResizeObserver(() => {
        requestAnimationFrame(syncGraphSize);
      });
      observer.observe(containerRef.current);
      resizeObserverRef.current = observer;
    }
    // 容器初始尺寸可能为0，重试直到有值
    if (containerRef.current && ((containerRef.current.parentElement?.clientWidth || containerRef.current.clientWidth) <= 0 || (containerRef.current.parentElement?.clientHeight || containerRef.current.clientHeight) <= 0)) {
      let retries = 0;
      const retryTimer = setInterval(() => {
        retries++;
        if (!graphRef.current || !containerRef.current) { clearInterval(retryTimer); return; }
        const nextWidth = containerRef.current.parentElement?.clientWidth || containerRef.current.clientWidth;
        const nextHeight = containerRef.current.parentElement?.clientHeight || containerRef.current.clientHeight;
        if (nextWidth > 0 && nextHeight > 0) {
          clearInterval(retryTimer);
          syncGraphSize();
        } else if (retries > 20) {
          clearInterval(retryTimer);
        }
      }, 50);
    }
    if (pendingDesignRef.current) {
      const pending = pendingDesignRef.current;
      pendingDesignRef.current = null;
      requestAnimationFrame(() => renderDesignOnGraph(graph, pending));
    } else if (componentsRef.current.length && !graph.getNodes().length) {
      requestAnimationFrame(() => {
        const normalized = drawComponentsOnGraph(graph, componentsRef.current, formWindowRef.current);
        const viewport = viewportRef.current;
        graph.zoomTo(viewport.zoom);
        graph.translate(viewport.panX, viewport.panY);
        setZoom(viewport.zoom);
        commitComponents(normalized);
      });
    }
  }, [actions.deleteSelected, containerRef, graphRef, resizeObserverRef, pendingDesignRef, componentsRef, formWindowRef, suppressMoveSyncRef, viewportRef, modeRef, selectComponent, syncComponentsFromGraph, syncSelectionFromGraph, syncSelectionOverlay, setZoom, setNodeComponentData, clampSize, commitComponents, commitFormWindowConfig, finalizeComponents, renderDesignOnGraph, drawComponentsOnGraph, syncGraphSize]);

  useEffect(() => {
    const handleWindowResize = () => {
      requestAnimationFrame(syncGraphSize);
    };
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, [syncGraphSize, resizeObserverRef]);

  useEffect(() => {
    componentsRef.current = components;
    const graph = graphRef.current;
    if (!graph || !components.length || graph.getNodes().length) return;
    const normalized = drawComponentsOnGraph(graph, components, formWindowRef.current);
    const viewport = viewportRef.current;
    graph.zoomTo(viewport.zoom);
    graph.translate(viewport.panX, viewport.panY);
    setZoom(viewport.zoom);
    if (normalized.some((item, index) => item.width !== components[index]?.width || item.height !== components[index]?.height)) {
      commitComponents(normalized);
    }
  }, [components, componentsRef, formWindowRef, graphRef, viewportRef, drawComponentsOnGraph, setZoom, commitComponents]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    selectedIdsRef.current = selectedIds;
    syncGraphSelectionState(selectedIds);
    syncSelectionOverlay(selectedId);
  }, [selectedId, selectedIds, selectedIdRef, selectedIdsRef, syncGraphSelectionState, syncSelectionOverlay]);

  const { zoomIn, zoomOut, resetView, fitContent } = useCanvasViewport(graphRef, setZoom, () => syncSelectionOverlay());

  const refreshCanvasSize = useCallback(() => {
    initGraph();
    requestAnimationFrame(() => {
      syncGraphSize();
      requestAnimationFrame(() => {
        syncGraphSize();
        syncSelectionOverlay();
      });
    });
  }, [initGraph, syncGraphSize, syncSelectionOverlay]);

  const applyAutoLayout = useCallback(() => {
    const graph = graphRef.current;
    const measuredControls: MeasuredNodeBox[] = measureRenderedControls(containerRef.current, componentsRef.current);
    const result = layoutForm(componentsRef.current, { getControl }, {
      contentWidth: getFormWindowLayout(formWindowRef.current).content.width,
      measuredControls,
    });
    if (!graph) {
      commitComponents(finalizeComponents(result.components));
      return result.diagnostics;
    }

    graph.startBatch('auto-layout');
    try {
      const finalized = finalizeComponents(result.components);
      commitComponents(finalized);
    } finally {
      graph.stopBatch('auto-layout');
    }
    bumpHistoryRevision();
    requestAnimationFrame(() => syncSelectionOverlay(selectedIdRef.current));
    return result.diagnostics;
  }, [containerRef, formWindowRef, graphRef, componentsRef, commitComponents, finalizeComponents, selectedIdRef, bumpHistoryRevision, syncSelectionOverlay]);

  const addComponentAtViewportCenter = useCallback((type: string) => {
    const graph = graphRef.current;
    const container = containerRef.current;
    const control = getControl(type);
    if (!graph || !container || !control) return null;
    const bounds = container.getBoundingClientRect();
    const point = graph.clientToLocal(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return actions.addComponent(
      type,
      Math.round(point.x - control.defaultSize.w / 2),
      Math.round(point.y - control.defaultSize.h / 2),
    );
  }, [actions.addComponent, containerRef, graphRef]);

  const canUndo = !!graphRef.current?.canUndo?.();
  const canRedo = !!graphRef.current?.canRedo?.();
  const canPaste = !!graphRef.current && !graphRef.current.isClipboardEmpty?.();

  return {
    containerRef, graphRef, resizeObserverRef, initGraph,
    selectedId, selectedIds, setSelectedId: selectComponent, selectionOverlay, components, formWindow, zoom, mode, historyRevision: state.historyRevision,
    addComponent: actions.addComponent,
    addComponentAtViewportCenter,
    removeComponent: actions.removeComponent,
    updateComponentProps: actions.updateComponentProps,
    updateComponentGeometry: actions.updateComponentGeometry,
    reparentComponent: actions.reparentComponent,
    clearDesign: io.clearDesign,
    loadDesign: io.loadDesign,
    exportDesign: io.exportDesign,
    deleteSelected: actions.deleteSelected,
    zoomIn, zoomOut, resetView, fitContent,
    refreshCanvasSize,
    undo: history.undo,
    redo: history.redo,
    canUndo, canRedo, canPaste,
    copy: clipboard.copy,
    paste: clipboard.paste,
    duplicate: clipboard.duplicate,
    bringToFront: actions.bringToFront,
    sendToBack: actions.sendToBack,
    startResize: actions.startResize,
    toggleMode: io.toggleMode,
    applyAutoLayout,
  };
}
