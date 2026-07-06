import { useRef, useCallback, useEffect, useState } from 'react';
import { Graph, type Node, Selection, Snapline, Clipboard, Keyboard, History } from '@antv/x6';
import { register } from '@antv/x6-react-shape';
import React from 'react';
import type { DesignComponent, DesignFile } from '../project/types';
import { getControl } from './registry';

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

const MIN_SIZES: Record<string, { w: number; h: number }> = {
  input: { w: 160, h: 64 },
  textarea: { w: 180, h: 92 },
  number: { w: 150, h: 64 },
  datePicker: { w: 160, h: 64 },
  timePicker: { w: 160, h: 64 },
  dateRange: { w: 240, h: 64 },
  select: { w: 170, h: 64 },
  segmented: { w: 220, h: 64 },
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
  table: { w: 220, h: 120 },
  chart: { w: 220, h: 140 },
  card: { w: 220, h: 140 },
  tabs: { w: 240, h: 140 },
  steps: { w: 320, h: 88 },
  divider: { w: 32, h: 8 },
  form: { w: 360, h: 420 },
};

const CONTAINER_TYPES = new Set(['card', 'tabs', 'form']);

export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface SelectionOverlay {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

function findContainerAtPoint(x: number, y: number, components: DesignComponent[], excludeId?: string): string | undefined {
  let best: { id: string; area: number } | null = null;
  for (const container of components) {
    if (!CONTAINER_TYPES.has(container.type) || container.id === excludeId) continue;
    const inside = x >= container.x && x <= container.x + container.width && y >= container.y && y <= container.y + container.height;
    if (!inside) continue;
    const area = container.width * container.height;
    if (!best || area < best.area) best = { id: container.id, area };
  }
  return best?.id;
}

function findContainerParent(component: DesignComponent, components: DesignComponent[]): string | undefined {
  const descendants = getDescendantIds(components, component.id);
  const centerX = component.x + component.width / 2;
  const centerY = component.y + component.height / 2;
  let best: { id: string; area: number; containsCenter: boolean; ratio: number } | null = null;
  for (const container of components) {
    if (!CONTAINER_TYPES.has(container.type) || container.id === component.id || descendants.has(container.id)) continue;
    const overlapX = Math.max(0, Math.min(component.x + component.width, container.x + container.width) - Math.max(component.x, container.x));
    const overlapY = Math.max(0, Math.min(component.y + component.height, container.y + container.height) - Math.max(component.y, container.y));
    const overlapArea = overlapX * overlapY;
    const ratio = overlapArea / Math.max(1, component.width * component.height);
    const containsCenter = centerX >= container.x && centerX <= container.x + container.width && centerY >= container.y && centerY <= container.y + container.height;
    if (!containsCenter && ratio < 0.35) continue;
    const area = container.width * container.height;
    if (!best || (containsCenter && !best.containsCenter) || (containsCenter === best.containsCenter && area < best.area)) {
      best = { id: container.id, area, containsCenter, ratio };
    }
  }
  return best?.id;
}

function getDescendantIds(components: DesignComponent[], id: string): Set<string> {
  const result = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const component of components) {
      if (component.parentId && (component.parentId === id || result.has(component.parentId)) && !result.has(component.id)) {
        result.add(component.id);
        changed = true;
      }
    }
  }
  return result;
}

function normalizeContainerChildren(components: DesignComponent[]): DesignComponent[] {
  const childrenByParent = new Map<string, string[]>();
  for (const component of components) {
    if (component.parentId) {
      childrenByParent.set(component.parentId, [...(childrenByParent.get(component.parentId) || []), component.id]);
    }
  }
  return components.map((component) => {
    if (!CONTAINER_TYPES.has(component.type)) {
      return component.children?.length ? { ...component, children: undefined } : component;
    }
    const children = childrenByParent.get(component.id) || [];
    return { ...component, children };
  });
}

function isContainerComponent(component?: DesignComponent | null) {
  return !!component && CONTAINER_TYPES.has(component.type);
}

function getContainerAutoInsets(component: DesignComponent) {
  if (component.type === 'form') return { top: 110, right: 28, bottom: 28, left: 28 };
  if (component.type === 'card') return { top: component.props.subtitle ? 56 : 40, right: 20, bottom: 20, left: 20 };
  if (component.type === 'tabs') return { top: 48, right: 16, bottom: 16, left: 16 };
  return { top: 24, right: 16, bottom: 16, left: 16 };
}

function autoResizeContainers(components: DesignComponent[]) {
  const next = components.map((component) => ({ ...component }));
  const byParent = new Map<string, DesignComponent[]>();
  const byId = new Map(next.map((component) => [component.id, component] as const));
  for (const component of next) {
    if (!component.parentId) continue;
    byParent.set(component.parentId, [...(byParent.get(component.parentId) || []), component]);
  }

  const getDepth = (component: DesignComponent) => {
    let depth = 0;
    let current = component;
    while (current.parentId) {
      const parent = byId.get(current.parentId);
      if (!parent) break;
      depth += 1;
      current = parent;
    }
    return depth;
  };

  const containers = next
    .filter((component) => CONTAINER_TYPES.has(component.type))
    .sort((a, b) => getDepth(b) - getDepth(a));

  for (const container of containers) {
    const children = byParent.get(container.id) || [];
    if (children.length === 0) continue;
    const insets = getContainerAutoInsets(container);
    const minLeft = Math.min(...children.map((child) => child.x));
    const minTop = Math.min(...children.map((child) => child.y));
    const maxRight = Math.max(...children.map((child) => child.x + child.width));
    const maxBottom = Math.max(...children.map((child) => child.y + child.height));

    const shiftedX = minLeft < container.x + insets.left ? minLeft - insets.left : container.x;
    const shiftedY = minTop < container.y + insets.top ? minTop - insets.top : container.y;
    const nextWidth = Math.max(container.width + (container.x - shiftedX), maxRight - shiftedX + insets.right);
    const nextHeight = Math.max(container.height + (container.y - shiftedY), maxBottom - shiftedY + insets.bottom);

    const target = byId.get(container.id);
    if (!target) continue;
    target.x = Math.round(shiftedX);
    target.y = Math.round(shiftedY);
    target.width = Math.round(nextWidth);
    target.height = Math.round(nextHeight);
  }

  return next;
}

export function useDesigner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const pendingDesignRef = useRef<DesignFile | null>(null);
  const componentsRef = useRef<DesignComponent[]>([]);
  const suppressMoveSyncRef = useRef(false);
  const viewportRef = useRef<DesignFile['viewport']>({ zoom: 1, panX: 0, panY: 0 });
  const modeRef = useRef<'design' | 'preview'>('design');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionOverlay, setSelectionOverlay] = useState<SelectionOverlay | null>(null);
  const [components, setComponents] = useState<DesignComponent[]>([]);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<'design' | 'preview'>('design');

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

  const syncGraphSelectionState = useCallback((id: string | null) => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.getNodes().forEach((node) => {
      const data = node.getData();
      node.setData({ ...data, selected: node.id === id }, { overwrite: false });
    });
  }, []);

  const clampSize = useCallback((type: string, width: number, height: number) => {
    const min = MIN_SIZES[type] ?? { w: 96, h: 28 };
    return {
      width: Math.max(min.w, width),
      height: Math.max(min.h, height),
    };
  }, []);

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
  }, [setNodeComponentData]);

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
  }, [ensureHierarchyZ, setNodeComponentData, syncGraphEmbedding]);

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
  }, []);

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
  }, [syncSelectionOverlay]);

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
  }, [syncGraphSelectionState, syncSelectionOverlayWhenRendered]);

  const syncComponentsFromGraph = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const next: DesignComponent[] = [];
    graph.getNodes().forEach((node) => {
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
  }, [clampSize, commitComponents, finalizeComponents, selectComponent, setNodeComponentData, syncGraphSelectionState, syncSelectionOverlay]);

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
  }, [commitComponents, drawComponentsOnGraph, selectComponent]);

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
      requestAnimationFrame(syncComponentsFromGraph);
      return false;
    });
    graph.bindKey(['meta+shift+z', 'ctrl+shift+z'], () => {
      graph.redo();
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
  }, [clampSize, commitComponents, drawComponentsOnGraph, finalizeComponents, renderDesignOnGraph, selectComponent, setNodeComponentData, syncComponentsFromGraph, syncSelectionOverlay]);

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
  }, [commitComponents, components, drawComponentsOnGraph]);

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
  }, [selectedId, syncGraphSelectionState, syncSelectionOverlay]);

  const addComponent = useCallback((type: string, x: number, y: number, dropPoint?: { x: number; y: number }) => {
    const control = getControl(type);
    if (!control) return;
    const graph = graphRef.current;
    if (!graph) return;

    selectComponent(null);

    const id = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const size = clampSize(type, control.defaultSize.w, control.defaultSize.h);
    const autoName = control.defaultProps.name === '' ? `${type}_${Date.now().toString(36).slice(-4)}` : control.defaultProps.name;
    const comp: DesignComponent = {
      id, type, x, y,
      width: size.width,
      height: size.height,
      zIndex: graph.getNodes().length + 1,
      props: { ...control.defaultProps, name: autoName },
    };

    comp.parentId = (dropPoint ? findContainerAtPoint(dropPoint.x, dropPoint.y, componentsRef.current) : undefined)
      || findContainerParent(comp, componentsRef.current);

    let node: Node;
    try {
      node = graph.addNode({
        id, x, y,
        width: size.width,
        height: size.height,
        zIndex: comp.zIndex,
        shape: 'design-node',
        data: { componentType: type, designComponent: comp, selected: false },
      });
    } catch (error) {
      console.warn('[designer] add node failed:', error);
      return;
    }
    const created = graph.getCellById(id);
    if (!created || !created.isNode()) {
      console.warn('[designer] add node returned without a graph node:', { type, id, x, y });
      return;
    }

    setNodeComponentData(node, comp);
    if (comp.parentId) {
      const parentNode = graph.getCellById(comp.parentId) as Node | null;
      parentNode?.embed(node, { ui: true });
    }
    commitComponents((prev) => finalizeComponents([...prev, comp]));
    selectComponent(id);
    return id;
  }, [clampSize, commitComponents, finalizeComponents, selectComponent, setNodeComponentData]);

  const removeComponent = useCallback((id: string) => {
    const removeIds = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const component of componentsRef.current) {
        if (component.parentId && removeIds.has(component.parentId) && !removeIds.has(component.id)) {
          removeIds.add(component.id);
          changed = true;
        }
      }
    }
    const graph = graphRef.current;
    graph?.removeCells([...removeIds].map((removeId) => graph.getCellById(removeId)).filter(Boolean) as any);
    commitComponents((prev) => finalizeComponents(prev
      .filter((c) => !removeIds.has(c.id))
      .map((c) => c.children ? { ...c, children: c.children.filter((childId) => !removeIds.has(childId)) } : c)));
    if (selectedIdRef.current && removeIds.has(selectedIdRef.current)) selectComponent(null);
  }, [commitComponents, selectComponent]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    removeComponent(selectedId);
  }, [removeComponent, selectedId]);

  const updateComponentProps = useCallback((id: string, patch: Record<string, any>) => {
    commitComponents((prev) => finalizeComponents(prev.map((c) => {
      if (c.id !== id) return c;
      const next = { ...c, props: { ...c.props, ...patch } };
      const node = graphRef.current?.getCellById(id) as Node | null;
      if (node) {
        setNodeComponentData(node, next);
      }
      return next;
    })));
    syncSelectionOverlay(id);
  }, [commitComponents, finalizeComponents, setNodeComponentData, syncSelectionOverlay]);

  const clearDesign = useCallback(() => {
    const graph = graphRef.current;
    if (graph) graph.clearCells();
    commitComponents([]);
    selectComponent(null);
    pendingDesignRef.current = null;
  }, [commitComponents, selectComponent]);

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
  }, [clampSize, commitComponents, renderDesignOnGraph, selectComponent]);

  const resizeSelected = useCallback((handle: ResizeHandle, clientX: number, clientY: number, start: {
    x: number;
    y: number;
    width: number;
    height: number;
    pointerX: number;
    pointerY: number;
    type: string;
  }) => {
    const graph = graphRef.current;
    const id = selectedIdRef.current;
    if (!graph || !id) return;
    const node = graph.getCellById(id) as Node | null;
    if (!node || !node.isNode()) return;

    const startPoint = graph.clientToLocal(start.pointerX, start.pointerY);
    const currentPoint = graph.clientToLocal(clientX, clientY);
    const dx = currentPoint.x - startPoint.x;
    const dy = currentPoint.y - startPoint.y;
    const min = MIN_SIZES[start.type] ?? { w: 96, h: 28 };

    let x = start.x;
    let y = start.y;
    let width = start.width;
    let height = start.height;

    if (handle.includes('e')) width = start.width + dx;
    if (handle.includes('s')) height = start.height + dy;
    if (handle.includes('w')) {
      width = start.width - dx;
      x = start.x + dx;
    }
    if (handle.includes('n')) {
      height = start.height - dy;
      y = start.y + dy;
    }

    if (width < min.w) {
      if (handle.includes('w')) x -= min.w - width;
      width = min.w;
    }
    if (height < min.h) {
      if (handle.includes('n')) y -= min.h - height;
      height = min.h;
    }

    const next = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };
    node.setPosition(next.x, next.y);
    node.setSize(next.width, next.height);
    const data = node.getData();
    const changed = { ...data.designComponent, ...next, zIndex: node.getZIndex() ?? data.designComponent.zIndex };
    const current = componentsRef.current.map((item) => item.id === id ? changed : item);
    const component = {
      ...changed,
      parentId: findContainerParent(changed, current),
    };
    setNodeComponentData(node, component, true);
    commitComponents((prev) => finalizeComponents(prev.map((item) => item.id === id ? component : item)));
    syncSelectionOverlay(id);
  }, [commitComponents, setNodeComponentData, syncSelectionOverlay]);

  const reparentComponent = useCallback((id: string, parentId?: string) => {
    const target = parentId ? componentsRef.current.find((component) => component.id === parentId) : undefined;
    if (parentId && (!target || !CONTAINER_TYPES.has(target.type))) return;
    if (parentId && getDescendantIds(componentsRef.current, id).has(parentId)) return;
    commitComponents((prev) => {
      const next = prev.map((component) => component.id === id ? { ...component, parentId } : component);
      const normalized = finalizeComponents(next);
      const changed = normalized.find((component) => component.id === id);
      const node = graphRef.current?.getCellById(id) as Node | null;
      const currentParent = node?.getParent() as Node | null;
      if (node && currentParent && (!parentId || currentParent.id !== parentId)) {
        currentParent.unembed(node, { ui: true });
      }
      if (node && parentId) {
        const parentNode = graphRef.current?.getCellById(parentId) as Node | null;
        parentNode?.embed(node, { ui: true });
      }
      if (node?.isNode() && changed) setNodeComponentData(node, changed, selectedIdRef.current === id);
      return normalized;
    });
  }, [commitComponents, finalizeComponents, setNodeComponentData]);

  const startResize = useCallback((handle: ResizeHandle, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const graph = graphRef.current;
    const id = selectedIdRef.current;
    if (!graph || !id) return;
    const node = graph.getCellById(id) as Node | null;
    if (!node || !node.isNode()) return;
    const pos = node.getPosition();
    const size = node.getSize();
    const data = node.getData();
    const start = {
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
      pointerX: event.clientX,
      pointerY: event.clientY,
      type: data.componentType as string,
    };
    const move = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      resizeSelected(handle, moveEvent.clientX, moveEvent.clientY, start);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [resizeSelected]);

  const exportDesign = useCallback((): DesignComponent[] => {
    return components;
  }, [components]);

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
  }, []);
  const zoomIn = useCallback(() => zoomToNearestStep(1), [zoomToNearestStep]);
  const zoomOut = useCallback(() => zoomToNearestStep(-1), [zoomToNearestStep]);
  const resetView = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.zoomTo(1);
    graph.centerContent();
    setZoom(1);
  }, []);
  const fitContent = useCallback(() => {
    graphRef.current?.zoomToFit({ padding: 48 });
    requestAnimationFrame(() => syncSelectionOverlay());
  }, [syncSelectionOverlay]);
  const undo = useCallback(() => {
    graphRef.current?.undo();
    requestAnimationFrame(syncComponentsFromGraph);
  }, [syncComponentsFromGraph]);
  const redo = useCallback(() => {
    graphRef.current?.redo();
    requestAnimationFrame(syncComponentsFromGraph);
  }, [syncComponentsFromGraph]);
  const copy = useCallback(() => {
    const graph = graphRef.current;
    if (graph) graph.copy(graph.getSelectedCells());
  }, []);
  const paste = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
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
        commitComponents((prev) => {
          const combined = [...prev, ...nextComponents];
          return finalizeComponents(combined.map((component) => ({
            ...component,
            parentId: findContainerParent(component, combined),
          })));
        });
        selectComponent(nextComponents[nextComponents.length - 1].id);
      }
  }, [clampSize, commitComponents, finalizeComponents, selectComponent, setNodeComponentData]);

  const duplicate = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.copy(graph.getSelectedCells());
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
        commitComponents((prev) => {
          const combined = [...prev, ...nextComponents];
          return finalizeComponents(combined.map((component) => ({
            ...component,
            parentId: findContainerParent(component, combined),
          })));
        });
        selectComponent(nextComponents[nextComponents.length - 1].id);
      }
  }, [clampSize, commitComponents, finalizeComponents, selectComponent, setNodeComponentData]);

  const bringToFront = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const maxZ = Math.max(0, ...graph.getCells().map((cell) => cell.getZIndex() ?? 0));
    graph.getSelectedCells().forEach((cell, index) => cell.setZIndex(maxZ + index + 1));
    syncComponentsFromGraph();
  }, [syncComponentsFromGraph]);

  const sendToBack = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const minZ = Math.min(0, ...graph.getCells().map((cell) => cell.getZIndex() ?? 0));
    graph.getSelectedCells().forEach((cell, index) => cell.setZIndex(minZ - index - 1));
    syncComponentsFromGraph();
  }, [syncComponentsFromGraph]);

  const toggleMode = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    setMode(prev => {
      const next = prev === 'design' ? 'preview' : 'design';
      modeRef.current = next;
      if (next === 'preview') {
        selectComponent(null);
      }
      return next;
    });
  }, [selectComponent]);

  return {
    containerRef, graphRef, initGraph,
    selectedId, setSelectedId: selectComponent, selectionOverlay, components, zoom, mode,
    addComponent, removeComponent, updateComponentProps, reparentComponent,
    clearDesign, loadDesign, exportDesign,
    deleteSelected, zoomIn, zoomOut, resetView, fitContent, undo, redo, copy, paste,
    duplicate, bringToFront, sendToBack, startResize, toggleMode,
  };
}
