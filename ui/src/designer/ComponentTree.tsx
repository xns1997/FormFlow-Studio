import React from 'react';
import type { DesignComponent } from '../project/types';
import { getControl } from './registry';
import { DesignerIcon } from './icons';

interface Props {
  components: DesignComponent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReparent: (id: string, parentId?: string) => void;
}

const CONTAINER_TYPES = new Set(['card', 'tabs', 'form']);

function isDescendant(components: DesignComponent[], id: string, maybeDescendantId: string) {
  let current = components.find((component) => component.id === maybeDescendantId);
  while (current?.parentId) {
    if (current.parentId === id) return true;
    current = components.find((component) => component.id === current?.parentId);
  }
  return false;
}

export function ComponentTree({ components, selectedId, onSelect, onRemove, onReparent }: Props) {
  const rootComponents = components.filter(c => !c.parentId);
  const childrenMap = new Map<string, DesignComponent[]>();
  for (const c of components) {
    if (c.parentId) {
      if (!childrenMap.has(c.parentId)) childrenMap.set(c.parentId, []);
      childrenMap.get(c.parentId)!.push(c);
    }
  }

  const renderNode = (comp: DesignComponent, depth: number) => {
    const control = getControl(comp.type);
    const childComps = childrenMap.get(comp.id) || [];
    const hasChildren = childComps.length > 0;
    const canHaveChildren = CONTAINER_TYPES.has(comp.type);
    const name = comp.props.name || comp.props.label || control?.label || comp.type;

    return (
      <React.Fragment key={comp.id}>
        <div
          className={`tree-node ${selectedId === comp.id ? 'selected' : ''} ${canHaveChildren ? 'can-drop' : ''}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-design-component-id', comp.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            if (!canHaveChildren) return;
            const draggingId = e.dataTransfer.getData('application/x-design-component-id');
            if (draggingId && (draggingId === comp.id || isDescendant(components, draggingId, comp.id))) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => {
            if (!canHaveChildren) return;
            const draggingId = e.dataTransfer.getData('application/x-design-component-id');
            if (!draggingId || draggingId === comp.id || isDescendant(components, draggingId, comp.id)) return;
            e.preventDefault();
            e.stopPropagation();
            onReparent(draggingId, comp.id);
          }}
          onClick={() => onSelect(comp.id)}
        >
          {hasChildren && <DesignerIcon name="collapse" size={12} className="tree-toggle" />}
          <DesignerIcon name={comp.type} fallback={control?.icon || '•'} className="tree-icon" />
          <span className="tree-label">{name}</span>
          <span className="tree-type">{comp.type}</span>
          <button type="button"
            className="tree-delete"
            onClick={(e) => { e.stopPropagation(); onRemove(comp.id); }}
            title="删除"
          >×</button>
        </div>
        {hasChildren && childComps.map(child => renderNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div
      className="component-tree"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-design-component-id')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(e) => {
        const draggingId = e.dataTransfer.getData('application/x-design-component-id');
        if (!draggingId) return;
        e.preventDefault();
        onReparent(draggingId, undefined);
      }}
    >
      {rootComponents.length === 0 ? (
        <div className="tree-empty">拖入控件到画布</div>
      ) : (
        rootComponents.map(comp => renderNode(comp, 0))
      )}
    </div>
  );
}
