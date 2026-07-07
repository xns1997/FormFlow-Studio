import type { BehaviorTopicDocEntry } from './types';

export const flowNodeCategories: string[] = [
  '场景模板',
  '输入与选择',
  '数据处理',
  'Excel 编辑',
  '流程行为',
  '输出与集成',
  '机器学习',
  '高级 XLSX',
];

export const flowNodeDocs: BehaviorTopicDocEntry[] = [
  {
    id: 'flow-nodes:scenario',
    slug: 'group-scenario',
    title: '场景模板',
    summary: '预设的常用工作流模板，将多步操作封装为单个节点，降低流程编排复杂度。',
    sections: [
      {
        title: '节点列表',
        fields: [
          { name: '读取 Excel 并生成字段模型', type: 'scenario', description: '封装读取工作簿、取 Sheet、转换 JSON、推断字段类型的常用数据接入链路。' },
          { name: 'JSON 表单结果导出 Excel', type: 'scenario', description: '封装 JSON 行数据生成 Sheet、创建工作簿、追加 Sheet、写出文件的导出链路。' },
          { name: '追加明细行到 Sheet', type: 'scenario', description: '封装向既有 Sheet 追加 JSON 或二维数组明细，并重新计算输出范围。' },
          { name: 'Sheet 多格式预览', type: 'scenario', description: '封装 Sheet 到 JSON、CSV、HTML 的预览输出方法。' },
          { name: '单元格地址工具包', type: 'scenario', description: '封装单元格、列、行、范围的编码和解码操作。' },
        ],
      },
    ],
  },
  {
    id: 'flow-nodes:input',
    slug: 'group-input',
    title: '输入与选择',
    summary: '数据输入和用户选择节点，提供文件选择、工作表选择、区域选择和各类值输入能力。',
    sections: [
      {
        title: '节点列表',
        fields: [
          { name: '文件选择器', type: 'generic', description: '通过文件对话框选择 Excel/CSV 文件，输出文件对象和原始数据。' },
          { name: '工作表选择器', type: 'generic', description: '从工作簿中按名称、索引或活动状态选择一个工作表。' },
          { name: '区域选择器', type: 'generic', description: '选择工作表中的单元格区域，支持地址、整表、已用范围等多种模式。' },
          { name: '区域交集', type: 'generic', description: '计算两个普通或复杂 Range 的精确交集，保留所有不连续子区域。' },
          { name: '变量输入', type: 'generic', description: '定义一个可复用的变量，支持 string、number、boolean、array、object 类型。' },
          { name: '文本输入', type: 'generic', description: '输入一个文本值，可作为流程参数或配置项。' },
          { name: '数字输入', type: 'generic', description: '输入一个数字值，支持设置最小值、最大值和步长。' },
          { name: '布尔输入', type: 'generic', description: '输入或接收一个布尔值，可作为开关控件的数据源。' },
        ],
      },
    ],
  },
  {
    id: 'flow-nodes:data-processing',
    slug: 'group-data-processing',
    title: '数据处理',
    summary: '过滤、排序、聚合、清洗等数据操作节点，对 JSON 行或工作表数据进行转换和加工。',
    sections: [
      {
        title: '节点列表',
        fields: [
          { name: '数据筛选', type: 'generic', description: '按字段、运算符和值筛选 JSON 行或工作表数据。' },
          { name: '数据排序', type: 'generic', description: '按字段和顺序排列 JSON 行或工作表数据。' },
        ],
      },
    ],
  },
  {
    id: 'flow-nodes:excel-edit',
    slug: 'group-excel-edit',
    title: 'Excel 编辑',
    summary: 'Excel 文件操作节点，包括行/列的插入删除、工作表写回和工作簿保存等功能。',
    sections: [
      {
        title: '节点列表',
        fields: [
          { name: '插入行', type: 'generic', description: '在工作表指定位置插入空行，保留并移动现有单元格、样式、公式和合并区域。' },
          { name: '删除行', type: 'generic', description: '删除工作表指定位置的行，保留并移动现有单元格、样式、公式和合并区域。' },
          { name: '插入列', type: 'generic', description: '在工作表指定位置插入空列，保留并移动现有单元格、样式、公式和合并区域。' },
          { name: '删除列', type: 'generic', description: '删除工作表指定位置的列，保留并移动现有单元格、样式、公式和合并区域。' },
          { name: '工作表写回工作簿', type: 'generic', description: '把修改后的工作表替换或追加到原工作簿，保留其他工作表。' },
          { name: '保存工作簿文件', type: 'generic', description: '将包含全部工作表和数据改动的工作簿序列化为可下载文件。' },
        ],
      },
    ],
  },
  {
    id: 'flow-nodes:behavior',
    slug: 'group-behavior',
    title: '流程行为',
    summary: '行为脚本和流程控制节点，用于执行自定义脚本逻辑和管理流程执行路径。',
    sections: [
      {
        title: '节点列表',
        fields: [
          { name: '行为脚本执行', type: 'behavior', description: '在流程中执行自定义 JavaScript 脚本，可读写上下文数据。' },
          { name: '条件分支', type: 'behavior', description: '根据条件表达式决定流程走向，支持多分支路由。' },
          { name: '循环迭代', type: 'behavior', description: '对数组或范围数据进行逐行迭代处理。' },
          { name: '流程调用', type: 'behavior', description: '调用其他已定义的流程，实现流程复用和模块化。' },
          { name: '延迟等待', type: 'behavior', description: '在流程中插入延迟，用于异步操作或节流控制。' },
        ],
      },
    ],
  },
  {
    id: 'flow-nodes:output',
    slug: 'group-output',
    title: '输出与集成',
    summary: '数据导出和外部集成节点，支持将数据导出为多种格式或与外部系统对接。',
    sections: [
      {
        title: '节点列表',
        fields: [
          { name: '数据导出', type: 'generic', description: '将 JSON 行、工作表或普通数据导出为 Excel、CSV、JSON 或 HTML 格式。' },
          { name: '输出/显示', type: 'generic', description: '接收输入值并显示，支持 auto、json、text 三种显示格式。' },
        ],
      },
    ],
  },
  {
    id: 'flow-nodes:ml',
    slug: 'group-ml',
    title: '机器学习',
    summary: 'Python ML 算法节点，通过 Python 后端执行聚类、分类、回归等机器学习任务。',
    sections: [
      {
        title: '节点列表',
        fields: [
          { name: 'K-Means 聚类', type: 'ml', description: '使用 K-Means 算法对数据进行聚类分析。' },
          { name: '线性回归', type: 'ml', description: '使用线性回归模型进行数值预测。' },
          { name: '逻辑回归', type: 'ml', description: '使用逻辑回归模型进行二分类或多分类。' },
          { name: '决策树分类', type: 'ml', description: '使用决策树算法进行分类任务。' },
          { name: '随机森林', type: 'ml', description: '使用随机森林集成方法进行分类或回归。' },
          { name: '主成分分析', type: 'ml', description: '使用 PCA 进行数据降维和特征提取。' },
        ],
      },
    ],
  },
  {
    id: 'flow-nodes:xlsx',
    slug: 'group-xlsx',
    title: '高级 XLSX',
    summary: 'SheetJS 底层方法封装，直接调用 XLSX 库的核心 API，适合需要精细控制的高级场景。',
    sections: [
      {
        title: '节点列表',
        fields: [
          { name: '读取工作簿 (XLSX.read)', type: 'xlsx-method', description: '从 ArrayBuffer、二进制字符串或文本中读取工作簿。' },
          { name: 'JSON 转 Sheet', type: 'xlsx-method', description: '把 JSON 行数组转成 Sheet。' },
          { name: '数组转 Sheet', type: 'xlsx-method', description: '把二维数组转成 Sheet。' },
          { name: 'Sheet 转 JSON', type: 'xlsx-method', description: '把 Sheet 转成 JSON 行数组。' },
          { name: '新建工作簿', type: 'xlsx-method', description: '创建一个空工作簿。' },
          { name: '追加 Sheet', type: 'xlsx-method', description: '向工作簿追加 Sheet。' },
          { name: '获取单元格', type: 'xlsx-method', description: '获取 Sheet 指定单元格的对象。' },
          { name: 'Sheet 转公式', type: 'xlsx-method', description: '把 Sheet 转成公式文本列表。' },
        ],
      },
    ],
  },
];
