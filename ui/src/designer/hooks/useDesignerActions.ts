import { useCallback } from 'react';
import type { Node } from '@antv/x6';
import type { DesignComponent } from '../../project/types';
import type { DesignerState, ResizeHandle } from './useDesignerState';
import { getControl } from '../registry';
import { findContainerAtPoint, findContainerParent, getDescendantIds, CONTAINER_TYPES } from '../utils';
import { FORM_WINDOW_CELL_ID } from '../formWindowModel';
import {
  canvasToLocalPoint,
  canvasToLocalRect,
  clampComponentToContent,
  growFormWindowToFit,
  localToCanvasPoint,
} from '../../../../shared/form-window-layout';

interface DesignerActionsCtx extends DesignerState {
  finalizeComponents: (items: DesignComponent[]) => DesignComponent[];
  selectComponent: (id: string | null) => void;
  syncComponentsFromGraph: () => void;
  syncSelectionOverlay: (id?: string | null) => void;
}

/** 生成可读字段名（去重、按类型规范化）。 */
export function createReadableFieldName(label: string, type: string, existingNames: Iterable<string>) {
  const readableSeed = String(label || '').trim().replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '') || type;
  const taken = new Set(existingNames);
  let name = readableSeed;
  let suffix = 2;
  while (taken.has(name)) name = `${readableSeed}_${suffix++}`;
  return name;
}

/** 设计器动作 Hook：增删改、复制粘贴、撤销重做。 */
export function useDesignerActions(ctx: DesignerActionsCtx) {
  const {
    graphRef,
    componentsRef,
    formWindowRef,
    setFormWindow,
    selectedIdRef,
    clampSize,
    commitComponents,
    setNodeComponentData,
    finalizeComponents,
    selectComponent,
    syncComponentsFromGraph,
    syncSelectionOverlay,
  } = ctx;

  const updateFormWindow = useCallback((patch: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    props?: Record<string, any>;
  }) => {
    const current = formWindowRef.current;
    const next = {
      ...current,
      ...patch,
      width: Math.max(320, Number(patch.width ?? current.width)),
      height: Math.max(240, Number(patch.height ?? current.height)),
      props: patch.props ? { ...current.props, ...patch.props } : current.props,
    };
    const fitted = growFormWindowToFit(next, componentsRef.current);
    formWindowRef.current = fitted;
    setFormWindow(fitted);
    commitComponents((items) => finalizeComponents(items));
    syncSelectionOverlay(FORM_WINDOW_CELL_ID);
  }, [commitComponents, componentsRef, finalizeComponents, formWindowRef, setFormWindow, syncSelectionOverlay]);

  const addComponent = useCallback((
    type: string,
    x: number,
    y: number,
    dropPoint?: { x: number; y: number },
    initialProps?: Record<string, any>,
  ) => {
    const control = getControl(type);
    if (!control) return;
    const graph = graphRef.current;
    if (!graph) return;

    selectComponent(null);

    const id = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const size = clampSize(type, control.defaultSize.w, control.defaultSize.h);
    const existingNames = new Set(componentsRef.current.map((item) => String(item.fieldBinding || item.props?.name || '').trim()).filter(Boolean));
    const labelSeed = String(initialProps?.label || control.defaultProps.label || '').trim();
    const shouldNameField = (control.category === 'basic' || control.category === 'select') && type !== 'button';
    let autoName = control.defaultProps.name || '';
    if (!autoName && shouldNameField) {
      autoName = createReadableFieldName(labelSeed, type, existingNames);
    }
    const localPoint = canvasToLocalPoint(formWindowRef.current, { x, y });
    const comp: DesignComponent = {
      id, type,
      x: Math.max(0, Math.round(localPoint.x)),
      y: Math.max(0, Math.round(localPoint.y)),
      width: size.width,
      height: size.height,
      zIndex: graph.getNodes().length + 1,
      props: { ...control.defaultProps, name: autoName, ...initialProps },
    };

    const localDropPoint = dropPoint ? canvasToLocalPoint(formWindowRef.current, dropPoint) : undefined;
    comp.parentId = (localDropPoint ? findContainerAtPoint(localDropPoint.x, localDropPoint.y, componentsRef.current) : undefined)
      || findContainerParent(comp, componentsRef.current);
    const canvasPoint = localToCanvasPoint(formWindowRef.current, comp);

    let node: Node;
    try {
      node = graph.addNode({
        id, x: canvasPoint.x, y: canvasPoint.y,
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
  }, [graphRef, componentsRef, formWindowRef, clampSize, commitComponents, finalizeComponents, selectComponent, setNodeComponentData]);

  const removeComponents = useCallback((ids: string[]) => {
    const removeIds = new Set(ids.filter((id) => id !== FORM_WINDOW_CELL_ID));
    if (!removeIds.size) return;
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
    selectComponent(null);
  }, [graphRef, componentsRef, selectedIdRef, commitComponents, finalizeComponents, selectComponent]);

  const removeComponent = useCallback((id: string) => {
    removeComponents([id]);
  }, [removeComponents]);

  const deleteSelected = useCallback(() => {
    const selected = graphRef.current?.getSelectedCells()
      .filter((cell: Node) => cell.isNode() && cell.id !== FORM_WINDOW_CELL_ID)
      .map((cell: Node) => cell.id) || [];
    if (selected.length) removeComponents(selected);
  }, [graphRef, removeComponents]);

  const updateComponentProps = useCallback((id: string, patch: Record<string, any>) => {
    if (id === FORM_WINDOW_CELL_ID) {
      updateFormWindow({ props: patch });
      return;
    }
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
  }, [graphRef, componentsRef, commitComponents, finalizeComponents, setNodeComponentData, syncSelectionOverlay, updateFormWindow]);

  const updateComponentField = useCallback((id: string, fieldName: string) => {
    if (id === FORM_WINDOW_CELL_ID) return;
    const name = String(fieldName || '').trim();
    if (!name) return;
    const nextComponents = finalizeComponents(componentsRef.current.map((c) => c.id === id
      ? { ...c, fieldBinding: name, props: { ...c.props, name } }
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
    if (id === FORM_WINDOW_CELL_ID) {
      updateFormWindow(patch);
      return;
    }
    const current = componentsRef.current.find((item) => item.id === id);
    if (!current) return;
    const size = clampSize(current.type, Number(patch.width ?? current.width), Number(patch.height ?? current.height));
    const next = clampComponentToContent({ ...current, ...patch, width: size.width, height: size.height });
    const graph = graphRef.current;
    const node = graph?.getCellById(id) as Node | null;
    if (node) {
      graph?.startBatch('geometry-edit');
      try {
        node.setSize(next.width, next.height);
        setNodeComponentData(node, next);
      } finally { graph?.stopBatch('geometry-edit'); }
    }
    commitComponents((items) => finalizeComponents(items.map((item) => item.id === id ? next : item)));
    syncSelectionOverlay(id);
  }, [clampSize, commitComponents, componentsRef, finalizeComponents, graphRef, setNodeComponentData, syncSelectionOverlay, updateFormWindow]);

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

    const bounded = id === FORM_WINDOW_CELL_ID
      ? { width: Math.max(320, width), height: Math.max(240, height) }
      : clampSize(start.type, width, height);
    if (width < bounded.width) {
      if (handle.includes('w')) x -= bounded.width - width;
      width = bounded.width;
    }
    if (height < bounded.height) {
      if (handle.includes('n')) y -= bounded.height - height;
      height = bounded.height;
    }

    const canvasNext = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };
    node.setPosition(canvasNext.x, canvasNext.y);
    node.setSize(canvasNext.width, canvasNext.height);
    if (id === FORM_WINDOW_CELL_ID) {
      updateFormWindow(canvasNext);
      return;
    }
    const data = node.getData();
    const localNext = clampComponentToContent(canvasToLocalRect(formWindowRef.current, canvasNext));
    const changed = { ...data.designComponent, ...localNext, zIndex: node.getZIndex() ?? data.designComponent.zIndex };
    const current = componentsRef.current.map((item) => item.id === id ? changed : item);
    const component = {
      ...changed,
      parentId: findContainerParent(changed, current),
    };
    setNodeComponentData(node, component, true);
    commitComponents((prev) => finalizeComponents(prev.map((item) => item.id === id ? component : item)));
    syncSelectionOverlay(id);
  }, [formWindowRef, graphRef, selectedIdRef, componentsRef, clampSize, commitComponents, setNodeComponentData, finalizeComponents, syncSelectionOverlay, updateFormWindow]);

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
      type: (data.componentType || (data.formWindow ? 'formWindow' : '')) as string,
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
    const maxZ = Math.max(0, ...graph.getCells().map((cell: { getZIndex: () => number | undefined }) => cell.getZIndex() ?? 0));
    graph.getSelectedCells().filter((cell: { id: string }) => cell.id !== FORM_WINDOW_CELL_ID).forEach((cell: { setZIndex: (z: number) => void }, index: number) => cell.setZIndex(maxZ + index + 1));
    syncComponentsFromGraph();
  }, [graphRef, syncComponentsFromGraph]);

  const sendToBack = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const minZ = Math.min(0, ...graph.getCells().map((cell: { getZIndex: () => number | undefined }) => cell.getZIndex() ?? 0));
    graph.getSelectedCells().filter((cell: { id: string }) => cell.id !== FORM_WINDOW_CELL_ID).forEach((cell: { setZIndex: (z: number) => void }, index: number) => cell.setZIndex(minZ - index - 1));
    syncComponentsFromGraph();
  }, [graphRef, syncComponentsFromGraph]);

  return {
    addComponent,
    removeComponent,
    deleteSelected,
    updateComponentProps,
    updateComponentField,
    updateComponentGeometry,
    resizeSelected,
    reparentComponent,
    startResize,
    bringToFront,
    sendToBack,
  };
}
