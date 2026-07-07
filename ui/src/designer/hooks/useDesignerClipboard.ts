import { useCallback } from 'react';
import type { Node } from '@antv/x6';
import type { DesignComponent } from '../../project/types';
import type { DesignerState } from './useDesignerState';
import { findContainerParent } from '../utils';

interface DesignerClipboardCtx extends DesignerState {
  finalizeComponents: (items: DesignComponent[]) => DesignComponent[];
  selectComponent: (id: string | null) => void;
}

export function useDesignerClipboard(ctx: DesignerClipboardCtx) {
  const {
    graphRef,
    clampSize,
    commitComponents,
    setNodeComponentData,
    finalizeComponents,
    selectComponent,
  } = ctx;

  const copy = useCallback(() => {
    const graph = graphRef.current;
    if (graph) graph.copy(graph.getSelectedCells());
  }, [graphRef]);

  const paste = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const pasted = graph.paste({ offset: 24 });
    const nextComponents: DesignComponent[] = [];
    pasted.forEach((cell: any) => {
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
  }, [graphRef, clampSize, commitComponents, setNodeComponentData, finalizeComponents, selectComponent]);

  const duplicate = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.copy(graph.getSelectedCells());
    const pasted = graph.paste({ offset: 24 });
    const nextComponents: DesignComponent[] = [];
    pasted.forEach((cell: any) => {
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
  }, [graphRef, clampSize, commitComponents, setNodeComponentData, finalizeComponents, selectComponent]);

  return { copy, paste, duplicate };
}
