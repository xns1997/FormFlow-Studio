// 项目文件结构 - 类似 Xcode Project 管理

// ── 项目根目录结构 ──────────────────────────────────────
//
// my-project/
// ├── project.json          # 项目配置文件
// ├── srcTable/             # 上传的数据表缓存
// │   ├── employees.json    # 员工表信息
// │   └── salary.json       # 工资表信息
// ├── workflows/            # 流程文件（编排画布）
// │   ├── flow-1.json       # 单个流程配置
// │   └── flow-2.json
// ├── behaviors/            # 行为文件
// │   ├── init.js           # 行为脚本
// │   └── validate.js
// ├── output/               # 输出目录
// │   ├── export.json
// │   └── export.xlsx
// └── settings.json         # 项目设置

export interface ProjectStructure {
  config: ProjectConfig;
  srcTable: SrcTableEntry[];
  workflows: WorkflowFile[];
  behaviors: BehaviorFile[];
  outputs: OutputFile[];
  designs: DesignFile[];
}

export interface ProjectConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  tags: string[];
}

// ── 数据表缓存 ──────────────────────────────────────

export interface SrcTableEntry {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: 'xlsx' | 'xls' | 'csv' | 'json' | 'sqlite';
  uploadedAt: string;
  sheets: SrcSheetInfo[];
  dataHash: string;
  // 独立记录
  columnRecords?: ColumnRecord[];
  rowRecords?: RowRecord[];
}

export interface SrcSheetInfo {
  name: string;
  rowCount: number;
  colCount: number;
  headers: string[];
  columns: SrcColumnInfo[];
  preview: Record<string, unknown>[];
  config?: TableConfig;
}

export interface SrcColumnInfo {
  name: string;
  index: number;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'unknown';
  nullable: boolean;
  uniqueCount: number;
  sampleValues: unknown[];
  // 数据表配置
  width?: number;
  visible?: boolean;
  frozen?: boolean;
  locked?: boolean;
  format?: string;
  description?: string;
  tags?: string[];
  hidden?: boolean;
}

// ── 独立列记录 ──────────────────────────────────────

export interface ColumnRecord {
  id: string;
  tableId: string;
  columnName: string;
  columnIndex: number;
  // 显示配置
  width: number;
  minWidth: number;
  maxWidth: number;
  visible: boolean;
  frozen: boolean;
  locked: boolean;
  hidden: boolean;
  // 格式
  format: string;
  numberFormat: string;
  dateFormat: string;
  textAlign: 'left' | 'center' | 'right';
  fontWeight: 'normal' | 'bold';
  backgroundColor: string;
  textColor: string;
  // 元数据
  description: string;
  tags: string[];
  category: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
  // 数据质量
  completeness: number; // 0-100
  uniqueness: number; // 0-100
  nullCount: number;
  uniqueCount: number;
  // 数据科学
  skewness: number;
  kurtosis: number;
  outlierCount: number;
  distributionType: 'normal' | 'skewed' | 'uniform' | 'bimodal' | 'unknown';
  // 操作记录
  lastModified: string;
  modifiedBy: string;
}

// ── 独立行记录 ──────────────────────────────────────

export interface RowRecord {
  id: string;
  tableId: string;
  rowIndex: number;
  // 显示配置
  highlighted: boolean;
  highlightColor: string;
  locked: boolean;
  hidden: boolean;
  collapsed: boolean;
  rowHeight: number;
  // 元数据
  note: string;
  tags: string[];
  category: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: 'pending' | 'reviewed' | 'approved' | 'rejected';
  // 操作记录
  lastModified: string;
  modifiedBy: string;
  // 数据质量
  hasErrors: boolean;
  errorCount: number;
  warningCount: number;
}

// ── 数据表配置 ──────────────────────────────────────

export interface TableConfig {
  id: string;
  tableName: string;
  columnWidths: Record<string, number>;
  frozenColumns: number;
  frozenRows: number;
  defaultSort: { column: string; ascending: boolean } | null;
  hiddenColumns: string[];
  lockedColumns: string[];
  columnDescriptions: Record<string, string>;
  columnTags: Record<string, string[]>;
  headerHeight: number;
  rowHeight: number;
  alternateRowColor: boolean;
  showGridLines: boolean;
  autoFitColumns: boolean;
  filterEnabled: boolean;
  sortEnabled: boolean;
  groupByColumn: number | null;
}

export function createDefaultTableConfig(id: string, tableName: string): TableConfig {
  return {
    id,
    tableName,
    columnWidths: {},
    frozenColumns: 0,
    frozenRows: 0,
    defaultSort: null,
    hiddenColumns: [],
    lockedColumns: [],
    columnDescriptions: {},
    columnTags: {},
    headerHeight: 36,
    rowHeight: 28,
    alternateRowColor: true,
    showGridLines: true,
    autoFitColumns: true,
    filterEnabled: true,
    sortEnabled: true,
    groupByColumn: null,
  };
}

export function createColumnRecord(tableId: string, name: string, index: number): ColumnRecord {
  return {
    id: `col_${tableId}_${index}`,
    tableId,
    columnName: name,
    columnIndex: index,
    width: 120,
    minWidth: 60,
    maxWidth: 400,
    visible: true,
    frozen: false,
    locked: false,
    hidden: false,
    format: '',
    numberFormat: '',
    dateFormat: '',
    textAlign: 'left',
    fontWeight: 'normal',
    backgroundColor: '',
    textColor: '',
    description: '',
    tags: [],
    category: '',
    isPrimaryKey: false,
    isNullable: false,
    completeness: 100,
    uniqueness: 0,
    nullCount: 0,
    uniqueCount: 0,
    skewness: 0,
    kurtosis: 0,
    outlierCount: 0,
    distributionType: 'unknown',
    lastModified: new Date().toISOString(),
    modifiedBy: 'system',
  };
}

export function createRowRecord(tableId: string, rowIndex: number): RowRecord {
  return {
    id: `row_${tableId}_${rowIndex}`,
    tableId,
    rowIndex,
    highlighted: false,
    highlightColor: '',
    locked: false,
    hidden: false,
    collapsed: false,
    rowHeight: 28,
    note: '',
    tags: [],
    category: '',
    priority: 'normal',
    status: 'pending',
    lastModified: new Date().toISOString(),
    modifiedBy: 'system',
    hasErrors: false,
    errorCount: 0,
    warningCount: 0,
  };
}

// ── 数据科学报告 ──────────────────────────────────────

export interface DataScienceReport {
  overview: {
    rows: number;
    columns: number;
    memoryUsage: string;
    missingTotal: number;
    missingPercent: string;
    duplicateRows: number;
    duplicatePercent: string;
  };
  columns: ColumnAnalysis[];
  correlations: CorrelationMatrix;
  distributions: DistributionInfo[];
  qualityScore: number;
}

export interface ColumnAnalysis {
  name: string;
  dtype: string;
  type: 'number' | 'string' | 'category' | 'date' | 'boolean' | 'datetime';
  nonNull: number;
  nullCount: number;
  nullPercent: string;
  uniqueCount: number;
  stats?: {
    mean: number;
    std: number;
    min: number;
    q25: number;
    median: number;
    q75: number;
    max: number;
    skewness: number;
    kurtosis: number;
  };
  topValues?: Record<string, number>;
  sampleValues: string[];
  cardinality: 'low' | 'medium' | 'high';
  hasOutliers?: boolean;
  outlierCount?: number;
}

export interface CorrelationMatrix {
  numericColumns: string[];
  matrix: number[][];
}

export interface DistributionInfo {
  columnName: string;
  bins: { range: string; count: number; percent: number }[];
  histogram: number[];
}

// ── 流程文件 ──────────────────────────────────────

export interface WorkflowFile {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  specId: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

// ── 行为文件 ──────────────────────────────────────

export interface BehaviorFile {
  id: string;
  name: string;
  event: string;
  code: string;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── 输出文件 ──────────────────────────────────────

export interface OutputFile {
  id: string;
  name: string;
  format: 'json' | 'xlsx' | 'csv' | 'html';
  size: number;
  createdAt: string;
  downloadUrl?: string;
}

// ── 数据表信息缓存 ──────────────────────────────────────

export interface TableInfoCache {
  tables: Map<string, SrcTableEntry>;
  lastUpdated: string;
}

// ── 表单设计器 ──────────────────────────────────────

export interface DesignFile {
  id: string;
  name: string;
  viewport: { zoom: number; panX: number; panY: number };
  gridSize: number;
  components: DesignComponent[];
  bindings: DesignBinding[];
  createdAt: string;
  updatedAt: string;
}

export interface DesignComponent {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, any>;
  parentId?: string;
  fieldBinding?: string;
  behaviorBindings?: string[];
  children?: string[];
  locked?: boolean;
  visible?: boolean;
  zIndex?: number;
}

export interface DesignBinding {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'field' | 'behavior';
  config: Record<string, any>;
}

export function createDesignFile(name: string): DesignFile {
  return {
    id: `design_${Date.now()}`,
    name,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    gridSize: 10,
    components: [],
    bindings: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
