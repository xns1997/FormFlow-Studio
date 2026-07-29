/**
 * 预设流程数据，用于文档中的嵌入式流程预览
 */

export interface PreviewNode {
  id: string;
  label: string;
  kind: 'scenario' | 'generic' | 'behavior' | 'xlsx-method' | 'ml';
  x: number;
  y: number;
}

export interface PreviewEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowPreview {
  id: string;
  title: string;
  nodes: PreviewNode[];
  edges: PreviewEdge[];
}

export const flowPreviews: Record<string, FlowPreview> = {
  'scenario-read-excel': {
    id: 'scenario-read-excel',
    title: '读取 Excel 并生成字段模型',
    nodes: [
      { id: 'n1', label: '文件来源', kind: 'generic', x: 50, y: 80 },
      { id: 'n2', label: '读取Excel\n生成字段模型', kind: 'scenario', x: 280, y: 80 },
      { id: 'n3', label: '数据筛选', kind: 'generic', x: 510, y: 40 },
      { id: 'n4', label: '输出/显示', kind: 'generic', x: 510, y: 120 },
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n2', to: 'n4' },
    ],
  },

  'data-processing-pipeline': {
    id: 'data-processing-pipeline',
    title: '数据处理流水线',
    nodes: [
      { id: 'n1', label: '值输入', kind: 'generic', x: 50, y: 80 },
      { id: 'n2', label: '数据筛选', kind: 'generic', x: 250, y: 80 },
      { id: 'n3', label: '数据排序', kind: 'generic', x: 450, y: 80 },
      { id: 'n4', label: '记录变换', kind: 'generic', x: 650, y: 80 },
      { id: 'n5', label: '导出', kind: 'generic', x: 850, y: 80 },
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n3', to: 'n4' },
      { from: 'n4', to: 'n5' },
    ],
  },

  'excel-edit-workflow': {
    id: 'excel-edit-workflow',
    title: 'Excel 编辑工作流',
    nodes: [
      { id: 'n1', label: '文件来源', kind: 'generic', x: 50, y: 80 },
      { id: 'n2', label: '表与区域来源', kind: 'generic', x: 250, y: 80 },
      { id: 'n3', label: '插入行', kind: 'generic', x: 450, y: 40 },
      { id: 'n4', label: '写回工作簿', kind: 'generic', x: 650, y: 80 },
      { id: 'n5', label: '保存文件', kind: 'generic', x: 850, y: 80 },
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n3', to: 'n4' },
      { from: 'n4', to: 'n5' },
    ],
  },

  'behavior-workflow': {
    id: 'behavior-workflow',
    title: '流程行为工作流',
    nodes: [
      { id: 'n1', label: '流程导入', kind: 'generic', x: 50, y: 80 },
      { id: 'n2', label: '条件分支', kind: 'behavior', x: 280, y: 80 },
      { id: 'n3', label: '脚本执行', kind: 'behavior', x: 510, y: 40 },
      { id: 'n4', label: '回填表单', kind: 'behavior', x: 510, y: 120 },
      { id: 'n5', label: '流程导出', kind: 'generic', x: 740, y: 80 },
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3', label: 'true' },
      { from: 'n2', to: 'n4', label: 'false' },
      { from: 'n3', to: 'n5' },
      { from: 'n4', to: 'n5' },
    ],
  },

  'output-workflow': {
    id: 'output-workflow',
    title: '数据导出工作流',
    nodes: [
      { id: 'n1', label: '数据处理', kind: 'generic', x: 50, y: 80 },
      { id: 'n2', label: '数据导出', kind: 'generic', x: 280, y: 80 },
      { id: 'n3', label: '保存文件', kind: 'generic', x: 510, y: 80 },
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
    ],
  },

  'ml-workflow': {
    id: 'ml-workflow',
    title: '机器学习工作流',
    nodes: [
      { id: 'n1', label: '数据源', kind: 'generic', x: 50, y: 80 },
      { id: 'n2', label: 'PCA降维', kind: 'ml', x: 250, y: 80 },
      { id: 'n3', label: 'K-Means聚类', kind: 'ml', x: 450, y: 80 },
      { id: 'n4', label: '导出', kind: 'generic', x: 650, y: 80 },
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n3', to: 'n4' },
    ],
  },

  'xlsx-workflow': {
    id: 'xlsx-workflow',
    title: '高级 XLSX 工作流',
    nodes: [
      { id: 'n1', label: '读取工作簿', kind: 'xlsx-method', x: 50, y: 80 },
      { id: 'n2', label: 'Sheet转JSON', kind: 'xlsx-method', x: 280, y: 80 },
      { id: 'n3', label: '数据处理', kind: 'generic', x: 510, y: 80 },
      { id: 'n4', label: 'JSON转Sheet', kind: 'xlsx-method', x: 740, y: 80 },
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n3', to: 'n4' },
    ],
  },
};
