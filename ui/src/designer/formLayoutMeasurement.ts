import type { DesignComponent } from '../project/types';
import type { MeasuredNodeBox } from '../services/layout';

/** 测量已渲染控件的实际盒模型尺寸。 */
export function measureRenderedControls(root: ParentNode | null, components: DesignComponent[]): MeasuredNodeBox[] {
  if (!root) return [];
  const renderedCells = new Map(
    Array.from(root.querySelectorAll<HTMLElement>('[data-cell-id]'))
      .map((element) => [element.dataset.cellId || '', element] as const)
      .filter(([id]) => !!id),
  );
  return components.flatMap((component) => {
    const cell = renderedCells.get(component.id);
    const node = cell?.querySelector<HTMLElement>('.ios-design-node');
    const content = node?.firstElementChild as HTMLElement | null;
    // scroll dimensions are layout-space values, so graph zoom transforms don't
    // inflate or shrink the measurement.
    const width = Math.ceil(Math.max(node?.scrollWidth || 0, content?.scrollWidth || 0));
    const height = Math.ceil(Math.max(node?.scrollHeight || 0, content?.scrollHeight || 0));
    return width > 0 && height > 0 ? [{ id: component.id, width, height }] : [];
  });
}
