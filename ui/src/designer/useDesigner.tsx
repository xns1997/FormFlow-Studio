import { useRef, useCallback, useEffect, useState } from 'react';
import { Graph, type Node, Selection, Snapline, Clipboard, Keyboard, History } from '@antv/x6';
import { register } from '@antv/x6-react-shape';
import React from 'react';
import type { DesignComponent, DesignFile } from '../project/types';
import { getControl } from './registry';
import { useDesignerState, type SelectionOverlay, type ResizeHandle } from './hooks/useDesignerState';
import { useDesignerActions } from './hooks/useDesignerActions';
import { useDesignerClipboard } from './hooks/useDesignerClipboard';
import { useDesignerHistory } from './hooks/useDesignerHistory';
import { useDesignerIO } from './hooks/useDesignerIO';
import {
  findContainerParent,
  normalizeContainerChildren,
  isContainerComponent,
  getDescendantIds,
  autoResizeContainers,
} from './utils';
import { layoutForm } from '../services/layout';

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
    pendingDesignRef,
    componentsRef,
    suppressMoveSyncRef,
    viewportRef,
    modeRef,
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
    commitComponents,
    setNodeComponentData,
    clampSize,
  } = state;

  const syncGraphSelectionState = useCallback((id: string | null) => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.getNodes().forEach((node: Node) => {
      const data = node.getData();
      node.setData({ ...data, selected: node.id === id }, { overwrite: false });
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

  const finalizeComponents = useCallback((items: DesignComponent[]) => {
    const normalized = normalizeContainerChildren(ensureHierarchyZ(autoResizeContainers(items)));
    const graph = graphRef.current;
    if (graph) {
      syncGraphEmbedding(graph, normalized);
      normalized.forEach((component) => {
        const node = graph.getCellById(component.id) as Node | null;
        if (!node || !node.isNode()) return;
        const pos = node.getPosition();
        const size = node.getSize();
        if (Math.round(pos.x) !== component.x || Math.round(pos.y) !== component.y) {
          node.setPosition(component.x, component.y);
        }
        if (Math.round(size.width) !== component.width || Math.round(size.height) !== component.height) {
          node.setSize(component.width, component.height);
        }
        setNodeComponentData(node, component, selectedIdRef.current === component.id);
      });
    }
    return normalized;
  }, [graphRef, selectedIdRef, ensureHierarchyZ, setNodeComponentData, syncGraphEmbedding]);

  const syncSelectionOverlay = useCallback((id: string | null = selectedIdRef.current) => {
    const graph = graphRef.current;
    const shell = containerRef.current?.parentElement;
    if (!graph || !shell || !id) {
      setSelectionOverlay(null);
      return;
    }
    const node = graph.getCellById(id) as Node | null;
    if (!node || !node.isNode()) {
      setSelectionOverlay(null);
      return;
    }
    const renderedNode = containerRef.current?.querySelector(`[data-cell-id="${id}"] foreignObject`) as SVGForeignObjectElement | null;
    if (!renderedNode) {
      setSelectionOverlay(null);
      return;
    }
    const clientRect = renderedNode.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const nextOverlay = {
      id,
      left: clientRect.x - shellRect.left,
      top: clientRect.y - shellRect.top,
      width: clientRect.width,
      height: clientRect.height,
    };
    setSelectionOverlay(nextOverlay);
  }, [containerRef, graphRef, setSelectionOverlay, selectedIdRef]);

  const syncSelectionOverlayWhenRendered = useCallback((id: string, attempt = 0) => {
    requestAnimationFrame(() => {
      const graph = graphRef.current;
      const renderedNode = containerRef.current?.querySelector(`[data-cell-id="${id}"] foreignObject`);
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
    setSelectedId(id);
    if (!graph) {
      setSelectionOverlay(null);
      return;
    }
    graph.cleanSelection();
    if (id) {
      const cell = graph.getCellById(id);
      if (cell) graph.select(cell);
    }
    syncGraphSelectionState(id);
    if (id) {
      syncSelectionOverlayWhenRendered(id);
    } else {
      setSelectionOverlay(null);
    }
  }, [graphRef, selectedIdRef, setSelectedId, setSelectionOverlay, syncGraphSelectionState, syncSelectionOverlayWhenRendered]);

  const syncComponentsFromGraph = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
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
      const component = {
        ...source,
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        width: Math.round(bounded.width),
        height: Math.round(bounded.height),
        zIndex: node.getZIndex() ?? source.zIndex,
        parentId: node.getParent()?.id || undefined,
      };
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
      syncGraphSelectionState(selectedIdRef.current);
      syncSelectionOverlay(selectedIdRef.current);
    }
  }, [graphRef, selectedIdRef, clampSize, commitComponents, finalizeComponents, selectComponent, setNodeComponentData, syncGraphSelectionState, syncSelectionOverlay]);

  const drawComponentsOnGraph = useCallback((graph: Graph, source: DesignComponent[]) => {
    graph.clearCells();
    const normalized = autoResizeContainers(source.map((comp) => {
      const size = clampSize(comp.type, comp.width, comp.height);
      return { ...comp, width: size.width, height: size.height };
    }));
    for (const comp of normalized) {
      graph.addNode({
        id: comp.id,
        x: comp.x, y: comp.y,
        width: comp.width, height: comp.height,
        zIndex: comp.zIndex,
        shape: 'design-node',
        data: { componentType: comp.type, designComponent: comp, selected: false },
      });
    }
    finalizeComponents(normalized);
    return normalized;
  }, [clampSize, finalizeComponents]);

  const renderDesignOnGraph = useCallback((graph: Graph, design: DesignFile) => {
    viewportRef.current = design.viewport;
    const normalized = drawComponentsOnGraph(graph, design.components);
    graph.zoomTo(design.viewport.zoom);
    graph.translate(design.viewport.panX, design.viewport.panY);
    setZoom(design.viewport.zoom);
    commitComponents(normalized);
    selectComponent(null);
  }, [viewportRef, drawComponentsOnGraph, setZoom, commitComponents, selectComponent]);

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
    graph.use(new Selection({ enabled: true, showNodeSelectionBox: false, multiple: false, rubberband: false, movable: false }));
    graph.use(new Snapline({ enabled: true }));
    graph.use(new Clipboard({ enabled: true, useLocalStorage: false }));
    graph.use(new Keyboard({ enabled: true, global: false }));
    graph.use(new History({ enabled: true }));
    graph.on('node:click', ({ node }) => {
      if (modeRef.current === 'preview') return;
      selectComponent(node.id);
    });
    graph.on('blank:click', () => {
      selectComponent(null);
    });
    graph.on('node:change:parent', () => {
      requestAnimationFrame(syncComponentsFromGraph);
    });
    graph.on('scale', ({ sx }) => {
      setZoom(sx);
      requestAnimationFrame(() => syncSelectionOverlay());
    });
    graph.on('resize', () => requestAnimationFrame(() => syncSelectionOverlay()));
    graph.on('node:change:position', ({ node }) => requestAnimationFrame(() => syncSelectionOverlay(node.id)));
    graph.on('node:change:size', ({ node }) => requestAnimationFrame(() => syncSelectionOverlay(node.id)));
    graph.on('node:moved', ({ node }) => {
      if (suppressMoveSyncRef.current) return;
      const pos = node.getPosition();
      const snappedX = Math.round(pos.x / 10) * 10;
      const snappedY = Math.round(pos.y / 10) * 10;
      suppressMoveSyncRef.current = true;
      node.setPosition(snappedX, snappedY, { deep: true });
      requestAnimationFrame(() => {
        syncComponentsFromGraph();
        suppressMoveSyncRef.current = false;
        syncSelectionOverlay(node.id);
      });
    });
    graph.on('translate', () => requestAnimationFrame(() => syncSelectionOverlay()));
    graph.bindKey(['backspace', 'delete'], () => {
      const cells = graph.getSelectedCells();
      if (cells.length) {
        const ids = cells.map((cell) => cell.id);
        graph.removeCells(cells);
        commitComponents((prev) => finalizeComponents(prev
          .filter((c) => !ids.includes(c.id))
          .map((c) => c.children ? { ...c, children: c.children.filter((childId) => !ids.includes(childId)) } : c)));
        selectComponent(null);
      }
      return false;
    });
    graph.bindKey(['meta+c', 'ctrl+c'], () => {
      graph.copy(graph.getSelectedCells());
      return false;
    });
    graph.bindKey(['meta+a', 'ctrl+a'], () => {
      const nodes = graph.getNodes();
      selectComponent(nodes[nodes.length - 1]?.id ?? null);
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
        const comp: DesignComponent = {
          ...data.designComponent,
          id: node.id,
          x: pos.x,
          y: pos.y,
          width: bounded.width,
          height: bounded.height,
          zIndex: node.getZIndex() ?? data.designComponent?.zIndex,
        };
        node.setSize(bounded.width, bounded.height);
        setNodeComponentData(node, comp, true);
        nextComponents.push(comp);
      });
      if (nextComponents.length) {
        commitComponents((prev) => finalizeComponents([...prev, ...nextComponents].map((component) => ({
          ...component,
          parentId: findContainerParent(component, [...prev, ...nextComponents]),
        }))));
        selectComponent(nextComponents[nextComponents.length - 1].id);
      }
      return false;
    });
    graph.bindKey(['meta+z', 'ctrl+z'], () => {
      graph.undo();
      state.bumpHistoryRevision();
      requestAnimationFrame(syncComponentsFromGraph);
      return false;
    });
    graph.bindKey(['meta+shift+z', 'ctrl+shift+z'], () => {
      graph.redo();
      state.bumpHistoryRevision();
      requestAnimationFrame(syncComponentsFromGraph);
      return false;
    });
    const nudge = (dx: number, dy: number) => {
      const nodes = graph.getSelectedCells().filter((cell): cell is Node => cell.isNode());
      if (!nodes.length) return false;
      nodes.forEach((node) => {
        node.translate(dx, dy, { deep: true });
        const pos = node.getPosition();
        const data = node.getData();
        const next = { ...data.designComponent, x: pos.x, y: pos.y };
        setNodeComponentData(node, next, true);
      });
      const ids = nodes.map((node) => node.id);
      commitComponents((prev) => {
        const moved = prev.map((component) => {
          if (!ids.includes(component.id)) return component;
          const node = graph.getCellById(component.id) as Node | null;
          const pos = node?.getPosition();
          return pos ? { ...component, x: pos.x, y: pos.y, zIndex: node?.getZIndex() ?? component.zIndex, parentId: node?.getParent()?.id || component.parentId } : component;
        });
        return finalizeComponents(moved.map((component) => ids.includes(component.id) && !component.parentId
          ? { ...component, parentId: findContainerParent(component, moved) }
          : component));
      });
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
        const normalized = drawComponentsOnGraph(graph, componentsRef.current);
        const viewport = viewportRef.current;
        graph.zoomTo(viewport.zoom);
        graph.translate(viewport.panX, viewport.panY);
        setZoom(viewport.zoom);
        commitComponents(normalized);
      });
    }
  }, [containerRef, graphRef, resizeObserverRef, pendingDesignRef, componentsRef, suppressMoveSyncRef, viewportRef, modeRef, selectComponent, syncComponentsFromGraph, syncSelectionOverlay, setZoom, setNodeComponentData, clampSize, commitComponents, finalizeComponents, renderDesignOnGraph, drawComponentsOnGraph, syncGraphSize]);

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
    const normalized = drawComponentsOnGraph(graph, components);
    const viewport = viewportRef.current;
    graph.zoomTo(viewport.zoom);
    graph.translate(viewport.panX, viewport.panY);
    setZoom(viewport.zoom);
    if (normalized.some((item, index) => item.width !== components[index]?.width || item.height !== components[index]?.height)) {
      commitComponents(normalized);
    }
  }, [components, componentsRef, graphRef, viewportRef, drawComponentsOnGraph, setZoom, commitComponents]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    const graph = graphRef.current;
    if (!graph) return;
    syncGraphSelectionState(selectedId);
    if (selectedId) {
      const cell = graph.getCellById(selectedId);
      if (cell) graph.select(cell);
    } else {
      graph.cleanSelection();
    }
    syncSelectionOverlay(selectedId);
  }, [selectedId, selectedIdRef, graphRef, syncGraphSelectionState, syncSelectionOverlay]);

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
    const result = layoutForm(componentsRef.current, { getControl });
    if (!graph) {
      commitComponents(result.components);
      return result.diagnostics;
    }

    graph.startBatch('auto-layout');
    for (const component of result.components) {
      const node = graph.getCellById(component.id) as Node | null;
      if (!node || !node.isNode()) continue;
      const currentParent = node.getParent() as Node | null;
      if (currentParent && currentParent.id !== component.parentId) {
        currentParent.unembed(node, { ui: true });
      }
      if (component.parentId && currentParent?.id !== component.parentId) {
        const parentNode = graph.getCellById(component.parentId) as Node | null;
        parentNode?.embed(node, { ui: true });
      }
      node.setPosition(component.x, component.y);
      node.setSize(component.width, component.height);
      node.setZIndex(component.zIndex ?? node.getZIndex() ?? 1);
      setNodeComponentData(node, component, selectedIdRef.current === component.id);
    }
    graph.stopBatch('auto-layout');
    commitComponents(result.components);
    syncComponentsFromGraph();
    return result.diagnostics;
  }, [graphRef, componentsRef, commitComponents, setNodeComponentData, selectedIdRef, syncComponentsFromGraph]);

  return {
    containerRef, graphRef, resizeObserverRef, initGraph,
    selectedId, setSelectedId: selectComponent, selectionOverlay, components, zoom, mode, historyRevision: state.historyRevision,
    addComponent: actions.addComponent,
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
