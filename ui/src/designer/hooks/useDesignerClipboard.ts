import { useCallback } from 'react';
import type { Node } from '@antv/x6';
import type { DesignComponent } from '../../project/types';
import type { DesignerState } from './useDesignerState';
import { findContainerParent } from '../utils';
import { FORM_WINDOW_CELL_ID } from '../formWindowModel';
import { canvasToLocalRect, clampComponentToContent } from '../../../../shared/form-window-layout';

interface DesignerClipboardCtx extends DesignerState {
  finalizeComponents: (items: DesignComponent[]) => DesignComponent[];
}

export function useDesignerClipboard(ctx: DesignerClipboardCtx) {
  const {
    graphRef,
    formWindowRef,
    clampSize,
    commitComponents,
    setNodeComponentData,
    finalizeComponents,
    bumpHistoryRevision,
  } = ctx;

  const copy = useCallback(() => {
    const graph = graphRef.current;
    if (graph) {
      const cells = graph.getSelectedCells().filter((cell: { id: string }) => cell.id !== FORM_WINDOW_CELL_ID);
      if (cells.length) {
        graph.copy(cells);
        bumpHistoryRevision();
      }
    }
  }, [graphRef, bumpHistoryRevision]);

  const paste = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const pasted = graph.paste({ offset: 24 });
    const nextComponents: DesignComponent[] = [];
    pasted.forEach((cell: { isNode: () => boolean }) => {
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
      commitComponents((prev) => {
        const combined = [...prev, ...nextComponents];
        return finalizeComponents(combined.map((component) => ({
          ...component,
          parentId: findContainerParent(component, combined),
        })));
      });
      graph.resetSelection(nextComponents.map((component) => component.id));
      bumpHistoryRevision();
    }
  }, [graphRef, formWindowRef, clampSize, commitComponents, setNodeComponentData, finalizeComponents, bumpHistoryRevision]);

  const duplicate = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const cells = graph.getSelectedCells().filter((cell: { id: string }) => cell.id !== FORM_WINDOW_CELL_ID);
    if (!cells.length) return;
    graph.copy(cells);
    const pasted = graph.paste({ offset: 24 });
    const nextComponents: DesignComponent[] = [];
    pasted.forEach((cell: { isNode: () => boolean }) => {
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
      commitComponents((prev) => {
        const combined = [...prev, ...nextComponents];
        return finalizeComponents(combined.map((component) => ({
          ...component,
          parentId: findContainerParent(component, combined),
        })));
      });
      graph.resetSelection(nextComponents.map((component) => component.id));
      bumpHistoryRevision();
    }
  }, [graphRef, formWindowRef, clampSize, commitComponents, setNodeComponentData, finalizeComponents, bumpHistoryRevision]);

  return { copy, paste, duplicate };
}
