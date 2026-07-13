import { useCallback } from 'react';
import type { Node } from '@antv/x6';
import type { DesignComponent } from '../../project/types';
import type { DesignerState, SelectionOverlay, ResizeHandle } from './useDesignerState';
import { getControl } from '../registry';
import { findContainerAtPoint, findContainerParent, getDescendantIds, CONTAINER_TYPES } from '../utils';

interface DesignerActionsCtx extends DesignerState {
  finalizeComponents: (items: DesignComponent[]) => DesignComponent[];
  selectComponent: (id: string | null) => void;
  syncComponentsFromGraph: () => void;
  syncSelectionOverlay: (id?: string | null) => void;
}

export function useDesignerActions(ctx: DesignerActionsCtx) {
  const {
    graphRef,
    componentsRef,
    selectedIdRef,
    clampSize,
    commitComponents,
    setNodeComponentData,
    finalizeComponents,
    selectComponent,
    syncComponentsFromGraph,
    syncSelectionOverlay,
  } = ctx;

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
  }, [graphRef, componentsRef, clampSize, commitComponents, finalizeComponents, selectComponent, setNodeComponentData]);

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
  }, [graphRef, componentsRef, selectedIdRef, commitComponents, finalizeComponents, selectComponent]);

  const deleteSelected = useCallback(() => {
    if (!ctx.selectedId) return;
    removeComponent(ctx.selectedId);
  }, [removeComponent, ctx.selectedId]);

  const updateComponentProps = useCallback((id: string, patch: Record<string, any>) => {
    const nextComponents = finalizeComponents(componentsRef.current.map((c) => c.id === id
      ? { ...c, props: { ...c.props, ...patch } }
      : c));
    const next = nextComponents.find((item) => item.id === id);
    const graph = graphRef.current;
    const node = graph?.getCellById(id) as Node | null;
    if (node && next) {
      graph?.startBatch('property-edit');
      try { setNodeComponentData(node, next); } finally { graph?.stopBatch('property-edit'); }
    }
    commitComponents(nextComponents);
    syncSelectionOverlay(id);
  }, [graphRef, componentsRef, commitComponents, finalizeComponents, setNodeComponentData, syncSelectionOverlay]);

  const updateComponentGeometry = useCallback((id: string, patch: Partial<Pick<DesignComponent, 'x' | 'y' | 'width' | 'height'>>) => {
    const current = componentsRef.current.find((item) => item.id === id);
    if (!current) return;
    const size = clampSize(current.type, Number(patch.width ?? current.width), Number(patch.height ?? current.height));
    const next = { ...current, ...patch, width: size.width, height: size.height };
    const graph = graphRef.current;
    const node = graph?.getCellById(id) as Node | null;
    if (node) {
      graph?.startBatch('geometry-edit');
      try {
        node.setPosition(Number(next.x), Number(next.y));
        node.setSize(next.width, next.height);
        setNodeComponentData(node, next);
      } finally { graph?.stopBatch('geometry-edit'); }
    }
    commitComponents((items) => finalizeComponents(items.map((item) => item.id === id ? next : item)));
    syncSelectionOverlay(id);
  }, [clampSize, commitComponents, componentsRef, finalizeComponents, graphRef, setNodeComponentData, syncSelectionOverlay]);

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
    const min = { w: 96, h: 28 };

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
  }, [graphRef, selectedIdRef, componentsRef, commitComponents, setNodeComponentData, finalizeComponents, syncSelectionOverlay]);

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
  }, [graphRef, componentsRef, selectedIdRef, commitComponents, finalizeComponents, setNodeComponentData]);

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
  }, [graphRef, selectedIdRef, resizeSelected]);

  const bringToFront = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const maxZ = Math.max(0, ...graph.getCells().map((cell: any) => cell.getZIndex() ?? 0));
    graph.getSelectedCells().forEach((cell: any, index: number) => cell.setZIndex(maxZ + index + 1));
    syncComponentsFromGraph();
  }, [graphRef, syncComponentsFromGraph]);

  const sendToBack = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const minZ = Math.min(0, ...graph.getCells().map((cell: any) => cell.getZIndex() ?? 0));
    graph.getSelectedCells().forEach((cell: any, index: number) => cell.setZIndex(minZ - index - 1));
    syncComponentsFromGraph();
  }, [graphRef, syncComponentsFromGraph]);

  return {
    addComponent,
    removeComponent,
    deleteSelected,
    updateComponentProps,
    updateComponentGeometry,
    resizeSelected,
    reparentComponent,
    startResize,
    bringToFront,
    sendToBack,
  };
}
