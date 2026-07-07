import type { DesignComponent } from '../project/types';

export const CONTAINER_TYPES = new Set(['card', 'tabs', 'form']);

export function findContainerAtPoint(x: number, y: number, components: DesignComponent[], excludeId?: string): string | undefined {
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

export function findContainerParent(component: DesignComponent, components: DesignComponent[]): string | undefined {
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

export function getDescendantIds(components: DesignComponent[], id: string): Set<string> {
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

export function normalizeContainerChildren(components: DesignComponent[]): DesignComponent[] {
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

export function isContainerComponent(component?: DesignComponent | null) {
  return !!component && CONTAINER_TYPES.has(component.type);
}

export function getContainerAutoInsets(component: DesignComponent) {
  if (component.type === 'form') return { top: 110, right: 28, bottom: 28, left: 28 };
  if (component.type === 'card') return { top: component.props.subtitle ? 56 : 40, right: 20, bottom: 20, left: 20 };
  if (component.type === 'tabs') return { top: 48, right: 16, bottom: 16, left: 16 };
  return { top: 24, right: 16, bottom: 16, left: 16 };
}

export function autoResizeContainers(components: DesignComponent[]) {
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
