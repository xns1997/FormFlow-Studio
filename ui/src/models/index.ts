// 核心对象模型 - FormFlow Studio

// ── 数据模型 ──────────────────────────────────────────

export interface WorkbookModel {
  id: string;
  name: string;
  sheets: SheetModel[];
  sourceType: 'excel' | 'csv' | 'api' | 'database';
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface SheetModel {
  id: string;
  name: string;
  columns: ColumnSchema[];
  rows: RowData[];
  headerRowIndex: number;
  dataStartRowIndex: number;
  inferredSchema: boolean;
}

export interface ColumnSchema {
  id: string;
  sheetId: string;
  name: string;
  originalName: string;
  index: number;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'unknown';
  nullable: boolean;
  sampleValues: unknown[];
  uniqueCount: number;
  emptyCount: number;
  validationRules: ValidationRule[];
  enumOptions?: string[];
  defaultValue?: unknown;
  required?: boolean;
}

export interface RowData {
  id: string;
  values: Record<string, unknown>;
  rowIndex: number;
}

export interface ValidationRule {
  type: 'required' | 'email' | 'phone' | 'number' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  param?: string;
  message: string;
}

// ── 表单模型 ──────────────────────────────────────────

export interface FormProject {
  id: string;
  name: string;
  description: string;
  dataSources: DataSourceConfig[];
  pages: FormPage[];
  components: ComponentNode[];
  bindings: BindingEdge[];
  behaviorGraphs: BehaviorGraph[];
  scripts: ScriptModule[];
  testCases: TestCase[];
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

export interface FormPage {
  id: string;
  name: string;
  components: string[];
  layout: LayoutConfig;
}

export interface LayoutConfig {
  type: 'form' | 'grid' | 'card' | 'free';
  columns: number;
  gutter: number;
  maxWidth: number;
}

// ── 组件模型 ──────────────────────────────────────────

export type ComponentType =
  | 'input' | 'textarea' | 'select' | 'radio' | 'checkbox'
  | 'datePicker' | 'timePicker' | 'dateRange' | 'numberInput' | 'switch' | 'rating'
  | 'segmented' | 'tagInput'
  | 'upload' | 'imageUpload' | 'image' | 'animatedNumber' | 'table' | 'container'
  | 'tabs' | 'steps' | 'button' | 'text' | 'custom';

export interface ComponentNode {
  id: string;
  type: ComponentType;
  name: string;
  label: string;
  fieldBinding?: string;
  props: Record<string, unknown>;
  layout: LayoutPosition;
  ports: ComponentPort[];
  events: ComponentEvent[];
}

export interface LayoutPosition {
  row: number;
  col: number;
  colSpan: number;
  rowSpan: number;
}

export interface ComponentPort {
  name: string;
  direction: 'input' | 'output';
  type: string;
}

export interface ComponentEvent {
  name: string;
  handler: string;
}

// ── 绑定模型 ──────────────────────────────────────────

export interface BindingEdge {
  id: string;
  from: BindingEndpoint;
  to: BindingEndpoint;
  direction: 'uiToData' | 'dataToUi' | 'twoWay';
  transform: BindingTransform;
  validation: BindingValidation;
}

export interface BindingEndpoint {
  componentId: string;
  port: string;
  sheetId?: string;
  columnId?: string;
  field?: string;
}

export interface BindingTransform {
  formatter?: string;
  parser?: string;
  defaultValue?: unknown;
}

export interface BindingValidation {
  rules: ValidationRule[];
  validateOn: 'change' | 'blur' | 'submit';
}

// ── 行为模型 ──────────────────────────────────────────

export interface BehaviorGraph {
  id: string;
  name: string;
  nodes: BehaviorNode[];
  edges: BehaviorEdge[];
}

export interface BehaviorNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface BehaviorEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface ScriptModule {
  id: string;
  name: string;
  code: string;
  event: string;
  scope: 'global' | 'page' | 'component' | 'field' | 'submit' | 'validate';
}

// ── 运行时模型 ────────────────────────────────────────

export interface RuntimeState {
  currentSheet: string;
  currentRow: number;
  formValues: Record<string, unknown>;
  originalValues: Record<string, unknown>;
  dirtyFields: Set<string>;
  validationErrors: Record<string, string>;
  componentStates: Record<string, ComponentState>;
  behaviorLogs: BehaviorLog[];
  submitResult: SubmitResult | null;
}

export interface ComponentState {
  visible: boolean;
  disabled: boolean;
  readonly: boolean;
  loading: boolean;
}

export interface BehaviorLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
  data?: unknown;
}

export interface SubmitResult {
  success: boolean;
  changes: Record<string, { oldValue: unknown; newValue: unknown }>;
  changeLog: ChangeLogEntry[];
  exportData?: unknown;
}

export interface ChangeLogEntry {
  sheet: string;
  rowIndex: number;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}

// ── 测试模型 ──────────────────────────────────────────

export interface TestCase {
  id: string;
  name: string;
  description: string;
  dataRow: number;
  expectedChanges: Record<string, unknown>;
  actualChanges?: Record<string, unknown>;
  passed?: boolean;
}

// ── 设置模型 ──────────────────────────────────────────

export interface ProjectSettings {
  data: DataSettings;
  form: FormSettings;
  behavior: BehaviorSettings;
  permission: PermissionSettings;
  publish: PublishSettings;
}

export interface DataSettings {
  defaultDataSource: string;
  defaultSheet: string;
  headerRow: number;
  dataStartRow: number;
  primaryKey: string;
  allowAddRows: boolean;
  allowDeleteRows: boolean;
  allowModifyOriginal: boolean;
}

export interface FormSettings {
  name: string;
  description: string;
  defaultPage: string;
  theme: string;
  layoutMode: string;
  responsiveBreakpoints: Record<string, number>;
  showSubmitButton: boolean;
  showResetButton: boolean;
}

export interface BehaviorSettings {
  enableJsScripts: boolean;
  enableNodeBehavior: boolean;
  scriptTimeout: number;
  behaviorOrder: 'node-first' | 'script-first' | 'last-writer' | 'error-on-conflict';
  errorStrategy: 'show-error' | 'ignore' | 'stop';
  loopProtection: number;
}

export interface PermissionSettings {
  mode: 'readonly' | 'edit' | 'admin';
  fieldLevelPermissions: Record<string, string[]>;
  componentLevelPermissions: Record<string, string[]>;
}

export interface PublishSettings {
  format: 'json' | 'html' | 'runtime';
  allowWriteBack: boolean;
  generateChangeLog: boolean;
  outputFileName: string;
}

// ── 数据源配置 ────────────────────────────────────────

export interface DataSourceConfig {
  id: string;
  type: 'excel' | 'csv' | 'json' | 'api' | 'database';
  name: string;
  config: Record<string, unknown>;
}

// ── Range 引用 ────────────────────────────────────────

export interface RangeRef {
  tableId: string;
  sheetName: string;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  firstRowIsHeader?: boolean;
  /** 精确的多区域选择；未提供时使用顶层起止坐标。 */
  areas?: Array<{ startRow: number; startCol: number; endRow: number; endCol: number }>;
  /** 交集模式中参与运算的原始选区，用于重新打开选择器继续编辑。 */
  sourceAreas?: Array<{ startRow: number; startCol: number; endRow: number; endCol: number }>;
  operation?: 'selection' | 'intersection';
}

export interface RangeValue {
  address: string;
  rows: number;
  cols: number;
  headers: string[];
  data: unknown[][];
  singleValue?: unknown;
  areas?: Array<{ address: string; rows: number; cols: number; data: unknown[][] }>;
  areaCount?: number;
  cellCount?: number;
}
