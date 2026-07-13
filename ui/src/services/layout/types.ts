import type { DesignComponent, WorkflowEdge, WorkflowNode } from '../../project/types';
import type { ControlDef } from '../../designer/types';

export interface LayoutDiagnostics {
  overlapCountBefore: number;
  overlapCountAfter: number;
  edgeCrossingsBefore: number;
  edgeCrossingsAfter: number;
  warnings: string[];
}

export interface MeasuredNodeBox {
  id: string;
  width: number;
  height: number;
}

export interface WorkflowLayoutResult {
  nodes: WorkflowNode[];
  diagnostics: LayoutDiagnostics;
  edgeType: 'smoothstep';
}

export interface GridPlacement {
  id: string;
  row: number;
  colStart: number;
  colSpan: number;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
}

export interface FormLayoutResult {
  components: DesignComponent[];
  placements: GridPlacement[];
  diagnostics: LayoutDiagnostics;
}

export interface FormLayoutControlRegistry {
  getControl: (type: string) => ControlDef | undefined;
}

export interface WorkflowLayoutOptions {
  columnGap?: number;
  rowGap?: number;
  marginX?: number;
  marginY?: number;
}
