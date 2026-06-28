import type { ExcelApiNodeSchema, SchemaProperty, SchemaPort } from './excel-api-types';

export type UnifiedNodeKind = 'xlsx-method' | 'scenario' | 'excel-class' | 'generic' | 'behavior';

export interface FlowNodeSpec {
  id: string;
  label: string;
  description: string;
  category: string;
  kind: UnifiedNodeKind;
  properties: SchemaProperty[];
  ports: SchemaPort[];
  argumentHint?: string;
  keywords?: string[];
  originalName?: string;
}

type XlsxNamespace = Record<string, unknown>;

let xlsxModuleCache: XlsxNamespace | null = null;

async function loadXlsxModule(): Promise<XlsxNamespace> {
  if (xlsxModuleCache) return xlsxModuleCache;
  const mod = await import('xlsx');
  xlsxModuleCache = mod as unknown as XlsxNamespace;
  return xlsxModuleCache;
}

const methodLabels: Record<string, string> = {
  'XLSX.read': '读取工作簿',
  'XLSX.write': '序列化工作簿',
  'XLSX.writeFile': '写出文件',
  'XLSX.readFile': '读取文件',
  'XLSX.readFileSync': '同步读取文件',
  'XLSX.writeFileSync': '同步写出文件',
  'XLSX.writeFileAsync': '异步写出文件',
  'XLSX.writeFileXLSX': '写出 XLSX 文件',
  'XLSX.writeXLSX': '序列化为 XLSX',
  'XLSX.utils.sheet_to_json': 'Sheet 转 JSON',
  'XLSX.utils.json_to_sheet': 'JSON 转 Sheet',
  'XLSX.utils.aoa_to_sheet': '数组转 Sheet',
  'XLSX.utils.sheet_to_aoa': 'Sheet 转数组',
  'XLSX.utils.book_new': '新建工作簿',
  'XLSX.utils.book_append_sheet': '追加 Sheet',
  'XLSX.utils.book_remove_sheet': '删除 Sheet',
  'XLSX.utils.book_move_sheet': '移动 Sheet',
  'XLSX.utils.sheet_to_csv': 'Sheet 转 CSV',
  'XLSX.utils.sheet_to_html': 'Sheet 转 HTML',
  'XLSX.utils.sheet_to_formulae': 'Sheet 转公式',
  'XLSX.utils.sheet_to_txt': 'Sheet 转文本',
  'XLSX.utils.sheet_to_row_object_array': 'Sheet 转行对象',
  'XLSX.utils.sheet_add_json': '追加 JSON 行',
  'XLSX.utils.sheet_add_aoa': '追加数组行',
  'XLSX.utils.sheet_add_dom': '追加 DOM 数据',
  'XLSX.utils.sheet_get_range': '获取区域',
  'XLSX.utils.sheet_get_cell': '获取单元格',
  'XLSX.utils.sheet_insert_rows': '插入行',
  'XLSX.utils.sheet_delete_rows': '删除行',
  'XLSX.utils.sheet_insert_cols': '插入列',
  'XLSX.utils.sheet_delete_cols': '删除列',
  'XLSX.utils.sheet_set_array_formula': '设置数组公式',
  'XLSX.utils.encode_cell': '坐标转地址',
  'XLSX.utils.decode_cell': '地址转坐标',
  'XLSX.utils.encode_range': '范围转地址',
  'XLSX.utils.decode_range': '地址转范围',
  'XLSX.utils.encode_col': '列号转字母',
  'XLSX.utils.decode_col': '字母转列号',
  'XLSX.utils.encode_row': '行号转标签',
  'XLSX.utils.decode_row': '标签转行号',
  'XLSX.utils.split_cell': '拆分合并地址',
  'XLSX.utils.format_cell': '格式化单元格',
  'XLSX.utils.cell_set_number_format': '设置数字格式',
  'XLSX.utils.cell_add_comment': '添加批注',
  'XLSX.utils.cell_set_hyperlink': '设置超链接',
  'XLSX.utils.cell_set_internal_link': '设置内部链接',
  'XLSX.utils.book_set_sheet_visibility': '设置 Sheet 可见性',
  'XLSX.utils.table_to_sheet': 'DOM 表格转 Sheet',
  'XLSX.utils.table_to_book': 'DOM 表格转工作簿',
  'XLSX.utils.sheet_to_dom': 'Sheet 转 DOM',
  'XLSX.SSF.format': '数字格式化',
  'XLSX.SSF.load': '加载格式表',
  'XLSX.SSF.get_table': '获取格式表',
  'XLSX.SSF.is_date': '判断日期格式',
  'XLSX.SSF.load_table': '加载格式表(带索引)',
  'XLSX.SSF.parse_date_code': '解析日期序列号',
  'XLSX.CFB.read': '读取复合文件',
  'XLSX.CFB.write': '写出复合文件',
  'XLSX.CFB.find': '查找条目',
  'XLSX.CFB.parse': '解析复合文件',
  'XLSX.CFB.writeFile': '写出 CFB 文件',
  'XLSX.CFB.utils.cfb_new': '新建复合文件',
  'XLSX.CFB.utils.cfb_add': '添加条目',
  'XLSX.CFB.utils.cfb_del': '删除条目',
  'XLSX.CFB.utils.cfb_gc': '清理条目',
  'XLSX.CFB.utils.cfb_mov': '移动条目',
  'XLSX.CFB.utils.CheckField': '校验字段',
  'XLSX.CFB.utils.ReadShift': '读取字节流',
  'XLSX.CFB.utils._deflateRaw': '压缩数据',
  'XLSX.CFB.utils._inflateRaw': '解压数据',
  'XLSX.CFB.utils.bconcat': '合并缓冲区',
  'XLSX.CFB.utils.prep_blob': '准备 Blob',
  'XLSX.CFB.utils.use_zlib': '设置 zlib',
  'XLSX.stream.to_json': '流式转 JSON',
  'XLSX.stream.to_csv': '流式转 CSV',
  'XLSX.stream.to_html': '流式转 HTML',
  'XLSX.stream.set_readable': '设置可读流',
  'XLSX.parse_xlscfb': '解析 XLS CFB',
  'XLSX.parse_zip': '解析 ZIP',
};

const methodDescriptions: Record<string, string> = {
  'XLSX.read': '从 ArrayBuffer、二进制字符串或文本中读取工作簿。',
  'XLSX.write': '把工作簿序列化为指定格式。',
  'XLSX.writeFile': '将工作簿写出为文件，浏览器中通常会触发下载。',
  'XLSX.utils.sheet_to_json': '把 Sheet 转成 JSON 行数组。',
  'XLSX.utils.json_to_sheet': '把 JSON 行数组转成 Sheet。',
  'XLSX.utils.aoa_to_sheet': '把二维数组转成 Sheet。',
  'XLSX.utils.sheet_to_aoa': '把 Sheet 转成二维数组。',
  'XLSX.utils.book_new': '创建一个空工作簿。',
  'XLSX.utils.book_append_sheet': '向工作簿追加 Sheet。',
  'XLSX.utils.book_remove_sheet': '从工作簿中删除 Sheet。',
  'XLSX.utils.book_move_sheet': '调整工作簿中 Sheet 的顺序。',
  'XLSX.utils.sheet_to_csv': '把 Sheet 导出成 CSV 文本。',
  'XLSX.utils.sheet_to_html': '把 Sheet 导出成 HTML 表格。',
  'XLSX.utils.sheet_to_formulae': '把 Sheet 转成公式文本列表。',
  'XLSX.utils.sheet_add_json': '向 Sheet 追加 JSON 行。',
  'XLSX.utils.sheet_add_aoa': '向 Sheet 追加二维数组。',
  'XLSX.utils.sheet_add_dom': '将 DOM Table 追加到 Sheet。',
  'XLSX.utils.sheet_to_dom': '把 Sheet 转成 DOM Table。',
  'XLSX.utils.table_to_sheet': '把 DOM Table 转成 Sheet。',
  'XLSX.utils.table_to_book': '把 DOM Table 转成工作簿。',
  'XLSX.utils.encode_cell': '把单元格坐标编码成 A1 地址。',
  'XLSX.utils.decode_cell': '把 A1 地址解析成坐标。',
  'XLSX.utils.encode_range': '把范围坐标编码成 A1 区间。',
  'XLSX.utils.decode_range': '把 A1 区间解析成范围坐标。',
  'XLSX.utils.encode_col': '把列号编码成字母。',
  'XLSX.utils.decode_col': '把列字母解码成列号。',
  'XLSX.utils.encode_row': '把行号编码成行号字符串。',
  'XLSX.utils.decode_row': '把行号字符串解码成行号。',
  'XLSX.utils.sheet_get_range': '获取 Sheet 指定范围内的单元格。',
  'XLSX.utils.sheet_get_cell': '获取 Sheet 指定单元格的对象。',
  'XLSX.utils.sheet_insert_rows': '在 Sheet 中插入空行。',
  'XLSX.utils.sheet_delete_rows': '删除 Sheet 中的行。',
  'XLSX.utils.sheet_insert_cols': '在 Sheet 中插入空列。',
  'XLSX.utils.sheet_delete_cols': '删除 Sheet 中的列。',
};

const methodHints: Record<string, string> = {
  'XLSX.read': '[data, { "type": "array" }]',
  'XLSX.write': '[workbook, { "bookType": "xlsx", "type": "array" }]',
  'XLSX.writeFile': '[workbook, "output.xlsx"]',
  'XLSX.utils.sheet_to_json': '[worksheet, { "defval": "" }]',
  'XLSX.utils.json_to_sheet': '[[{ "姓名": "张三" }]]',
  'XLSX.utils.aoa_to_sheet': '[[["姓名", "部门"], ["张三", "技术部"]]]',
  'XLSX.utils.book_append_sheet': '[workbook, worksheet, "Sheet1"]',
  'XLSX.utils.sheet_add_json': '[worksheet, [{ "姓名": "李四" }], { "origin": -1 }]',
  'XLSX.utils.sheet_add_aoa': '[worksheet, [["合计", 100]], { "origin": -1 }]',
  'XLSX.utils.encode_cell': '[{ "r": 0, "c": 0 }]',
  'XLSX.utils.decode_cell': '["A1"]',
  'XLSX.utils.encode_range': '[{ "s": { "r": 0, "c": 0 }, "e": { "r": 4, "c": 2 } }]',
  'XLSX.utils.decode_range': '["A1:C5"]',
  'XLSX.utils.encode_col': '[0]',
  'XLSX.utils.decode_col': '["A"]',
  'XLSX.utils.encode_row': '[0]',
  'XLSX.utils.decode_row': '["1"]',
  'XLSX.utils.sheet_to_csv': '[worksheet]',
  'XLSX.utils.sheet_to_html': '[worksheet]',
  'XLSX.utils.sheet_to_formulae': '[worksheet]',
  'XLSX.utils.sheet_insert_rows': '[worksheet, 5, 3]',
  'XLSX.utils.sheet_delete_rows': '[worksheet, 5, 3]',
  'XLSX.utils.sheet_insert_cols': '[worksheet, 2, 1]',
  'XLSX.utils.sheet_delete_cols': '[worksheet, 2, 1]',
};

const ignoredKeys = new Set([
  'default', 'module.exports', 'utils', 'SSF', 'CFB', 'stream',
  'version', 'consts',
]);

function classifyMethod(namespace: string, key: string): string {
  if (namespace === 'XLSX') return '功能 · 工作簿 IO';
  if (key.includes('json')) return '功能 · JSON 转换';
  if (key.includes('aoa')) return '功能 · 二维数组';
  if (key.includes('book')) return '功能 · 工作簿管理';
  if (key.includes('sheet')) return '功能 · Sheet 操作';
  if (key.includes('cell') || key.includes('row') || key.includes('col') || key.includes('range')) return '功能 · 地址编码';
  if (namespace.includes('SSF')) return '功能 · 格式化';
  if (namespace.includes('stream')) return '功能 · 流式输出';
  if (namespace.includes('CFB')) return '功能 · 复合文件';
  return '功能 · 通用';
}

function methodToPorts(namespace: string, fullName: string, fn: Function): { properties: SchemaProperty[]; ports: SchemaPort[] } {
  const parts = fullName.replace(namespace + '.', '').split('.');
  const methodName = parts[parts.length - 1];

  const inputPatterns: Record<string, { ports: SchemaPort[]; properties: SchemaProperty[] }> = {
    'read': {
      properties: [
        { name: 'type', label: '数据类型', type: 'enum', enum: ['array', 'binary', 'buffer', 'string', 'base64'], default: 'array', description: '数据编码格式' },
        { name: 'bookType', label: '工作簿类型', type: 'enum', enum: ['xlsx', 'xlsm', 'xlsb', 'xls', 'csv', 'ods', 'numbers'], default: 'xlsx', description: '文件格式' },
        { name: 'cellFormula', label: '解析公式', type: 'boolean', default: true, description: '是否解析公式' },
        { name: 'cellDates', label: '日期转 Date', type: 'boolean', default: false, description: '是否转为 Date 对象' },
        { name: 'sheetRows', label: '行数限制', type: 'number', default: 0, description: '读取行数限制' },
      ],
      ports: [
        { name: 'data', label: '数据', type: 'any', direction: 'input', required: true, description: '输入数据' },
        { name: 'workbook', label: '工作簿', type: 'object', direction: 'output', description: '解析后的工作簿' },
      ],
    },
    'write': {
      properties: [
        { name: 'bookType', label: '输出格式', type: 'enum', enum: ['xlsx', 'xlsm', 'xlsb', 'xls', 'csv', 'txt', 'ods', 'numbers'], default: 'xlsx', description: '输出格式' },
        { name: 'type', label: '输出类型', type: 'enum', enum: ['array', 'buffer', 'binary', 'string'], default: 'array', description: '返回数据类型' },
        { name: 'compression', label: '压缩', type: 'boolean', default: false, description: '是否启用 ZIP 压缩' },
      ],
      ports: [
        { name: 'workbook', label: '工作簿', type: 'object', direction: 'input', required: true, description: '工作簿对象' },
        { name: 'data', label: '数据', type: 'any', direction: 'output', description: '序列化后的数据' },
      ],
    },
    'writeFile': {
      properties: [
        { name: 'bookType', label: '输出格式', type: 'enum', enum: ['xlsx', 'xlsm', 'xlsb', 'xls', 'csv'], default: 'xlsx', description: '文件格式' },
        { name: 'type', label: '输出类型', type: 'enum', enum: ['array', 'buffer', 'binary'], default: 'array', description: '序列化格式' },
      ],
      ports: [
        { name: 'workbook', label: '工作簿', type: 'object', direction: 'input', required: true, description: '工作簿对象' },
        { name: 'filename', label: '文件名', type: 'string', direction: 'input', required: true, description: '输出文件名' },
        { name: 'result', label: '结果', type: 'any', direction: 'output', description: '写出结果' },
      ],
    },
    'sheet_to_json': {
      properties: [
        { name: 'header', label: '表头', type: 'array', default: [], description: '表头数组' },
        { name: 'defval', label: '默认值', type: 'string', default: '', description: '空值默认' },
        { name: 'raw', label: '原始值', type: 'boolean', default: true, description: '返回原始值' },
        { name: 'blankrows', label: '包含空行', type: 'boolean', default: true, description: '保留空行' },
        { name: 'dateNF', label: '日期格式', type: 'string', default: 'yyyy-mm-dd', description: '日期格式' },
      ],
      ports: [
        { name: 'worksheet', label: '工作表', type: 'object', direction: 'input', required: true, description: '工作表对象' },
        { name: 'rows', label: 'JSON 行', type: 'array', direction: 'output', description: 'JSON 行数组' },
      ],
    },
    'json_to_sheet': {
      properties: [
        { name: 'header', label: '列名', type: 'array', default: [], description: '列名顺序' },
        { name: 'skipHeader', label: '跳过表头', type: 'boolean', default: false, description: '不输出表头' },
        { name: 'dateNF', label: '日期格式', type: 'string', default: 'yyyy-mm-dd', description: '日期格式' },
      ],
      ports: [
        { name: 'data', label: 'JSON 数据', type: 'array', direction: 'input', required: true, description: 'JSON 行数组' },
        { name: 'worksheet', label: '工作表', type: 'object', direction: 'output', description: '生成的工作表' },
      ],
    },
    'aoa_to_sheet': {
      properties: [
        { name: 'skipHeader', label: '跳过表头', type: 'boolean', default: false, description: '不输出表头' },
        { name: 'dateNF', label: '日期格式', type: 'string', default: 'yyyy-mm-dd', description: '日期格式' },
      ],
      ports: [
        { name: 'data', label: '二维数组', type: 'array', direction: 'input', required: true, description: '二维数组数据' },
        { name: 'worksheet', label: '工作表', type: 'object', direction: 'output', description: '生成的工作表' },
      ],
    },
    'sheet_to_csv': {
      properties: [
        { name: 'FS', label: '字段分隔符', type: 'string', default: ',', description: '字段分隔符' },
        { name: 'dateNF', label: '日期格式', type: 'string', default: 'yyyy-mm-dd', description: '日期格式' },
      ],
      ports: [
        { name: 'worksheet', label: '工作表', type: 'object', direction: 'input', required: true, description: '工作表对象' },
        { name: 'csv', label: 'CSV 文本', type: 'string', direction: 'output', description: 'CSV 文本' },
      ],
    },
    'sheet_to_html': {
      properties: [
        { name: 'header', label: '表头行号', type: 'number', default: -1, description: '表头行号' },
      ],
      ports: [
        { name: 'worksheet', label: '工作表', type: 'object', direction: 'input', required: true, description: '工作表对象' },
        { name: 'html', label: 'HTML', type: 'string', direction: 'output', description: 'HTML 表格' },
      ],
    },
    'sheet_add_json': {
      properties: [
        { name: 'origin', label: '起始位置', type: 'string', default: -1, description: '-1=末尾，或 A1 地址' },
        { name: 'skipHeader', label: '跳过表头', type: 'boolean', default: false, description: '不输出表头' },
      ],
      ports: [
        { name: 'worksheet', label: '工作表', type: 'object', direction: 'input', required: true, description: '工作表对象' },
        { name: 'data', label: 'JSON 数据', type: 'array', direction: 'input', required: true, description: 'JSON 行数组' },
        { name: 'worksheet', label: '工作表', type: 'object', direction: 'output', description: '修改后的工作表' },
      ],
    },
    'book_new': {
      properties: [],
      ports: [
        { name: 'workbook', label: '工作簿', type: 'object', direction: 'output', description: '新工作簿' },
      ],
    },
    'book_append_sheet': {
      properties: [
        { name: 'sheetName', label: 'Sheet 名', type: 'string', default: '', description: 'Sheet 名称' },
      ],
      ports: [
        { name: 'workbook', label: '工作簿', type: 'object', direction: 'input', required: true, description: '工作簿对象' },
        { name: 'worksheet', label: '工作表', type: 'object', direction: 'input', required: true, description: '要追加的工作表' },
        { name: 'workbook', label: '工作簿', type: 'object', direction: 'output', description: '修改后的工作簿' },
      ],
    },
    'encode_cell': {
      properties: [],
      ports: [
        { name: 'cell', label: '坐标', type: 'object', direction: 'input', required: true, description: '{r, c} 坐标' },
        { name: 'address', label: '地址', type: 'string', direction: 'output', description: 'A1 地址' },
      ],
    },
    'decode_cell': {
      properties: [],
      ports: [
        { name: 'address', label: '地址', type: 'string', direction: 'input', required: true, description: 'A1 地址' },
        { name: 'cell', label: '坐标', type: 'object', direction: 'output', description: '{r, c} 坐标' },
      ],
    },
    'encode_range': {
      properties: [],
      ports: [
        { name: 'range', label: '范围', type: 'object', direction: 'input', required: true, description: '{s:{r,c}, e:{r,c}}' },
        { name: 'address', label: '地址', type: 'string', direction: 'output', description: 'A1 区间' },
      ],
    },
    'decode_range': {
      properties: [],
      ports: [
        { name: 'address', label: '地址', type: 'string', direction: 'input', required: true, description: 'A1 区间' },
        { name: 'range', label: '范围', type: 'object', direction: 'output', description: '范围对象' },
      ],
    },
    'encode_col': {
      properties: [],
      ports: [
        { name: 'col', label: '列号', type: 'number', direction: 'input', required: true, description: '列号（0 开始）' },
        { name: 'letter', label: '字母', type: 'string', direction: 'output', description: '列字母' },
      ],
    },
    'decode_col': {
      properties: [],
      ports: [
        { name: 'letter', label: '字母', type: 'string', direction: 'input', required: true, description: '列字母' },
        { name: 'col', label: '列号', type: 'number', direction: 'output', description: '列号' },
      ],
    },
    'encode_row': {
      properties: [],
      ports: [
        { name: 'row', label: '行号', type: 'number', direction: 'input', required: true, description: '行号（0 开始）' },
        { name: 'label', label: '标签', type: 'string', direction: 'output', description: '1-indexed 行号' },
      ],
    },
    'decode_row': {
      properties: [],
      ports: [
        { name: 'label', label: '标签', type: 'string', direction: 'input', required: true, description: '1-indexed 行号' },
        { name: 'row', label: '行号', type: 'number', direction: 'output', description: '0-indexed 行号' },
      ],
    },
    'sheet_to_aoa': {
      properties: [
        { name: 'raw', label: '原始值', type: 'boolean', default: true, description: '返回原始值' },
      ],
      ports: [
        { name: 'worksheet', label: '工作表', type: 'object', direction: 'input', required: true, description: '工作表对象' },
        { name: 'data', label: '二维数组', type: 'array', direction: 'output', description: '二维数组' },
      ],
    },
  };

  if (inputPatterns[methodName]) return inputPatterns[methodName];

  if (methodName.includes('sheet') && methodName.includes('add')) {
    return {
      properties: [
        { name: 'origin', label: '起始位置', type: 'string', default: -1, description: '起始位置' },
      ],
      ports: [
        { name: 'worksheet', label: '工作表', type: 'object', direction: 'input', required: true, description: '工作表对象' },
        { name: 'data', label: '数据', type: 'array', direction: 'input', required: true, description: '要追加的数据' },
        { name: 'worksheet', label: '工作表', type: 'object', direction: 'output', description: '修改后的工作表' },
      ],
    };
  }

  if (methodName.includes('sheet') && (methodName.includes('insert') || methodName.includes('delete'))) {
    return {
      properties: [
        { name: 'count', label: '数量', type: 'number', default: 1, min: 1, description: '插入/删除的数量' },
      ],
      ports: [
        { name: 'worksheet', label: '工作表', type: 'object', direction: 'input', required: true, description: '工作表对象' },
        { name: 'start', label: '起始', type: 'number', direction: 'input', required: true, description: '起始位置' },
        { name: 'count', label: '数量', type: 'number', direction: 'input', description: '操作数量' },
        { name: 'worksheet', label: '工作表', type: 'object', direction: 'output', description: '修改后的工作表' },
      ],
    };
  }

  return {
    properties: [],
    ports: [
      { name: '_args', label: '参数', type: 'any', direction: 'input', description: '输入参数' },
      { name: 'result', label: '结果', type: 'any', direction: 'output', description: '返回值' },
    ],
  };
}

function collectXlsxMethods(namespace: string, value: unknown, prefix: string[] = []): FlowNodeSpec[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    if (ignoredKeys.has(key)) return [];
    const path = [...prefix, key];
    const fullName = `${namespace}.${path.join('.')}`;
    if (typeof child === 'function') {
      const { properties, ports } = methodToPorts(namespace, fullName, child);
      const spec: FlowNodeSpec = {
        id: `method:${fullName}`,
        label: methodLabels[fullName] || fullName.split('.').pop() || key,
        description: methodDescriptions[fullName] || `${key} 方法`,
        category: classifyMethod(namespace, key),
        kind: 'xlsx-method',
        properties,
        ports,
      };
      return [spec];
    }
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      return collectXlsxMethods(namespace, child, path);
    }
    return [];
  });
}

function propertyToPort(prop: SchemaProperty): SchemaPort {
  if (prop.port) return prop.port;
  return {
    name: prop.name,
    label: prop.label,
    type: prop.type,
    direction: 'input',
    required: prop.required,
    defaultValue: prop.default,
    description: prop.description,
  };
}

function excelApiClassToSpec(node: ExcelApiNodeSchema): FlowNodeSpec {
  const props = node.properties;
  const explicitPorts = node.ports || [];
  const propPorts = props.map(propertyToPort);
  const inputPorts = explicitPorts.filter(p => p.direction === 'input' || p.direction === 'both');
  const outputPorts = explicitPorts.filter(p => p.direction === 'output' || p.direction === 'both');
  const allPorts = [...inputPorts, ...propPorts.filter(pp => !inputPorts.some(ip => ip.name === pp.name)), ...outputPorts];

  return {
    id: `excel:${node.id}`,
    label: node.label,
    description: node.description,
    category: `Excel API · ${node.category}`,
    kind: 'excel-class',
    properties: props,
    ports: allPorts,
  };
}

const genericNodeSpecs: FlowNodeSpec[] = [
  {
    id: 'generic:file-picker',
    label: '文件选择器',
    description: '通过文件对话框选择 Excel/CSV 文件',
    category: '功能 · 输入节点',
    kind: 'generic',
    properties: [
      { name: 'accept', label: '允许类型', type: 'string', default: '.xlsx,.xls,.csv', description: '文件扩展名' },
      { name: 'multiple', label: '允许多选', type: 'boolean', default: false, description: '是否多选' },
    ],
    ports: [
      { name: 'trigger', label: '触发', type: 'any', direction: 'input', required: true, description: '触发选择' },
      { name: 'accept', label: '类型', type: 'string', direction: 'input', defaultValue: '.xlsx,.xls,.csv', description: '文件类型' },
      { name: 'multiple', label: '多选', type: 'boolean', direction: 'input', defaultValue: false, description: '多选' },
      { name: 'file', label: '文件', type: 'object', direction: 'output', description: '文件对象' },
      { name: 'data', label: '数据', type: 'any', direction: 'output', description: '文件数据' },
      { name: 'name', label: '文件名', type: 'string', direction: 'output', description: '文件名' },
    ],
  },
  {
    id: 'generic:worksheet-select',
    label: '工作表选择器',
    description: '从工作簿中选择一个工作表',
    category: '功能 · 选择节点',
    kind: 'generic',
    properties: [
      { name: 'selectMode', label: '选择模式', type: 'enum', enum: ['byName', 'byIndex', 'active', 'first'], default: 'active', description: '选择方式' },
      { name: 'sheetName', label: '工作表名', type: 'string', default: '', description: '目标工作表名' },
      { name: 'sheetIndex', label: '索引', type: 'number', default: 0, min: 0, description: '目标索引' },
    ],
    ports: [
      { name: 'workbook', label: '工作簿', type: 'object', direction: 'input', required: true, description: '输入工作簿' },
      { name: 'selectMode', label: '模式', type: 'enum', direction: 'input', defaultValue: 'active', enum: ['byName', 'byIndex', 'active', 'first'], description: '选择方式' },
      { name: 'sheetName', label: '表名', type: 'string', direction: 'input', description: '工作表名' },
      { name: 'sheetIndex', label: '索引', type: 'number', direction: 'input', defaultValue: 0, description: '索引' },
      { name: 'worksheet', label: '工作表', type: 'object', direction: 'output', description: '选中的工作表' },
      { name: 'sheetNames', label: '所有名称', type: 'array', direction: 'output', description: '所有工作表名' },
    ],
  },
  {
    id: 'generic:range-select',
    label: '区域选择器',
    description: '选择工作表中的单元格区域',
    category: '功能 · 选择节点',
    kind: 'generic',
    properties: [
      { name: 'rangeMode', label: '选择模式', type: 'enum', enum: ['address', 'entireSheet', 'usedRange', 'row', 'column', 'custom'], default: 'usedRange', description: '选择方式' },
      { name: 'address', label: '地址', type: 'string', default: '', description: 'A1 格式地址' },
      { name: 'rowIndex', label: '起始行', type: 'number', default: 1, min: 1, description: '起始行号' },
      { name: 'colIndex', label: '起始列', type: 'number', default: 1, min: 1, description: '起始列号' },
      { name: 'rowCount', label: '行数', type: 'number', default: 1, min: 1, description: '行数' },
      { name: 'colCount', label: '列数', type: 'number', default: 1, min: 1, description: '列数' },
    ],
    ports: [
      { name: 'worksheet', label: '工作表', type: 'object', direction: 'input', required: true, description: '输入工作表' },
      { name: 'rangeMode', label: '模式', type: 'enum', direction: 'input', defaultValue: 'usedRange', enum: ['address', 'entireSheet', 'usedRange', 'row', 'column', 'custom'], description: '选择方式' },
      { name: 'address', label: '地址', type: 'string', direction: 'input', description: 'A1 地址' },
      { name: 'rowIndex', label: '起始行', type: 'number', direction: 'input', defaultValue: 1, description: '行号' },
      { name: 'colIndex', label: '起始列', type: 'number', direction: 'input', defaultValue: 1, description: '列号' },
      { name: 'rowCount', label: '行数', type: 'number', direction: 'input', defaultValue: 1, description: '行数' },
      { name: 'colCount', label: '列数', type: 'number', direction: 'input', defaultValue: 1, description: '列数' },
      { name: 'range', label: '区域', type: 'object', direction: 'output', description: '区域对象' },
      { name: 'address', label: '地址', type: 'string', direction: 'output', description: 'A1 地址' },
      { name: 'values', label: '值', type: 'array', direction: 'output', description: '区域值' },
    ],
  },
  {
    id: 'generic:variable-input',
    label: '变量输入',
    description: '定义一个可复用的变量',
    category: '功能 · 输入节点',
    kind: 'generic',
    properties: [
      { name: 'varName', label: '变量名', type: 'string', default: 'myVar', required: true, description: '变量标识符' },
      { name: 'varType', label: '变量类型', type: 'enum', enum: ['string', 'number', 'boolean', 'array', 'object'], default: 'string', description: '数据类型' },
      { name: 'varValue', label: '变量值', type: 'any', default: '', description: '初始值' },
    ],
    ports: [
      { name: 'override', label: '覆盖值', type: 'any', direction: 'input', description: '外部覆盖' },
      { name: 'value', label: '值', type: 'any', direction: 'output', description: '变量当前值' },
      { name: 'varName', label: '变量名', type: 'string', direction: 'output', description: '变量名' },
    ],
  },
  {
    id: 'generic:text-input',
    label: '文本输入',
    description: '输入一个文本值',
    category: '功能 · 输入节点',
    kind: 'generic',
    properties: [
      { name: 'value', label: '文本值', type: 'string', default: '', description: '输入的文本' },
      { name: 'placeholder', label: '占位符', type: 'string', default: '输入文本…', description: '占位提示' },
    ],
    ports: [
      { name: 'override', label: '覆盖', type: 'string', direction: 'input', description: '外部覆盖' },
      { name: 'value', label: '值', type: 'string', direction: 'output', description: '当前文本值' },
    ],
  },
  {
    id: 'generic:number-input',
    label: '数字输入',
    description: '输入一个数字值',
    category: '功能 · 输入节点',
    kind: 'generic',
    properties: [
      { name: 'value', label: '数字值', type: 'number', default: 0, description: '输入的数字' },
      { name: 'min', label: '最小值', type: 'number', default: -Infinity, description: '最小值' },
      { name: 'max', label: '最大值', type: 'number', default: Infinity, description: '最大值' },
      { name: 'step', label: '步长', type: 'number', default: 1, description: '步长' },
    ],
    ports: [
      { name: 'override', label: '覆盖', type: 'number', direction: 'input', description: '外部覆盖' },
      { name: 'value', label: '值', type: 'number', direction: 'output', description: '当前数字值' },
    ],
  },
  {
    id: 'generic:boolean-switch',
    label: '布尔开关',
    description: '输入一个布尔值',
    category: '功能 · 输入节点',
    kind: 'generic',
    properties: [
      { name: 'value', label: '布尔值', type: 'boolean', default: false, description: '开关状态' },
    ],
    ports: [
      { name: 'override', label: '覆盖', type: 'boolean', direction: 'input', description: '外部覆盖' },
      { name: 'value', label: '值', type: 'boolean', direction: 'output', description: '当前布尔值' },
    ],
  },
  {
    id: 'generic:output-display',
    label: '输出/显示',
    description: '接收输入值并显示',
    category: '功能 · 输出节点',
    kind: 'generic',
    properties: [
      { name: 'label', label: '显示标签', type: 'string', default: '输出', description: '标签文本' },
      { name: 'format', label: '显示格式', type: 'enum', enum: ['auto', 'json', 'text'], default: 'auto', description: '显示格式' },
      { name: 'logToConsole', label: '输出到控制台', type: 'boolean', default: false, description: '是否输出到 console' },
    ],
    ports: [
      { name: 'value', label: '输入值', type: 'any', direction: 'input', required: true, description: '要显示的值' },
      { name: 'label', label: '标签', type: 'string', direction: 'input', description: '标签覆盖' },
      { name: 'value', label: '输出值', type: 'any', direction: 'output', description: '透传的值' },
    ],
  },
];

const scenarioSpecs: FlowNodeSpec[] = [
  {
    id: 'scenario:excel-to-json-schema',
    label: '读取 Excel 并生成字段模型',
    description: '封装读取工作簿、取 Sheet、转换 JSON、推断字段类型的常用数据接入链路。',
    category: '功能 · 场景接入',
    kind: 'scenario',
    properties: [],
    ports: [
      { name: 'fileData', label: '文件数据', type: 'any', direction: 'input', required: true, description: '文件 ArrayBuffer' },
      { name: 'workbook', label: '工作簿', type: 'object', direction: 'output', description: '解析后的工作簿' },
      { name: 'jsonData', label: 'JSON 数据', type: 'array', direction: 'output', description: 'JSON 行数据' },
      { name: 'schema', label: '字段模型', type: 'object', direction: 'output', description: '字段类型推断结果' },
    ],
  },
  {
    id: 'scenario:json-to-xlsx-export',
    label: 'JSON 表单结果导出 Excel',
    description: '封装 JSON 行数据生成 Sheet、创建工作簿、追加 Sheet、写出文件的导出链路。',
    category: '功能 · 场景导出',
    kind: 'scenario',
    properties: [],
    ports: [
      { name: 'jsonData', label: 'JSON 数据', type: 'array', direction: 'input', required: true, description: 'JSON 行数据' },
      { name: 'fileName', label: '文件名', type: 'string', direction: 'input', defaultValue: 'output.xlsx', description: '输出文件名' },
      { name: 'fileData', label: '文件数据', type: 'any', direction: 'output', description: '输出的文件数据' },
    ],
  },
  {
    id: 'scenario:append-rows',
    label: '追加明细行到 Sheet',
    description: '封装向既有 Sheet 追加 JSON 或二维数组明细，并重新计算输出范围。',
    category: '功能 · 场景编辑',
    kind: 'scenario',
    properties: [],
    ports: [
      { name: 'worksheet', label: '工作表', type: 'object', direction: 'input', required: true, description: '目标工作表' },
      { name: 'rows', label: '行数据', type: 'array', direction: 'input', required: true, description: '要追加的行' },
      { name: 'worksheet', label: '工作表', type: 'object', direction: 'output', description: '修改后的工作表' },
    ],
  },
  {
    id: 'scenario:sheet-preview',
    label: 'Sheet 多格式预览',
    description: '封装 Sheet 到 JSON、CSV、HTML 的预览输出方法。',
    category: '功能 · 场景预览',
    kind: 'scenario',
    properties: [],
    ports: [
      { name: 'worksheet', label: '工作表', type: 'object', direction: 'input', required: true, description: '要预览的工作表' },
      { name: 'jsonPreview', label: 'JSON', type: 'array', direction: 'output', description: 'JSON 预览' },
      { name: 'csvPreview', label: 'CSV', type: 'string', direction: 'output', description: 'CSV 预览' },
      { name: 'htmlPreview', label: 'HTML', type: 'string', direction: 'output', description: 'HTML 预览' },
    ],
  },
  {
    id: 'scenario:cell-address-toolkit',
    label: '单元格地址工具包',
    description: '封装单元格、列、行、范围的编码和解码。',
    category: '功能 · 场景地址',
    kind: 'scenario',
    properties: [],
    ports: [
      { name: 'address', label: '地址', type: 'string', direction: 'both', description: 'A1 格式地址' },
      { name: 'coords', label: '坐标', type: 'object', direction: 'both', description: '{r, c} 坐标' },
    ],
  },
];

export interface NodeRegistry {
  specs: FlowNodeSpec[];
  byId: Map<string, FlowNodeSpec>;
  byCategory: Map<string, FlowNodeSpec[]>;
  loading: boolean;
}

let registryInstance: NodeRegistry | null = null;
let registryPromise: Promise<NodeRegistry> | null = null;

export async function loadNodeRegistry(): Promise<NodeRegistry> {
  if (registryInstance) return registryInstance;
  if (registryPromise) return registryPromise;

  registryPromise = (async () => {
    const [xlsxRoot, excelApiModule] = await Promise.all([
      loadXlsxModule(),
      import('./excel-api-registry'),
      import('./executors'),
    ]);

    const namespaceRoots: Array<{ namespace: string; value: unknown }> = [
      { namespace: 'XLSX', value: xlsxRoot },
      { namespace: 'XLSX.utils', value: xlsxRoot.utils },
      { namespace: 'XLSX.SSF', value: xlsxRoot.SSF },
      { namespace: 'XLSX.CFB', value: xlsxRoot.CFB },
      { namespace: 'XLSX.stream', value: xlsxRoot.stream },
    ];

    const xlsxSpecs = namespaceRoots.flatMap(({ namespace, value }) =>
      collectXlsxMethods(namespace, value),
    );

    const excelApiSpecs = excelApiModule.excelApiNodes.map(excelApiClassToSpec);

    // 动态加载 func-* 和 behavior-* 节点的 schema.json
    const packageNodeSpecs: FlowNodeSpec[] = [];
    const packageDirs = [
      'func-style', 'func-apply-style', 'func-range-select', 'func-modify-range',
      'func-create-table', 'func-sort-table', 'func-filter-table', 'func-data-validation',
      'func-conditional-format', 'func-add-comment', 'func-named-item',
      'func-protect-sheet', 'func-create-chart', 'func-merge-cells',
      'func-find-replace', 'func-remove-duplicates', 'func-protect-workbook',
      'func-sheet-operation', 'func-copy-range', 'func-export-sheet',
      'func-select-input', 'func-radio-input', 'func-checkbox-input',
      'func-date-input', 'func-switch-input', 'func-rating-input',
      'func-form-submit', 'func-form-validate', 'func-row-navigator', 'func-column-bind',
      'behavior-on-form-load', 'behavior-on-field-change', 'behavior-on-submit',
      'behavior-on-validate', 'behavior-on-button-click', 'behavior-on-row-load',
      'behavior-condition', 'behavior-set-value', 'behavior-set-visible',
      'behavior-set-disabled', 'behavior-calculate', 'behavior-show-message',
      'behavior-validate', 'behavior-submit', 'behavior-api-request',
      'behavior-js-script', 'behavior-loop', 'behavior-data-query',
      'behavior-switch-tab', 'behavior-refresh-data', 'behavior-log',
      'behavior-delay', 'behavior-set-required', 'behavior-set-default',
      'behavior-clear-field', 'behavior-stop', 'behavior-filter-data', 'behavior-sort-data',
      'generic-export-excel', 'generic-export-csv', 'generic-export-json', 'generic-export-html',
      'generic-display-table', 'generic-display-stats',
      'generic-merge', 'generic-append', 'generic-group-by', 'generic-pivot', 'generic-unpivot',
      'generic-compare', 'generic-sample',
      'generic-type-cast', 'generic-handle-missing', 'generic-string-manip', 'generic-date-time',
      'generic-regex-extract', 'generic-rename-columns', 'generic-flatten', 'generic-hash', 'generic-encode',
      'generic-validate-json', 'generic-validate-xml', 'generic-validate-csv',
      'generic-unique-check', 'generic-range-check',
      'generic-database-query', 'generic-websocket', 'generic-pdf-report', 'generic-email-send',
      'ml-normalize', 'ml-standardize', 'ml-onehot-encode', 'ml-label-encode', 'ml-pca',
      'ml-feature-select', 'ml-descriptive-stats', 'ml-correlation', 'ml-linear-regression',
      'ml-kmeans', 'ml-knn', 'ml-decision-tree', 'ml-random-forest', 'ml-naive-bayes', 'ml-svm',
      'ml-anomaly-detect', 'ml-hypothesis-test', 'ml-time-series',
    ];

    for (const dir of packageDirs) {
      try {
        const schemaUrl = new URL(`./${dir}/schema.json`, import.meta.url);
        const resp = await fetch(schemaUrl);
        if (resp.ok) {
          const schema = await resp.json();
          packageNodeSpecs.push({
            id: schema.id,
            label: schema.label,
            description: schema.description,
            category: schema.category,
            kind: schema.kind || 'generic',
            properties: schema.properties || [],
            ports: schema.ports || [],
            keywords: schema.keywords || [],
            originalName: schema.originalName,
          });
        }
      } catch {}
    }

    const allSpecs = [...scenarioSpecs, ...genericNodeSpecs, ...packageNodeSpecs, ...xlsxSpecs, ...excelApiSpecs];
    const deduped = allSpecs.filter(
      (spec, i, arr) => arr.findIndex((s) => s.id === spec.id) === i,
    );

    const byId = new Map<string, FlowNodeSpec>();
    const byCategory = new Map<string, FlowNodeSpec[]>();

    for (const spec of deduped) {
      byId.set(spec.id, spec);
      const list = byCategory.get(spec.category) || [];
      list.push(spec);
      byCategory.set(spec.category, list);
    }

    registryInstance = { specs: deduped, byId, byCategory, loading: false };
    return registryInstance;
  })();

  return registryPromise;
}

export function getRegistrySync(): NodeRegistry | null {
  return registryInstance;
}

export function resolveMethod(name: string): ((...args: unknown[]) => unknown) | null {
  if (!xlsxModuleCache) return null;
  const parts = name.replace(/^XLSX\./, '').split('.');
  let current: unknown = xlsxModuleCache;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'function' ? (current as (...args: unknown[]) => unknown) : null;
}
