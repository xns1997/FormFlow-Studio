import type { DesignComponent } from '../../project/types';
import { autoResizeContainers, CONTAINER_TYPES, normalizeContainerChildren } from '../../designer/utils';
import type { FormLayoutControlRegistry, FormLayoutResult, GridPlacement, LayoutDiagnostics } from './types';

const GRID_COLUMNS = 12;
const GRID_GAP_X = 20;
const GRID_GAP_Y = 18;
const ROOT_WIDTH = 1120;
const ROOT_X = 40;
const ROOT_Y = 40;

function cloneComponent(component: DesignComponent): DesignComponent {
  return {
    ...component,
    props: { ...component.props },
    children: component.children ? [...component.children] : component.children,
  };
}

function overlaps(a: DesignComponent, b: DesignComponent) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function countOverlaps(components: DesignComponent[]) {
  let count = 0;
  for (let i = 0; i < components.length; i += 1) {
    for (let j = i + 1; j < components.length; j += 1) {
      if ((components[i].parentId || '') !== (components[j].parentId || '')) continue;
      if (overlaps(components[i], components[j])) count += 1;
    }
  }
  return count;
}

function isContainer(component: DesignComponent) {
  return CONTAINER_TYPES.has(component.type);
}

function classifyColSpan(component: DesignComponent) {
  if (component.type === 'divider') return 12;
  if (component.type === 'button') return 4;
  if (['textarea', 'table', 'chart', 'upload', 'imageUpload', 'image', 'text'].includes(component.type)) return 12;
  return 6;
}

function classifyHeight(component: DesignComponent, registry: FormLayoutControlRegistry) {
  const control = registry.getControl(component.type);
  const defaultHeight = control?.defaultSize.h || component.height || 72;
  if (component.type === 'button') return Math.max(44, defaultHeight);
  if (component.type === 'divider') return 18;
  return Math.max(defaultHeight, component.height || 0);
}

function contentBox(parent: DesignComponent | null) {
  if (!parent) {
    return { x: ROOT_X, y: ROOT_Y, width: ROOT_WIDTH };
  }
  const topInset = parent.type === 'form' ? 110 : parent.type === 'card' ? (parent.props.subtitle ? 56 : 40) : parent.type === 'tabs' ? 48 : 24;
  const sideInset = parent.type === 'form' ? 28 : parent.type === 'card' ? 20 : 16;
  const bottomInset = parent.type === 'form' ? 28 : parent.type === 'card' ? 20 : 16;
  return {
    x: parent.x + sideInset,
    y: parent.y + topInset,
    width: Math.max(240, parent.width - sideInset * 2),
    bottomInset,
  };
}

function sortSiblings(components: DesignComponent[]) {
  return components.slice().sort((left, right) => {
    if (left.type === 'button' && right.type !== 'button') return 1;
    if (left.type !== 'button' && right.type === 'button') return -1;
    return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id);
  });
}

export function layoutForm(
  components: DesignComponent[],
  registry: FormLayoutControlRegistry,
): FormLayoutResult {
  const source = components.map(cloneComponent);
  const byId = new Map(source.map((component) => [component.id, component] as const));
  const childrenByParent = new Map<string | undefined, DesignComponent[]>();
  for (const component of source) {
    childrenByParent.set(component.parentId, [...(childrenByParent.get(component.parentId) || []), component]);
  }

  const placements: GridPlacement[] = [];
  const laidOut = new Map<string, DesignComponent>();

  const layoutChildren = (parentId: string | undefined, parent: DesignComponent | null) => {
    const siblings = sortSiblings(childrenByParent.get(parentId) || []);
    if (siblings.length === 0) return;
    const box = contentBox(parent);
    const columnWidth = Math.floor((box.width - (GRID_COLUMNS - 1) * GRID_GAP_X) / GRID_COLUMNS);
    let row = 0;
    let col = 0;
    let cursorY = box.y;
    let rowHeight = 0;

    const flushRow = () => {
      cursorY += rowHeight + GRID_GAP_Y;
      row += 1;
      col = 0;
      rowHeight = 0;
    };

    for (const component of siblings) {
      const colSpan = Math.min(GRID_COLUMNS, Math.max(1, classifyColSpan(component)));
      const height = classifyHeight(component, registry);
      if (component.type === 'button') {
        if (col !== 0) flushRow();
        const usedWidth = colSpan * columnWidth + (colSpan - 1) * GRID_GAP_X;
        const x = box.x + box.width - usedWidth;
        const y = cursorY;
        const next = { ...component, x, y, width: usedWidth, height, parentId };
        laidOut.set(component.id, next);
        placements.push({ id: component.id, row, colStart: GRID_COLUMNS - colSpan, colSpan, x, y, width: usedWidth, height, parentId });
        rowHeight = Math.max(rowHeight, height);
        flushRow();
        if (isContainer(next)) layoutChildren(next.id, next);
        continue;
      }

      if (col + colSpan > GRID_COLUMNS) flushRow();
      const x = box.x + col * (columnWidth + GRID_GAP_X);
      const width = colSpan * columnWidth + (colSpan - 1) * GRID_GAP_X;
      const y = cursorY;
      const next = { ...component, x, y, width, height, parentId };
      laidOut.set(component.id, next);
      placements.push({ id: component.id, row, colStart: col, colSpan, x, y, width, height, parentId });
      rowHeight = Math.max(rowHeight, height);
      col += colSpan;
      if (col >= GRID_COLUMNS) flushRow();
      if (isContainer(next)) layoutChildren(next.id, next);
    }
  };

  layoutChildren(undefined, null);

  const combined = source.map((component) => laidOut.get(component.id) || component);
  const normalized = normalizeContainerChildren(autoResizeContainers(combined));
  const diagnostics: LayoutDiagnostics = {
    overlapCountBefore: countOverlaps(source),
    overlapCountAfter: countOverlaps(normalized),
    edgeCrossingsBefore: 0,
    edgeCrossingsAfter: 0,
    warnings: [],
  };

  const rootForms = normalized.filter((component) => component.type === 'form' && !component.parentId);
  if (rootForms.length === 0 && normalized.length > 0) {
    diagnostics.warnings.push('当前设计没有根 form 容器，已按页面包围盒自动整理。');
  }

  return {
    components: normalized,
    placements,
    diagnostics,
  };
}
