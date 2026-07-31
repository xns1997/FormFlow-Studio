/**
 * Shared helpers for component inspector and data flow tracer.
 * Extracted to eliminate duplication.
 */
import type { DesignComponent } from '../../project/types';

/** Extract the canonical field name from a component. */
export function getField(component: DesignComponent): string {
  return String(component.fieldBinding || component.props?.name || '').trim();
}

/** Generic groupBy — works with any key extractor. */
export function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }
  return groups;
}
