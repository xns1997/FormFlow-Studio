/**
 * Layout planning for form scaffold generation.
 *
 * Calculates column counts, row positions, and component dimensions.
 */
import type { InferredFormField } from '../fieldInference';

/** 单行字段控件高度。 */
export const SINGLE_LINE_FIELD_HEIGHT = 76;

/** 按字段数自动选择列数（1 → 1 列，≤4 → 2 列，其余 3 列）。 */
export function autoColumns(fieldCount: number): 1 | 2 | 3 {
  if (fieldCount <= 1) return 1;
  if (fieldCount <= 4) return 2;
  return 3;
}

/** 布局计划：列数、行数、分区、分页与操作区 Y 坐标。 */
export interface LayoutPlan {
  columns: 1 | 2 | 3;
  fieldRows: number;
  sections: Array<{ index: number; y: number }>;
  needsTabs: boolean;
  pageCount: number;
  actionY: number;
}

/** 规划表单布局：计算列数、分区、分页与操作区位置。 */
export function planLayout(
  fields: InferredFormField[],
  options: {
    columns?: 1 | 2 | 3;
    layoutCountMode?: 'business-fields' | 'visible-fields';
  } = {},
): LayoutPlan {
  const visibleFieldCount = fields.length;
  const businessFieldCount = fields.filter((field) => !field.isKey).length || visibleFieldCount;
  const layoutFieldCount = options.layoutCountMode === 'visible-fields' ? visibleFieldCount : businessFieldCount;
  const columns = options.columns || autoColumns(layoutFieldCount);
  const fieldRows = Math.ceil(fields.length / columns);
  const needsTabs = layoutFieldCount > 24;
  const pageCount = needsTabs ? Math.ceil(layoutFieldCount / 12) : 1;
  const sectionCount = layoutFieldCount > 12 ? Math.ceil(layoutFieldCount / 8) : 0;
  const sections = Array.from({ length: sectionCount }, (_, index) => ({
    index,
    y: 104 + Math.floor((index * 8) / columns) * 92,
  }));
  const actionY = 144 + fieldRows * 92;

  return { columns, fieldRows, sections, needsTabs, pageCount, actionY };
}

/** 计算第 index 个字段的网格位置（列/行/坐标/宽度）。 */
export function fieldPosition(
  index: number,
  columns: number,
  startY: number = 132,
): { col: number; row: number; x: number; y: number; width: number } {
  const col = index % columns;
  const row = Math.floor(index / columns);
  const width = columns === 1 ? 620 : columns === 2 ? 300 : 236;
  const x = 72 + col * (width + 24);
  const y = startY + row * 92;
  return { col, row, x, y, width };
}
