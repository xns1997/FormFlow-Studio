import type { DesignComponent, WorkflowEdge, WorkflowNode } from '../../project/types';
import type { ControlDef } from '../../designer/types';

export interface LayoutDiagnostics {
  overlapCountBefore: number;
  overlapCountAfter: number;
  edgeCrossingsBefore: number;
  edgeCrossingsAfter: number;
  warnings: string[];
  resizedCount?: number;
  movedCount?: number;
}

export interface MeasuredNodeBox {
  id: string;
  width: number;
  height: number;
}

export type FormLayoutStrategy = 'single-column' | 'strict-two-column' | 'traditional-two-column';

export interface FormLayoutDiagnostics extends LayoutDiagnostics {
  strategy: FormLayoutStrategy;
  whitespaceRatio: number;
  formHeight: number;
  geometryChange: number;
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
  diagnostics: FormLayoutDiagnostics;
}

export interface FormLayoutControlRegistry {
  getControl: (type: string) => ControlDef | undefined;
}

export interface FormLayoutOptions {
  contentWidth?: number;
  measuredControls?: MeasuredNodeBox[];
}

export interface WorkflowLayoutOptions {
  columnGap?: number;
  rowGap?: number;
  marginX?: number;
  marginY?: number;
}
