import type { DesignComponent } from '../../project/types';
import { autoResizeContainers, CONTAINER_TYPES, normalizeContainerChildren } from '../../designer/utils';
import type {
  FormLayoutControlRegistry,
  FormLayoutOptions,
  FormLayoutResult,
  FormLayoutStrategy,
  GridPlacement,
  MeasuredNodeBox,
} from './types';

const COLUMN_GAP = 20;
const ROW_GAP = 24;
const ROOT_WIDTH = 1120;
const TWO_COLUMN_MIN_WIDTH = 680;
const SINGLE_COLUMN_MAX_WIDTH = 560;
const COMPATIBLE_HEIGHT_DELTA = 24;
const FULL_WIDTH_TYPES = new Set(['textarea', 'table', 'chart', 'upload', 'imageUpload', 'image', 'text']);
const STRATEGY_ORDER: FormLayoutStrategy[] = ['strict-two-column', 'single-column', 'traditional-two-column'];

type Box = { x: number; y: number; width: number; bottomInset?: number };
type Metrics = { width: number; height: number };
type Candidate = {
  strategy: FormLayoutStrategy;
  direct: DesignComponent[];
  descendants: DesignComponent[];
  placements: GridPlacement[];
  whitespaceRatio: number;
  formHeight: number;
  geometryChange: number;
  violationCount: number;
};

function cloneComponent(component: DesignComponent): DesignComponent {
  const cloned: DesignComponent = {
    ...component,
    props: { ...component.props },
  };
  if (component.children) cloned.children = [...component.children];
  return cloned;
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

function staticOptionCount(component: DesignComponent) {
  const source = component.props.optionSource as { mode?: string } | undefined;
  if (source?.mode && source.mode !== 'static') return 0;
  return Array.isArray(component.props.options) ? component.props.options.length : 0;
}

function estimatedContentHeight(component: DesignComponent, defaultHeight: number) {
  const optionCount = staticOptionCount(component);
  if (component.type === 'select' && !component.props.multiple && optionCount > 0 && optionCount <= 5) {
    return Math.max(defaultHeight, 60 + optionCount * 32);
  }
  if (['radio', 'checkbox'].includes(component.type) && component.props.direction !== 'horizontal' && optionCount > 0) {
    return Math.max(defaultHeight, 34 + optionCount * 32);
  }
  return defaultHeight;
}

function contentBox(parent: DesignComponent | null, rootWidth: number): Box {
  if (!parent) return { x: 0, y: 0, width: Math.max(240, rootWidth) };
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
  return components.slice().sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id));
}

function componentMetrics(
  component: DesignComponent,
  registry: FormLayoutControlRegistry,
  measuredMap: Map<string, MeasuredNodeBox>,
): Metrics {
  const control = registry.getControl(component.type);
  const defaultWidth = control?.defaultSize.w || component.width || 120;
  const defaultHeight = control?.defaultSize.h || component.height || 72;
  const measured = measuredMap.get(component.id);
  return {
    width: Math.max(1, Math.round(Math.max(defaultWidth, component.width || 0, measured?.width || 0))),
    height: Math.max(1, Math.round(Math.max(
      component.type === 'button' ? 44 : 1,
      component.height || 0,
      estimatedContentHeight(component, defaultHeight),
      measured?.height || 0,
    ))),
  };
}

function geometryChange(before: DesignComponent[], after: DesignComponent[], box: Box) {
  const beforeById = new Map(before.map((component) => [component.id, component] as const));
  const normalizer = Math.max(1, box.width);
  return after.reduce((sum, component) => {
    const previous = beforeById.get(component.id);
    if (!previous) return sum;
    return sum + (
      Math.abs(component.x - previous.x)
      + Math.abs(component.y - previous.y)
      + Math.abs(component.width - previous.width)
      + Math.abs(component.height - previous.height)
    ) / normalizer;
  }, 0);
}

function compareCandidates(left: Candidate, right: Candidate) {
  if (left.violationCount !== right.violationCount) return left.violationCount - right.violationCount;
  const epsilon = 0.0001;
  if (Math.abs(left.whitespaceRatio - right.whitespaceRatio) > epsilon) return left.whitespaceRatio - right.whitespaceRatio;
  if (left.formHeight !== right.formHeight) return left.formHeight - right.formHeight;
  if (Math.abs(left.geometryChange - right.geometryChange) > epsilon) return left.geometryChange - right.geometryChange;
  return STRATEGY_ORDER.indexOf(left.strategy) - STRATEGY_ORDER.indexOf(right.strategy);
}

/** 表单自动布局（网格/换行/容器）。 */
export function layoutForm(
  components: DesignComponent[],
  registry: FormLayoutControlRegistry,
  options: FormLayoutOptions = {},
): FormLayoutResult {
  const source = components.map(cloneComponent);
  const measuredMap = new Map((options.measuredControls || []).map((item) => [item.id, item] as const));
  const childrenByParent = new Map<string | undefined, DesignComponent[]>();
  for (const component of source) {
    childrenByParent.set(component.parentId, [...(childrenByParent.get(component.parentId) || []), component]);
  }

  const layoutGroup = (parentId: string | undefined, parent: DesignComponent | null): Candidate => {
    const siblings = sortSiblings(childrenByParent.get(parentId) || []);
    const box = contentBox(parent, options.contentWidth || ROOT_WIDTH);
    if (siblings.length === 0) {
      return { strategy: 'single-column', direct: [], descendants: [], placements: [], whitespaceRatio: 0, formHeight: 0, geometryChange: 0, violationCount: 0 };
    }

    const buildCandidate = (strategy: FormLayoutStrategy): Candidate => {
      const content = siblings.filter((component) => component.type !== 'button');
      const actions = siblings.filter((component) => component.type === 'button');
      const direct: DesignComponent[] = [];
      const descendants: DesignComponent[] = [];
      const placements: GridPlacement[] = [];
      const rows: Array<{ width: number; height: number; usedArea: number }> = [];
      const twoColumn = strategy !== 'single-column' && box.width >= TWO_COLUMN_MIN_WIDTH;
      const columnWidth = twoColumn ? Math.floor((box.width - COLUMN_GAP) / 2) : Math.min(SINGLE_COLUMN_MAX_WIDTH, box.width);
      const laneX = twoColumn ? box.x : box.x + Math.floor((box.width - columnWidth) / 2);
      let cursorY = box.y;
      let row = 0;

      const place = (component: DesignComponent, x: number, y: number, width: number, measured: Metrics, colStart: number) => {
        let next = { ...component, x, y, width: Math.round(width), height: measured.height, parentId };
        const placement: GridPlacement = { id: next.id, row, colStart, colSpan: width >= box.width ? 2 : 1, x: next.x, y: next.y, width: next.width, height: next.height, parentId };
        placements.push(placement);
        const nested = CONTAINER_TYPES.has(next.type) ? layoutGroup(next.id, next) : null;
        if (nested) {
          const childBottom = Math.max(next.y, ...nested.direct.map((child) => child.y + child.height));
          const inset = contentBox(next, next.width);
          next = { ...next, height: Math.max(next.height, childBottom - next.y + (inset.bottomInset || 0)) };
          placement.height = next.height;
          descendants.push(...nested.direct, ...nested.descendants);
          placements.push(...nested.placements);
        }
        direct.push(next);
        return next;
      };

      for (let index = 0; index < content.length;) {
        const component = content[index];
        const measured = componentMetrics(component, registry, measuredMap);
        const fullWidth = FULL_WIDTH_TYPES.has(component.type) || CONTAINER_TYPES.has(component.type);
        if (fullWidth || !twoColumn) {
          const width = fullWidth ? box.width : columnWidth;
          const placed = place(component, fullWidth ? box.x : laneX, cursorY, width, measured, 0);
          rows.push({ width: fullWidth ? box.width : columnWidth, height: placed.height, usedArea: placed.width * placed.height });
          cursorY += placed.height + ROW_GAP;
          row += 1;
          index += 1;
          continue;
        }

        const nextComponent = content[index + 1];
        const nextMetrics = nextComponent ? componentMetrics(nextComponent, registry, measuredMap) : null;
        const nextFullWidth = !!nextComponent && (FULL_WIDTH_TYPES.has(nextComponent.type) || CONTAINER_TYPES.has(nextComponent.type));
        const compatible = !!nextComponent && !nextFullWidth && (
          strategy === 'traditional-two-column'
          || Math.abs(measured.height - nextMetrics!.height) <= COMPATIBLE_HEIGHT_DELTA
        );

        const left = place(component, box.x, cursorY, columnWidth, measured, 0);
        if (compatible && nextComponent && nextMetrics) {
          const right = place(nextComponent, box.x + columnWidth + COLUMN_GAP, cursorY, columnWidth, nextMetrics, 1);
          const rowHeight = Math.max(left.height, right.height);
          rows.push({ width: columnWidth * 2, height: rowHeight, usedArea: left.width * left.height + right.width * right.height });
          cursorY += rowHeight + ROW_GAP;
          index += 2;
        } else {
          rows.push({ width: columnWidth * 2, height: left.height, usedArea: left.width * left.height });
          cursorY += left.height + ROW_GAP;
          index += 1;
        }
        row += 1;
      }

      if (actions.length > 0) {
        const actionMetrics = actions.map((component) => componentMetrics(component, registry, measuredMap));
        const actionBox = twoColumn ? box : { ...box, x: laneX, width: columnWidth };
        const totalWidth = actionMetrics.reduce((sum, metric) => sum + Math.min(metric.width, actionBox.width), 0) + COLUMN_GAP * Math.max(0, actions.length - 1);
        let actionX = actionBox.x + Math.max(0, actionBox.width - Math.min(actionBox.width, totalWidth));
        let actionRowHeight = 0;
        actions.forEach((component, index) => {
          const measured = actionMetrics[index];
          const width = Math.min(measured.width, actionBox.width);
          if (actionX + width > actionBox.x + actionBox.width && index > 0) {
            cursorY += actionRowHeight + ROW_GAP;
            row += 1;
            actionX = actionBox.x;
            actionRowHeight = 0;
          }
          const placed = place(component, actionX, cursorY, width, measured, index);
          actionX += width + COLUMN_GAP;
          actionRowHeight = Math.max(actionRowHeight, placed.height);
        });
        cursorY += actionRowHeight + ROW_GAP;
      }

      const formHeight = Math.max(0, cursorY - box.y - ROW_GAP);
      const rowArea = rows.reduce((sum, item) => sum + item.width * item.height, 0);
      const usedArea = rows.reduce((sum, item) => sum + item.usedArea, 0);
      const whitespaceRatio = rowArea > 0 ? Math.max(0, Math.min(1, (rowArea - usedArea) / rowArea)) : 0;
      const directById = new Map(direct.map((component) => [component.id, component] as const));
      const visualOrder = direct.slice().sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id)).map((component) => component.id);
      const expectedOrder = [...content, ...actions].map((component) => component.id);
      const orderViolations = visualOrder.reduce((count, id, index) => count + (id === expectedOrder[index] ? 0 : 1), 0);
      const clippingViolations = siblings.reduce((count, component) => {
        const placed = directById.get(component.id);
        const measured = componentMetrics(component, registry, measuredMap);
        if (!placed) return count + 1;
        return count + (placed.width < Math.min(measured.width, box.width) || placed.height < measured.height ? 1 : 0);
      }, 0);
      return {
        strategy,
        direct,
        descendants,
        placements,
        whitespaceRatio,
        formHeight,
        geometryChange: geometryChange(siblings, direct, box),
        violationCount: countOverlaps(direct) + orderViolations + clippingViolations,
      };
    };

    const strategies: FormLayoutStrategy[] = box.width >= TWO_COLUMN_MIN_WIDTH
      ? ['single-column', 'strict-two-column', 'traditional-two-column']
      : ['single-column'];
    const candidates = strategies.map(buildCandidate);
    const fewestViolations = Math.min(...candidates.map((candidate) => candidate.violationCount));
    const validCandidates = candidates.filter((candidate) => candidate.violationCount === fewestViolations);
    const shortestHeight = Math.min(...validCandidates.map((candidate) => candidate.formHeight));
    const heightBounded = validCandidates.filter((candidate) => candidate.formHeight <= shortestHeight * 1.8);
    return heightBounded.sort(compareCandidates)[0];
  };

  const root = layoutGroup(undefined, null);
  const byId = new Map([...root.direct, ...root.descendants].map((component) => [component.id, component] as const));
  const combined = source.map((component) => byId.get(component.id) || component);
  const normalized = normalizeContainerChildren(autoResizeContainers(combined));
  const diagnostics = {
    overlapCountBefore: countOverlaps(source),
    overlapCountAfter: countOverlaps(normalized),
    edgeCrossingsBefore: 0,
    edgeCrossingsAfter: 0,
    warnings: [] as string[],
    resizedCount: normalized.filter((component) => {
      const previous = source.find((item) => item.id === component.id);
      return !!previous && (previous.width !== component.width || previous.height !== component.height);
    }).length,
    movedCount: normalized.filter((component) => {
      const previous = source.find((item) => item.id === component.id);
      return !!previous && (previous.x !== component.x || previous.y !== component.y);
    }).length,
    strategy: root.strategy,
    whitespaceRatio: root.whitespaceRatio,
    formHeight: root.formHeight,
    geometryChange: root.geometryChange,
  };

  return { components: normalized, placements: root.placements, diagnostics };
}
