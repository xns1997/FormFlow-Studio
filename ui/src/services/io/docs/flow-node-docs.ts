import type { BehaviorTopicDocEntry } from './types';

export const flowNodeCategories: string[] = [
  '场景模板',
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
      {
        title: '使用场景',
        body: '1. 数据导入：快速读取 Excel 文件并生成字段模型\n2. 数据导出：将表单数据导出为 Excel 文件\n3. 数据预览：将工作表数据转换为 JSON/CSV 格式查看\n4. 批量操作：向现有 Excel 文件追加新数据',
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
          { name: '值输入', type: 'generic', description: '统一承接常量、变量和基础值输入，支持 string、number、boolean、array、object 类型。' },
          { name: '选项输入', type: 'generic', description: '统一承接单选、多选与下拉类选项输入，支持静态或动态选项来源。' },
          { name: '数据筛选', type: 'generic', description: '按字段、运算符和值筛选 JSON 行或工作表数据。' },
          { name: '多条件筛选', type: 'generic', description: '按多组条件一次性筛选记录，适合候选过滤和规则化查询。' },
          { name: '数据排序', type: 'generic', description: '按字段和顺序排列 JSON 行或工作表数据。' },
          { name: '记录变换', type: 'generic', description: '按字段映射、默认值和表达式把单条记录转成标准对象或 patch。' },
          { name: '字段分类器', type: 'generic', description: '按枚举、区间和条件标签对字段分类，适合风险标签和技术画像生成。' },
          { name: '数组查找', type: 'generic', description: '按主键或多条件从数组中查找单条或多条记录。' },
          { name: '数组增强', type: 'generic', description: '按关联键把参考数组字段补充到主数组，适合候选和附件合并。' },
          { name: '记录评分', type: 'generic', description: '按规则对记录数组打分并排序，适合推荐和优选场景。' },
        ],
      },
      {
        title: '使用场景',
        body: '1. 数据筛选：按条件过滤出符合要求的数据\n2. 数据排序：按指定字段对数据进行升序/降序排列\n3. 数据转换：将原始数据转换为目标格式\n4. 数据聚合：对数据进行分组统计和汇总\n5. 数据清洗：处理缺失值、重复值和异常值',
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
          { name: '文件来源', type: 'generic', description: '统一承接文件选择与文件数据来源，输出文件对象、原始数据和文件名。' },
          { name: '表与区域来源', type: 'generic', description: '统一选择工作表或区域，支持按名称、索引、活动表和多种范围模式输出 worksheet 与 range 信息。' },
          { name: '区域交集', type: 'generic', description: '计算两个普通或复杂 Range 的精确交集，保留所有不连续子区域。' },
          { name: '插入行', type: 'generic', description: '在工作表指定位置插入空行，保留并移动现有单元格、样式、公式和合并区域。' },
          { name: '删除行', type: 'generic', description: '删除工作表指定位置的行，保留并移动现有单元格、样式、公式和合并区域。' },
          { name: '插入列', type: 'generic', description: '在工作表指定位置插入空列，保留并移动现有单元格、样式、公式和合并区域。' },
          { name: '删除列', type: 'generic', description: '删除工作表指定位置的列，保留并移动现有单元格、样式、公式和合并区域。' },
          { name: '工作表写回工作簿', type: 'generic', description: '把修改后的工作表替换或追加到原工作簿，保留其他工作表。' },
          { name: '保存工作簿文件', type: 'generic', description: '将包含全部工作表和数据改动的工作簿序列化为可下载文件。' },
        ],
      },
      {
        title: '使用场景',
        body: '1. 动态修改 Excel：在工作表中插入/删除行和列\n2. 数据写回：将处理后的数据写回 Excel 文件\n3. 文件生成：创建工作簿并添加多个工作表\n4. 区域操作：计算两个区域的交集，用于精确数据定位',
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
          { name: '查询列表', type: 'behavior', description: '按条件查询项目数据表并直接回填列表字段。' },
          { name: '生成下一个编号', type: 'behavior', description: '扫描数据表指定列并生成下一条顺序编号。' },
          { name: '回填表单', type: 'behavior', description: '把单条记录按映射批量回填到当前表单。' },
          { name: '写回表记录', type: 'behavior', description: '按配置生成 upsert 写回动作，把记录保存到指定数据表。' },
          { name: '拼装消息', type: 'behavior', description: '按模板生成提示文案，可展示给用户或写回表单字段。' },
          { name: '必填校验', type: 'behavior', description: '批量检查提交前的必填字段。' },
          { name: '重置表单', type: 'behavior', description: '按清空字段、默认值和保留字段统一重置表单。' },
          { name: '流程调用', type: 'behavior', description: '调用其他已定义的流程，实现流程复用和模块化。' },
          { name: '延迟等待', type: 'behavior', description: '在流程中插入延迟，用于异步操作或节流控制。' },
        ],
      },
      {
        title: '使用场景',
        body: '1. 自定义逻辑：执行复杂的 JavaScript 脚本\n2. 流程控制：根据条件分支执行不同的流程路径\n3. 数据操作：查询、生成编号、回填表单\n4. 用户交互：显示消息、校验数据\n5. 流程复用：调用其他已定义的流程',
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
      {
        title: '使用场景',
        body: '1. 数据导出：将处理结果导出为 Excel/CSV 文件\n2. 结果展示：在流程中显示中间结果或最终结果\n3. 数据格式转换：将数据转换为不同格式',
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
      {
        title: '使用场景',
        body: '1. 聚类分析：客户分群、产品分类\n2. 预测分析：销售预测、趋势预测\n3. 分类任务：风险评估、信用评分\n4. 数据降维：高维数据可视化、特征提取',
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
      {
        title: '使用场景',
        body: '1. 底层操作：直接调用 SheetJS API 进行精细控制\n2. 格式转换：JSON/Array 与 Sheet 之间的转换\n3. 工作簿管理：创建、读取、修改工作簿\n4. 单元格操作：获取和修改单元格数据',
      },
    ],
  },
];
