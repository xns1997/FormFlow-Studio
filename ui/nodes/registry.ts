import type { PropertyType, SchemaProperty, SchemaPort } from './excel-api-types';

export type UnifiedNodeKind = 'xlsx-method' | 'scenario' | 'generic' | 'behavior';

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
        { name: 'bookVBA', label: '保留 VBA', type: 'boolean', default: true, description: '读取并保留宏工作簿中的 VBA 数据' },
        { name: 'sheetRows', label: '行数限制', type: 'number', default: 0, description: '读取行数限制' },
      ],
      ports: [
        { name: 'data', label: '数据', type: 'file-data', direction: 'input', required: true, description: '输入文件数据' },
        { name: 'workbook', label: '工作簿', type: 'workbook', direction: 'output', description: '解析后的工作簿' },
      ],
    },
    'write': {
      properties: [
        { name: 'bookType', label: '输出格式', type: 'enum', enum: ['xlsx', 'xlsm', 'xlsb', 'xls', 'csv', 'txt', 'ods', 'numbers'], default: 'xlsx', description: '输出格式' },
        { name: 'type', label: '输出类型', type: 'enum', enum: ['array', 'buffer', 'binary', 'string'], default: 'array', description: '返回数据类型' },
        { name: 'compression', label: '压缩', type: 'boolean', default: false, description: '是否启用 ZIP 压缩' },
      ],
      ports: [
        { name: 'workbook', label: '工作簿', type: 'workbook', direction: 'input', required: true, description: '工作簿对象' },
        { name: 'data', label: '数据', type: 'any', direction: 'output', description: '序列化后的数据' },
      ],
    },
    'writeFile': {
      properties: [
        { name: 'bookType', label: '输出格式', type: 'enum', enum: ['xlsx', 'xlsm', 'xlsb', 'xls', 'csv'], default: 'xlsx', description: '文件格式' },
        { name: 'type', label: '输出类型', type: 'enum', enum: ['array', 'buffer', 'binary'], default: 'array', description: '序列化格式' },
      ],
      ports: [
        { name: 'workbook', label: '工作簿', type: 'workbook', direction: 'input', required: true, description: '工作簿对象' },
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
        { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'input', required: true, description: '工作表对象' },
        { name: 'rows', label: 'JSON 行', type: 'array', direction: 'output', description: 'JSON 行数组' },
        { name: 'headers', label: '表头', type: 'headers', direction: 'output', description: '自动识别的表头' },
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
        { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'output', description: '生成的工作表' },
      ],
    },
    'aoa_to_sheet': {
      properties: [
        { name: 'skipHeader', label: '跳过表头', type: 'boolean', default: false, description: '不输出表头' },
        { name: 'dateNF', label: '日期格式', type: 'string', default: 'yyyy-mm-dd', description: '日期格式' },
      ],
      ports: [
        { name: 'data', label: '二维数组', type: 'array', direction: 'input', required: true, description: '二维数组数据' },
        { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'output', description: '生成的工作表' },
      ],
    },
    'sheet_to_csv': {
      properties: [
        { name: 'FS', label: '字段分隔符', type: 'string', default: ',', description: '字段分隔符' },
        { name: 'dateNF', label: '日期格式', type: 'string', default: 'yyyy-mm-dd', description: '日期格式' },
      ],
      ports: [
        { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'input', required: true, description: '工作表对象' },
        { name: 'csv', label: 'CSV 文本', type: 'string', direction: 'output', description: 'CSV 文本' },
      ],
    },
    'sheet_to_html': {
      properties: [
        { name: 'header', label: '表头行号', type: 'number', default: -1, description: '表头行号' },
      ],
      ports: [
        { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'input', required: true, description: '工作表对象' },
        { name: 'html', label: 'HTML', type: 'string', direction: 'output', description: 'HTML 表格' },
      ],
    },
    'sheet_add_json': {
      properties: [
        { name: 'origin', label: '起始位置', type: 'string', default: -1, description: '-1=末尾，或 A1 地址' },
        { name: 'skipHeader', label: '跳过表头', type: 'boolean', default: false, description: '不输出表头' },
      ],
      ports: [
        { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'input', required: true, description: '工作表对象' },
        { name: 'data', label: 'JSON 数据', type: 'array', direction: 'input', required: true, description: 'JSON 行数组' },
        { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'output', description: '修改后的工作表' },
      ],
    },
    'book_new': {
      properties: [],
      ports: [
        { name: 'workbook', label: '工作簿', type: 'workbook', direction: 'output', description: '新工作簿' },
      ],
    },
    'book_append_sheet': {
      properties: [
        { name: 'sheetName', label: 'Sheet 名', type: 'string', default: '', description: 'Sheet 名称' },
      ],
      ports: [
        { name: 'workbook', label: '工作簿', type: 'workbook', direction: 'input', required: true, description: '工作簿对象' },
        { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'input', required: true, description: '要追加的工作表' },
        { name: 'workbook', label: '工作簿', type: 'workbook', direction: 'output', description: '修改后的工作簿' },
      ],
    },
    'encode_cell': {
      properties: [],
      ports: [
        { name: 'cell', label: '坐标', type: 'object', direction: 'input', required: true, description: '{r, c} 坐标' },
        { name: 'address', label: '地址', type: 'address', direction: 'output', description: 'A1 地址' },
      ],
    },
    'decode_cell': {
      properties: [],
      ports: [
        { name: 'address', label: '地址', type: 'address', direction: 'input', required: true, description: 'A1 地址' },
        { name: 'cell', label: '坐标', type: 'object', direction: 'output', description: '{r, c} 坐标' },
      ],
    },
    'encode_range': {
      properties: [],
      ports: [
        { name: 'range', label: '范围', type: 'object', direction: 'input', required: true, description: '{s:{r,c}, e:{r,c}}' },
        { name: 'address', label: '地址', type: 'address', direction: 'output', description: 'A1 区间' },
      ],
    },
    'decode_range': {
      properties: [],
      ports: [
        { name: 'address', label: '地址', type: 'address', direction: 'input', required: true, description: 'A1 区间' },
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
        { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'input', required: true, description: '工作表对象' },
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
        { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'input', required: true, description: '工作表对象' },
        { name: 'data', label: '数据', type: 'array', direction: 'input', required: true, description: '要追加的数据' },
        { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'output', description: '修改后的工作表' },
      ],
    };
  }

  if (methodName.includes('sheet') && (methodName.includes('insert') || methodName.includes('delete'))) {
    return {
      properties: [
        { name: 'count', label: '数量', type: 'number', default: 1, min: 1, description: '插入/删除的数量' },
      ],
      ports: [
        { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'input', required: true, description: '工作表对象' },
        { name: 'start', label: '起始', type: 'number', direction: 'input', required: true, description: '起始位置' },
        { name: 'count', label: '数量', type: 'number', direction: 'input', description: '操作数量' },
        { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'output', description: '修改后的工作表' },
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

function normalizeSchemaType(type: string): PropertyType {
  const normalized = type.toLowerCase();
  if (normalized === 'json') return 'json';
  if (normalized.includes('arraybuffer') || normalized.includes('uint8array') || normalized.includes('buffer') || normalized.includes('binary')) return 'file-data';
  if (normalized.includes('[]') || normalized.includes('array')) return 'array';
  if (normalized.includes('string')) return 'string';
  if (normalized.includes('number') || normalized.includes('integer')) return 'number';
  if (normalized.includes('boolean')) return 'boolean';
  if (normalized.includes('workbook')) return 'workbook';
  if (normalized.includes('worksheet')) return 'worksheet';
  if (normalized.includes('range')) return 'range';
  if (normalized.includes('cell')) return 'cell';
  return 'object';
}

function createStructureNodeSpec(
  id: 'generic:insert-rows' | 'generic:delete-rows' | 'generic:insert-columns' | 'generic:delete-columns',
  label: string,
  axis: 'row' | 'column',
  action: 'insert' | 'delete',
): FlowNodeSpec {
  const targetLabel = axis === 'row' ? '行' : '列';
  const actionLabel = action === 'insert' ? '插入' : '删除';
  return {
    id,
    label,
    description: `在工作表指定位置${actionLabel}${targetLabel}，保留并移动现有单元格、样式、公式和合并区域`,
    category: '功能 · 表格编辑',
    kind: 'generic',
    properties: [
      { name: 'index', label: `起始${targetLabel}`, type: 'number', default: 1, min: 1, required: true, description: `从 1 开始的${targetLabel}号` },
      { name: 'count', label: `${targetLabel}数`, type: 'number', default: 1, min: 1, required: true, description: `要${actionLabel}的${targetLabel}数` },
    ],
    ports: [
      { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'input', required: true, description: '要编辑的工作表' },
      { name: 'index', label: `起始${targetLabel}`, type: 'number', direction: 'input', defaultValue: 1, description: `覆盖起始${targetLabel}` },
      { name: 'count', label: `${targetLabel}数`, type: 'number', direction: 'input', defaultValue: 1, description: `覆盖${targetLabel}数` },
      { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'output', description: '编辑后的工作表' },
      { name: 'affectedCount', label: '影响数量', type: 'number', direction: 'output', description: `${actionLabel}的${targetLabel}数` },
      { name: 'rowCount', label: '当前行数', type: 'number', direction: 'output', description: '编辑后的行数' },
      { name: 'colCount', label: '当前列数', type: 'number', direction: 'output', description: '编辑后的列数' },
    ],
    keywords: [label, `${actionLabel}${targetLabel}`, `${action} ${axis}`, '表格结构', '数据表处理'],
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
      { name: 'data', label: '文件数据', type: 'file-data', direction: 'output', description: '可直接传给 XLSX.read 的原始文件数据' },
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
      { name: 'workbook', label: '工作簿', type: 'workbook', direction: 'input', required: true, description: '输入工作簿' },
      { name: 'selectMode', label: '模式', type: 'enum', direction: 'input', defaultValue: 'active', enum: ['byName', 'byIndex', 'active', 'first'], description: '选择方式' },
      { name: 'sheetName', label: '表名', type: 'string', direction: 'input', description: '工作表名' },
      { name: 'sheetIndex', label: '索引', type: 'number', direction: 'input', defaultValue: 0, description: '索引' },
      { name: 'workbook', label: '工作簿', type: 'workbook', direction: 'output', description: '透传输入工作簿' },
      { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'output', description: '选中的工作表' },
      { name: 'sheetName', label: '表名', type: 'string', direction: 'output', description: '实际选中的工作表名' },
      { name: 'sheetNames', label: '所有名称', type: 'array', direction: 'output', description: '所有工作表名' },
      { name: 'headers', label: '表头', type: 'headers', direction: 'output', description: '选中工作表的列名' },
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
      { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'input', required: true, description: '输入工作表' },
      { name: 'rangeMode', label: '模式', type: 'enum', direction: 'input', defaultValue: 'usedRange', enum: ['address', 'entireSheet', 'usedRange', 'row', 'column', 'custom'], description: '选择方式' },
      { name: 'address', label: '地址', type: 'address', direction: 'input', description: '支持逗号分隔的 A1 复杂地址' },
      { name: 'rowIndex', label: '起始行', type: 'number', direction: 'input', defaultValue: 1, description: '行号' },
      { name: 'colIndex', label: '起始列', type: 'number', direction: 'input', defaultValue: 1, description: '列号' },
      { name: 'rowCount', label: '行数', type: 'number', direction: 'input', defaultValue: 1, description: '行数' },
      { name: 'colCount', label: '列数', type: 'number', direction: 'input', defaultValue: 1, description: '列数' },
      { name: 'range', label: '复杂区域', type: 'range', direction: 'output', description: '含一个或多个精确子区域的 Range' },
      { name: 'address', label: '地址', type: 'address', direction: 'output', description: '逗号分隔的 A1 复杂地址' },
      { name: 'areas', label: '子区域', type: 'array', direction: 'output', description: '规范化的非重叠子区域' },
      { name: 'values', label: '值', type: 'array', direction: 'output', description: '区域值' },
      { name: 'areaValues', label: '分区值', type: 'array', direction: 'output', description: '按子区域分组的二维数组' },
      { name: 'areaCount', label: '区域数', type: 'number', direction: 'output', description: '子区域数量' },
      { name: 'cellCount', label: '单元格数', type: 'number', direction: 'output', description: '去重后的单元格总数' },
      { name: 'rowCount', label: '行数', type: 'number', direction: 'output', description: '区域行数' },
      { name: 'colCount', label: '列数', type: 'number', direction: 'output', description: '区域列数' },
    ],
  },
  {
    id: 'generic:range-intersection',
    label: '区域交集',
    description: '计算两个普通或复杂 Range 的精确交集，保留所有不连续子区域',
    category: '功能 · 选择节点',
    kind: 'generic',
    properties: [],
    ports: [
      { name: 'left', label: '区域 A', type: 'range', direction: 'input', required: true, description: '第一个普通或复杂 Range' },
      { name: 'right', label: '区域 B', type: 'range', direction: 'input', required: true, description: '第二个普通或复杂 Range' },
      { name: 'range', label: '交集区域', type: 'range', direction: 'output', description: '规范化的复杂 Range，允许为空或包含多个子区域' },
      { name: 'address', label: '交集地址', type: 'address', direction: 'output', description: '逗号分隔的 A1 地址' },
      { name: 'areas', label: '子区域', type: 'array', direction: 'output', description: '交集中的非重叠子区域' },
      { name: 'areaCount', label: '区域数', type: 'number', direction: 'output', description: '交集子区域数量' },
      { name: 'cellCount', label: '单元格数', type: 'number', direction: 'output', description: '交集单元格总数' },
      { name: 'isEmpty', label: '是否为空', type: 'boolean', direction: 'output', description: '两个 Range 是否没有交集' },
    ],
    keywords: ['交集', '相交区域', '重叠单元格', 'intersection', 'intersect', 'overlap', '复杂 range'],
  },
  createStructureNodeSpec('generic:insert-rows', '插入行', 'row', 'insert'),
  createStructureNodeSpec('generic:delete-rows', '删除行', 'row', 'delete'),
  createStructureNodeSpec('generic:insert-columns', '插入列', 'column', 'insert'),
  createStructureNodeSpec('generic:delete-columns', '删除列', 'column', 'delete'),
  {
    id: 'generic:worksheet-commit',
    label: '工作表写回工作簿',
    description: '把修改后的工作表替换或追加到原工作簿，保留其他工作表',
    category: '功能 · 文件输出',
    kind: 'generic',
    properties: [
      { name: 'sheetName', label: '工作表名', type: 'string', default: '', description: '留空时自动识别原工作表名' },
    ],
    ports: [
      { name: 'workbook', label: '原工作簿', type: 'workbook', direction: 'input', required: true, description: '需要写回的原工作簿' },
      { name: 'worksheet', label: '修改后工作表', type: 'worksheet', direction: 'input', required: true, description: '数据处理后的工作表' },
      { name: 'sheetName', label: '工作表名', type: 'string', direction: 'input', description: '覆盖目标工作表名' },
      { name: 'workbook', label: '更新后工作簿', type: 'workbook', direction: 'output', description: '包含修改且保留其他 Sheet 的工作簿' },
      { name: 'worksheet', label: '已写回工作表', type: 'worksheet', direction: 'output', description: '已挂载到工作簿的工作表' },
      { name: 'sheetName', label: '工作表名', type: 'string', direction: 'output', description: '实际写回的工作表名' },
      { name: 'sheetNames', label: '全部工作表', type: 'array', direction: 'output', description: '工作簿中的全部工作表名' },
    ],
    keywords: ['写回工作簿', '替换工作表', '提交修改', 'commit worksheet', '保存 Sheet'],
  },
  {
    id: 'generic:workbook-save',
    label: '保存工作簿文件',
    description: '将包含全部工作表和数据改动的工作簿序列化为可下载文件',
    category: '功能 · 文件输出',
    kind: 'generic',
    properties: [
      { name: 'fileName', label: '文件名', type: 'string', default: 'output', required: true, description: '输出文件名，可不写扩展名' },
      { name: 'bookType', label: '文件格式', type: 'enum', enum: ['xlsx', 'xlsm', 'xlsb', 'xls', 'ods'], default: 'xlsx', description: '工作簿输出格式' },
      { name: 'compression', label: '启用压缩', type: 'boolean', default: true, description: '压缩生成的工作簿文件' },
    ],
    ports: [
      { name: 'workbook', label: '工作簿', type: 'workbook', direction: 'input', required: true, description: '更新后的完整工作簿' },
      { name: 'fileName', label: '文件名', type: 'string', direction: 'input', description: '覆盖输出文件名' },
      { name: 'workbook', label: '工作簿', type: 'workbook', direction: 'output', description: '透传完整工作簿' },
      { name: 'fileData', label: '文件数据', type: 'file-data', direction: 'output', description: '可下载的工作簿二进制数据' },
      { name: 'fileName', label: '文件名', type: 'string', direction: 'output', description: '包含扩展名的文件名' },
      { name: 'mimeType', label: 'MIME 类型', type: 'string', direction: 'output', description: '文件内容类型' },
    ],
    keywords: ['保存 Excel', '写出文件', '下载工作簿', '回写文件', 'save workbook', 'write file'],
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
    id: 'generic:boolean-input',
    label: '布尔输入',
    description: '输入或接收一个布尔值，可作为开关控件的数据源',
    category: '功能 · 输入节点',
    kind: 'generic',
    properties: [
      { name: 'value', label: '布尔值', type: 'boolean', default: false, description: '开关状态' },
    ],
    ports: [
      { name: 'override', label: '覆盖', type: 'boolean', direction: 'input', description: '外部覆盖' },
      { name: 'value', label: '值', type: 'boolean', direction: 'output', description: '当前布尔值' },
    ],
    keywords: ['布尔开关', '开关', 'switch', 'boolean'],
  },
  {
    id: 'generic:export',
    label: '数据导出',
    description: '将 JSON 行、工作表或普通数据导出为 Excel、CSV、JSON 或 HTML',
    category: '功能 · 导出',
    kind: 'generic',
    properties: [
      { name: 'format', label: '格式', type: 'enum', enum: ['xlsx', 'csv', 'json', 'html'], default: 'xlsx', description: '导出格式' },
      { name: 'fileName', label: '文件名', type: 'string', default: 'export', description: '不含扩展名的文件名' },
      { name: 'sheetName', label: '工作表名', type: 'string', default: 'Sheet1', description: 'Excel 工作表名' },
      { name: 'includeHeader', label: '包含表头', type: 'boolean', default: true, description: '是否包含表头' },
    ],
    ports: [
      { name: 'data', label: '数据', type: 'any', direction: 'input', required: true, description: 'JSON 行、工作表或普通数据' },
      { name: 'fileName', label: '文件名', type: 'string', direction: 'input', description: '覆盖文件名' },
      { name: 'result', label: '结果', type: 'any', direction: 'output', description: '文件数据或文本' },
      { name: 'fileName', label: '文件名', type: 'string', direction: 'output', description: '完整文件名' },
      { name: 'mimeType', label: 'MIME 类型', type: 'string', direction: 'output', description: '内容类型' },
    ],
    keywords: ['导出 Excel', '导出 CSV', '导出 JSON', '导出 HTML', '导出工作表', 'export'],
  },
  {
    id: 'generic:filter',
    label: '数据筛选',
    description: '按字段、运算符和值筛选 JSON 行或工作表数据',
    category: '功能 · 数据操作',
    kind: 'generic',
    properties: [
      { name: 'field', label: '字段', type: 'string', default: '', required: true, description: '字段名或列名' },
      { name: 'operator', label: '运算符', type: 'enum', enum: ['==', '!=', 'contains', '>', '<', '>=', '<='], default: '==', description: '比较方式' },
      { name: 'value', label: '筛选值', type: 'any', default: '', description: '用于比较的值' },
    ],
    ports: [
      { name: 'data', label: '数据', type: 'any', direction: 'input', required: true, description: 'JSON 行或工作表' },
      { name: 'trigger', label: '触发', type: 'any', direction: 'input', description: '可选触发信号' },
      { name: 'result', label: '结果', type: 'any', direction: 'output', description: '筛选后的数据' },
      { name: 'rows', label: '数据行', type: 'json-rows', direction: 'output', description: '筛选后的 JSON 行' },
      { name: 'count', label: '数量', type: 'number', direction: 'output', description: '结果行数' },
      { name: 'trigger', label: '触发', type: 'any', direction: 'output', description: '透传触发信号' },
    ],
    keywords: ['筛选', '筛选数据', '表格筛选', 'filter'],
  },
  {
    id: 'generic:sort',
    label: '数据排序',
    description: '按字段和顺序排列 JSON 行或工作表数据',
    category: '功能 · 数据操作',
    kind: 'generic',
    properties: [
      { name: 'field', label: '字段', type: 'string', default: '', required: true, description: '字段名或列名' },
      { name: 'order', label: '顺序', type: 'enum', enum: ['asc', 'desc'], default: 'asc', description: '升序或降序' },
    ],
    ports: [
      { name: 'data', label: '数据', type: 'any', direction: 'input', required: true, description: 'JSON 行或工作表' },
      { name: 'trigger', label: '触发', type: 'any', direction: 'input', description: '可选触发信号' },
      { name: 'result', label: '结果', type: 'any', direction: 'output', description: '排序后的数据' },
      { name: 'rows', label: '数据行', type: 'json-rows', direction: 'output', description: '排序后的 JSON 行' },
      { name: 'count', label: '数量', type: 'number', direction: 'output', description: '结果行数' },
      { name: 'trigger', label: '触发', type: 'any', direction: 'output', description: '透传触发信号' },
    ],
    keywords: ['排序', '排序数据', '表格排序', 'sort'],
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
      { name: 'workbook', label: '工作簿', type: 'workbook', direction: 'output', description: '解析后的工作簿' },
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
      { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'input', required: true, description: '目标工作表' },
      { name: 'rows', label: '行数据', type: 'array', direction: 'input', required: true, description: '要追加的行' },
      { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'output', description: '修改后的工作表' },
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
      { name: 'worksheet', label: '工作表', type: 'worksheet', direction: 'input', required: true, description: '要预览的工作表' },
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
    properties: [
      { name: 'operation', label: '操作', type: 'enum', enum: ['encodeCell', 'decodeCell', 'encodeRange', 'decodeRange', 'encodeRow', 'decodeRow', 'encodeColumn', 'decodeColumn', 'splitCell'], default: 'decodeCell', description: '地址转换方式' },
    ],
    ports: [
      { name: 'value', label: '输入', type: 'any', direction: 'input', required: true, description: '地址、坐标、行号或列号' },
      { name: 'operation', label: '操作', type: 'string', direction: 'input', description: '覆盖转换方式' },
      { name: 'result', label: '结果', type: 'any', direction: 'output', description: '转换结果' },
      { name: 'address', label: '地址', type: 'string', direction: 'output', description: '地址、行号或列号编码结果' },
      { name: 'coords', label: '坐标', type: 'object', direction: 'output', description: '坐标类结果' },
    ],
    keywords: ['地址编码', '地址解码', 'encode', 'decode', 'split_cell'],
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

export const EXPECTED_NODE_COUNT = 133;

export const CURATED_XLSX_METHODS = new Set([
  'XLSX.read',
  'XLSX.utils.json_to_sheet',
  'XLSX.utils.aoa_to_sheet',
  'XLSX.utils.sheet_to_json',
  'XLSX.utils.sheet_add_json',
  'XLSX.utils.sheet_add_aoa',
  'XLSX.utils.sheet_get_cell',
  'XLSX.utils.sheet_to_formulae',
  'XLSX.utils.book_new',
  'XLSX.utils.book_append_sheet',
  'XLSX.utils.sheet_set_array_formula',
  'XLSX.utils.cell_set_hyperlink',
  'XLSX.utils.cell_set_internal_link',
  'XLSX.utils.format_cell',
]);

const DISCOVERY_KEYWORDS: Record<string, string[]> = {
  'generic:file-picker': ['文件上传', '导入 Excel', '打开文件', 'upload', 'browse'],
  'generic:worksheet-select': ['选择工作表', 'Sheet 选择', '标签页', 'worksheet', 'tab'],
  'generic:range-select': ['区域选择', '范围选择', 'A1 地址', 'range', 'area'],
  'generic:range-intersection': ['区域交集', '重叠范围', '复杂区域', 'intersection', 'intersect', 'overlap'],
  'generic:variable-input': ['变量', '参数', '常量', 'variable', 'parameter', 'constant'],
  'generic:text-input': ['文本', '字符串', '输入框', 'text', 'string', 'input'],
  'generic:number-input': ['数字', '数值', '输入框', 'number', 'numeric', 'input'],
  'generic:output-display': ['输出', '显示', '查看结果', '预览', '调试', 'output', 'preview'],
  'scenario:excel-to-json-schema': ['读取 Excel', '导入表格', '生成字段', 'schema', 'import'],
  'scenario:json-to-xlsx-export': ['导出 Excel', 'JSON 导出', 'xlsx', 'export'],
  'scenario:append-rows': ['追加行', '新增明细', 'append', 'rows'],
  'scenario:sheet-preview': ['工作表预览', '多格式', 'JSON CSV HTML', 'preview'],
};

export async function loadNodeRegistry(): Promise<NodeRegistry> {
  if (registryInstance) return registryInstance;
  if (registryPromise) return registryPromise;

  registryPromise = (async () => {
    const [xlsxRoot, , executorRegistry, packageModules, nodePackageApi] = await Promise.all([
      loadXlsxModule(),
      import('./executors'),
      import('./executor-registry'),
      import('./package-modules').catch(() => ({ schemaModules: {}, executorLoaders: {} })),
      import('./node-packages'),
    ]);

    const schemaModules: Record<string, any> = packageModules.schemaModules;

    const namespaceRoots: Array<{ namespace: string; value: unknown }> = [
      { namespace: 'XLSX', value: xlsxRoot },
      { namespace: 'XLSX.utils', value: xlsxRoot.utils },
      { namespace: 'XLSX.SSF', value: xlsxRoot.SSF },
      { namespace: 'XLSX.CFB', value: xlsxRoot.CFB },
      { namespace: 'XLSX.stream', value: xlsxRoot.stream },
    ];

    const generatedXlsxSpecs = namespaceRoots.flatMap(({ namespace, value }) =>
      collectXlsxMethods(namespace, value),
    );
    const xlsxSchemasByMethod = new Map<string, Record<string, any>>();
    for (const schema of Object.values(schemaModules)) {
      if (!schema?.id?.startsWith('xlsx-') || !Array.isArray(schema.methodPath)) continue;
      xlsxSchemasByMethod.set(`XLSX.${schema.methodPath.join('.')}`, schema);
    }
    const xlsxSpecs = generatedXlsxSpecs.filter((spec) => CURATED_XLSX_METHODS.has(spec.id.replace(/^method:/, ''))).map((spec) => {
      const schema = xlsxSchemasByMethod.get(spec.id.replace(/^method:/, ''));
      if (!schema) return spec;
      const declaredPorts: SchemaPort[] = (schema.ports || []).length > 0
        ? schema.ports
        : [
            ...(schema.inputs || []).map((input: any) => ({
              name: input.name, label: input.name, type: normalizeSchemaType(input.type), direction: 'input' as const,
              required: input.required, description: input.description || input.name,
            })),
            ...(schema.outputs || []).map((output: any) => ({
              name: output.name, label: output.name, type: normalizeSchemaType(output.type), direction: 'output' as const,
              description: output.description || output.name,
            })),
          ];
      for (const generatedPort of spec.ports) {
        if (generatedPort.name === '_args' || generatedPort.name === 'result') continue;
        if (!declaredPorts.some((port) => port.name === generatedPort.name && port.direction === generatedPort.direction)) {
          declaredPorts.push(generatedPort);
        }
      }
      return { ...spec, category: '高级 · XLSX', properties: schema.properties || spec.properties, ports: declaredPorts, keywords: schema.keywords || spec.keywords };
    });

    // 节点目录即节点包：无需在注册表中维护第二份目录清单。
    const packageNodeSpecs: FlowNodeSpec[] = [];
    const packages = nodePackageApi.discoverNodePackages(schemaModules, packageModules.executorLoaders);
    for (const pkg of packages) {
      const spec = nodePackageApi.nodePackageToSpec(pkg);
      packageNodeSpecs.push(spec);

      if (pkg.name.startsWith('func-') && pkg.loadExecutor) {
        executorRegistry.registerExecutor(spec.id, async (ctx) => {
          const schema = pkg.schema;
          const inputPorts = (schema.ports || []).filter((port: any) => port.direction === 'input' || port.direction === 'both');
          const args = inputPorts.map((port: any) => ctx.inputs[port.name]);
          const result = await nodePackageApi.executeNodePackage(pkg.loadExecutor!, args, ctx.properties);
          if (result && typeof result === 'object' && !Array.isArray(result)) return result as Record<string, unknown>;
          const output = (schema.ports || []).find((port: any) => port.direction === 'output' || port.direction === 'both');
          return { [output?.name || 'result']: result };
        });
      }
    }

    const allSpecs = [...scenarioSpecs, ...genericNodeSpecs, ...packageNodeSpecs, ...xlsxSpecs].map((spec) => ({
      ...spec,
      keywords: [...new Set([...(spec.keywords || []), ...(DISCOVERY_KEYWORDS[spec.id] || [])])],
    }));
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
