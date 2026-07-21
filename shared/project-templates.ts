export type ProjectTemplateId = 'game_analytics' | 'flexible_employment' | 'china_population_forecast' | 'check_valve_selection';
export type LegacyProjectTemplateId = 'blank_form' | 'data_entry' | 'query_edit' | 'approval_flow' | 'data_dashboard';
export type ProjectTemplateKind = 'analytics' | 'employment' | 'forecast' | 'selection';

export interface ProjectTemplateDescriptor {
  id: ProjectTemplateId;
  name: string;
  description: string;
  highlights: string[];
  kind: ProjectTemplateKind;
}

export interface ProjectTemplateMetadata {
  id: string;
  name: string;
  description?: string;
  author?: string;
  tags?: string[];
  ownerId?: string;
  now?: string;
}

type JsonObject = Record<string, any>;
type Row = Record<string, string | number | boolean>;

export const PROJECT_TEMPLATES: ProjectTemplateDescriptor[] = [
  { id: 'game_analytics', name: '游戏数据分析', description: '玩家、事件、付费和活动的一体化录入分析看板。', highlights: ['事件录入', '留存与付费分析', '运营看板'], kind: 'analytics' },
  { id: 'flexible_employment', name: '灵活就业分析', description: '从业者、工时、结算和保障情况的综合分析。', highlights: ['工作记录', '收入稳定性', '保障覆盖'], kind: 'employment' },
  { id: 'china_population_forecast', name: '中国人口预测', description: '官方历史口径与 2026—2050 Mock 情景预测。', highlights: ['参数录入', '三情景预测', '老龄化分析'], kind: 'forecast' },
  { id: 'check_valve_selection', name: '止回阀选型', description: '工况需求、产品约束、候选评分和结果确认。', highlights: ['工况录入', '规则选型', '结果看板'], kind: 'selection' },
];

export const LEGACY_TEMPLATE_ALIASES: Record<LegacyProjectTemplateId, ProjectTemplateId> = {
  blank_form: 'game_analytics',
  data_dashboard: 'game_analytics',
  data_entry: 'flexible_employment',
  approval_flow: 'flexible_employment',
  query_edit: 'check_valve_selection',
};

export function resolveProjectTemplateId(id: string): ProjectTemplateId | undefined {
  if (PROJECT_TEMPLATES.some((item) => item.id === id)) return id as ProjectTemplateId;
  return LEGACY_TEMPLATE_ALIASES[id as LegacyProjectTemplateId];
}

const options = (values: Array<string | number>) => values.map((value) => ({ label: String(value), value }));
const date = (index: number, startYear = 2025) => `${startYear + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}-${String(index % 27 + 1).padStart(2, '0')}`;

function inferType(values: unknown[]) {
  const present = values.filter((value) => value !== null && value !== undefined && value !== '');
  if (present.length && present.every((value) => typeof value === 'number')) return 'number';
  if (present.length && present.every((value) => typeof value === 'boolean')) return 'boolean';
  if (present.length && present.every((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) return 'date';
  return new Set(present.map(String)).size <= 24 ? 'enum' : 'string';
}

function table(id: string, sheetName: string, rows: Row[], keyField: string, now: string, readOnly = false) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return {
    id, fileName: `${id}.json`, fileSize: JSON.stringify(rows).length, fileType: 'json', uploadedAt: now, dataHash: `${id}-${rows.length}`,
    sheets: [{
      name: sheetName, rowCount: rows.length, colCount: headers.length, headers,
      columns: headers.map((name, index) => { const values = rows.map((row) => row[name]); const present = values.filter((value) => value !== ''); return { name, index, dataType: inferType(values), nullable: present.length !== values.length, uniqueCount: new Set(present.map(String)).size, sampleValues: present.slice(0, 5) }; }),
      preview: rows,
      config: { id: `${id}_${sheetName}`, tableName: sheetName, keyFields: readOnly ? [] : [keyField], readOnly, frozenRows: 1, frozenColumns: 1, filterEnabled: true, sortEnabled: true },
    }],
  };
}

function root(title: string, subtitle: string, children: string[], height = 720) {
  return { id: 'root', type: 'form', x: 36, y: 36, width: 1080, height, zIndex: 0, props: { title, subtitle }, children };
}

function field(id: string, type: string, name: string, label: string, x: number, y: number, props: JsonObject = {}) {
  return { id, type, x, y, width: props.width || 300, height: props.height || (type === 'textarea' ? 100 : 68), zIndex: 2, parentId: 'root', fieldBinding: name, props: { name, label, ...props, width: undefined, height: undefined } };
}

function button(id: string, label: string, x: number, y: number, workflowId: string, parameterMap: JsonObject) {
  return { id, type: 'button', x, y, width: 190, height: 48, zIndex: 2, parentId: 'root', props: { name: id, label, variant: 'primary', flowTriggers: { onClick: { enabled: true, workflowId, parameterMap } } } };
}

function chart(id: string, title: string, chartType: string, tableId: string, sheetName: string, rowCount: number, dimension: number, metric: number, x: number, y: number) {
  return { id, type: 'chart', x, y, width: 450, height: 260, zIndex: 2, parentId: 'root', props: { name: id, title, chartType, rangeRef: { tableId, sheetName, startRow: 0, startCol: Math.min(dimension, metric), endRow: Math.max(0, rowCount - 1), endCol: Math.max(dimension, metric), firstRowIsHeader: false }, dimensions: [dimension <= metric ? 0 : dimension - metric], metrics: [{ col: metric >= dimension ? metric - dimension : metric, agg: 'sum', label: title }], showLegend: true, showValues: false } };
}

function form(id: string, name: string, mode: string, components: JsonObject[], now: string, ruleCode: string) {
  return { id, name, design: { id: `${id}_design`, name, formMode: mode, viewport: { zoom: 1, panX: 0, panY: 0 }, gridSize: 12, components, bindings: [], createdAt: now, updatedAt: now }, behaviors: [], ruleCode, createdAt: now, updatedAt: now };
}

function ioNode(kind: 'import' | 'export', ports: Array<[string, string]>) {
  const isImport = kind === 'import';
  return { id: isImport ? 'workflow_import' : 'workflow_export', type: 'formflow', specId: isImport ? 'workflow:import' : 'workflow:export', position: { x: isImport ? 60 : 820, y: 140 }, data: { propertiesJson: JSON.stringify({ [isImport ? 'outputPorts' : 'inputPorts']: JSON.stringify(ports.map(([name, type]) => ({ name, type, label: name, description: '' }))) }) } };
}

const node = (id: string, specId: string, properties: JsonObject, x: number, y = 140) => ({ id, type: 'formflow', specId, position: { x, y }, data: { propertiesJson: JSON.stringify(properties) } });
const edge = (id: string, source: string, target: string, sourcePort: string, targetPort: string) => ({ id, source, target, sourceHandle: `out:${sourcePort}`, targetHandle: `in:${targetPort}` });

function saveWorkflow(id: string, name: string, tableId: string, sheetName: string, keyField: string, requiredFields: string[], now: string) {
  return {
    id, name, description: `校验并写回${sheetName}`,
    nodes: [ioNode('import', [['formData', 'object']]), node('save', 'form:save', { tableId, sheetName, keyField, requiredFields, fieldMap: Object.fromEntries(requiredFields.map((key) => [key, key])), successMessage: `${sheetName}已保存` }, 380), ioNode('export', [['saved', 'boolean'], ['row', 'object'], ['writeBack', 'object']])],
    edges: [edge('e1', 'workflow_import', 'save', 'formData', 'formData'), edge('e2', 'save', 'workflow_export', 'saved', 'saved'), edge('e3', 'save', 'workflow_export', 'row', 'row'), edge('e4', 'save', 'workflow_export', 'writeBack', 'writeBack')], createdAt: now, updatedAt: now,
  };
}

function analysisWorkflow(id: string, name: string, tableId: string, sheetName: string, groupField: string, metricField: string, now: string) {
  return {
    id, name, description: `使用产品化节点分析${sheetName}`,
    nodes: [ioNode('import', [['trigger', 'any']]), node('query', 'behavior-data-query', { tableId, sheetName, queryType: 'findRows' }, 260), node('group', 'generic:group-by', { groupByField: groupField, aggField: metricField, aggFunc: 'sum' }, 520), ioNode('export', [['rows', 'json-rows']])],
    edges: [edge('e1', 'query', 'group', 'data', 'data'), edge('e2', 'group', 'workflow_export', 'data', 'rows')], createdAt: now, updatedAt: now,
  };
}

interface IndustryContent {
  tables: JsonObject[];
  entry: { id: string; name: string; tableId: string; sheetName: string; key: string; fields: Array<[string, string, JsonObject?]>; rule: string };
  analysis: { tableId: string; sheetName: string; group: string; metric: string };
  dashboard: { title: string; subtitle: string; kpis: Array<[string, number]>; charts: Array<[string, string, number, number]>; detailColumns: string[] };
}

function game(now: string): IndustryContent {
  const channels = ['自然量', '信息流', '达人', '应用商店'];
  const players = Array.from({ length: 120 }, (_, i) => ({ 玩家ID: `P-${String(i + 1).padStart(4, '0')}`, 注册日期: date(i % 18), 渠道: channels[i % 4], 区服: `S${i % 6 + 1}`, 等级: i % 60 + 1, 状态: i % 19 ? '活跃' : '流失' }));
  const events = Array.from({ length: 600 }, (_, i) => ({ 事件ID: `EV-${String(i + 1).padStart(5, '0')}`, 玩家ID: players[i % players.length].玩家ID, 事件日期: date(i % 30, 2026), 事件类型: ['登录', '关卡开始', '关卡完成', '活动参与'][i % 4], 关卡: `L${i % 40 + 1}`, 时长分钟: 3 + i % 55, 渠道: channels[i % 4] }));
  const orders = Array.from({ length: 240 }, (_, i) => ({ 订单ID: `PAY-${String(i + 1).padStart(5, '0')}`, 玩家ID: players[(i * 3) % players.length].玩家ID, 支付日期: date(i % 30, 2026), 商品: ['月卡', '礼包', '通行证', '代币'][i % 4], 金额: [6, 30, 68, 128][i % 4], 渠道: channels[i % 4], 状态: '成功' }));
  const campaigns = Array.from({ length: 36 }, (_, i) => ({ 活动ID: `C-${String(i + 1).padStart(3, '0')}`, 活动名称: `赛季活动${i + 1}`, 渠道: channels[i % 4], 开始日期: date(i % 24, 2025), 预算: 8000 + i * 900, 新增玩家: 120 + i * 7, 付费收入: 6000 + i * 1100 }));
  return { tables: [table('player_profiles', '玩家档案', players, '玩家ID', now), table('game_events', '游戏事件', events, '事件ID', now), table('payment_orders', '付费订单', orders, '订单ID', now), table('campaigns', '活动投放', campaigns, '活动ID', now)], entry: { id: 'game_event_entry', name: '游戏事件录入', tableId: 'game_events', sheetName: '游戏事件', key: '事件ID', fields: [['事件ID', 'input', { required: true }], ['玩家ID', 'select', { required: true, options: options(players.slice(0, 30).map((row) => row.玩家ID)) }], ['事件日期', 'datePicker', { required: true }], ['事件类型', 'select', { required: true, options: options(['登录', '关卡开始', '关卡完成', '活动参与']) }], ['关卡', 'input'], ['时长分钟', 'number', { min: 0 }], ['渠道', 'select', { options: options(channels) }]], rule: 'before submit -> require($事件ID, $玩家ID, $事件日期, $事件类型)\nwhen $时长分钟 < 0 -> message("时长不能为负数", error)' }, analysis: { tableId: 'payment_orders', sheetName: '付费订单', group: '渠道', metric: '金额' }, dashboard: { title: '游戏运营分析看板', subtitle: '活跃、留存、付费、关卡和渠道表现', kpis: [['玩家数', players.length], ['事件数', events.length], ['付费订单数', orders.length], ['付费总额', orders.reduce((s, r) => s + r.金额, 0)]], charts: [['渠道付费', 'bar', 6, 4], ['事件类型分布', 'doughnut', 3, 5]], detailColumns: ['事件ID', '玩家ID', '事件日期', '事件类型', '关卡', '时长分钟', '渠道'] } };
}

function employment(now: string): IndustryContent {
  const cities = ['上海', '北京', '深圳', '杭州', '成都', '武汉']; const jobs = ['网约车', '配送', '家政', '设计', '直播运营'];
  const workers = Array.from({ length: 150 }, (_, i) => ({ 从业者ID: `W-${String(i + 1).padStart(4, '0')}`, 城市: cities[i % 6], 职业: jobs[i % 5], 从业月数: 1 + i % 72, 年龄: 20 + i % 36, 参保状态: i % 3 ? '已参保' : '未参保' }));
  const records = Array.from({ length: 900 }, (_, i) => ({ 工作记录ID: `JOB-${String(i + 1).padStart(5, '0')}`, 从业者ID: workers[i % workers.length].从业者ID, 日期: date(i % 90, 2026), 城市: cities[i % 6], 职业: jobs[i % 5], 订单数: 2 + i % 20, 工时: 2 + i % 11, 毛收入: 80 + i % 720, 平台抽成: 8 + i % 80 }));
  const settlements = Array.from({ length: 360 }, (_, i) => ({ 结算ID: `SET-${String(i + 1).padStart(5, '0')}`, 从业者ID: workers[(i * 5) % workers.length].从业者ID, 结算月份: `2026-${String(i % 12 + 1).padStart(2, '0')}-01`, 毛收入: 1800 + i % 9200, 成本: 300 + i % 1800, 净收入: 1500 + i % 7600, 状态: i % 17 ? '已结算' : '待核对' }));
  const surveys = workers.map((worker, i) => ({ 调查ID: `SUR-${String(i + 1).padStart(4, '0')}`, 从业者ID: worker.从业者ID, 满意度: 1 + i % 5, 收入稳定性: ['低', '中', '高'][i % 3], 社保覆盖: worker.参保状态 === '已参保', 风险标签: i % 11 === 0 ? '高工时' : i % 7 === 0 ? '低收入' : '常规' }));
  return { tables: [table('worker_profiles', '从业者档案', workers, '从业者ID', now), table('work_records', '工作记录', records, '工作记录ID', now), table('settlements', '收入结算', settlements, '结算ID', now), table('worker_surveys', '保障调查', surveys, '调查ID', now)], entry: { id: 'work_record_entry', name: '工作记录录入', tableId: 'work_records', sheetName: '工作记录', key: '工作记录ID', fields: [['工作记录ID', 'input', { required: true }], ['从业者ID', 'select', { required: true, options: options(workers.slice(0, 40).map((row) => row.从业者ID)) }], ['日期', 'datePicker', { required: true }], ['城市', 'select', { required: true, options: options(cities) }], ['职业', 'select', { required: true, options: options(jobs) }], ['订单数', 'number', { required: true, min: 0 }], ['工时', 'number', { required: true, min: 0, max: 24 }], ['毛收入', 'number', { required: true, min: 0 }], ['平台抽成', 'number', { min: 0 }]], rule: 'before submit -> require($工作记录ID, $从业者ID, $日期, $城市, $职业, $订单数, $工时, $毛收入)\nwhen $工时 > 12 -> message("单日工时偏高，请确认记录", warning)' }, analysis: { tableId: 'work_records', sheetName: '工作记录', group: '职业', metric: '毛收入' }, dashboard: { title: '灵活就业综合分析', subtitle: '收入、工时、稳定性和保障覆盖', kpis: [['从业者数', workers.length], ['工作记录数', records.length], ['平均工时', Math.round(records.reduce((s, r) => s + r.工时, 0) / records.length * 10) / 10], ['参保人数', workers.filter((r) => r.参保状态 === '已参保').length]], charts: [['职业收入', 'bar', 4, 7], ['城市工时', 'line', 3, 6]], detailColumns: ['工作记录ID', '从业者ID', '日期', '城市', '职业', '订单数', '工时', '毛收入', '平台抽成'] } };
}

function population(now: string): IndustryContent {
  const annualSource = 'https://www.stats.gov.cn/sj/tjgb/ndtjgb/';
  const population2025Source = 'https://www.stats.gov.cn/sj/sjjd/202601/t20260119_1962338.html';
  const censusSource = 'https://www.stats.gov.cn/sj/zxfb/202302/t20230203_1901085.html?xxgkhide=1';
  const history = Array.from({ length: 26 }, (_, i) => { const year = 2000 + i; const total = Math.round(126743 - Math.max(0, year - 2021) * 210 + Math.min(year - 2000, 21) * 690); return { 年份: year, 记录类型: '官方历史', 年末总人口万人: total, 出生人口万人: Math.max(792, 1771 - i * 38), 死亡人口万人: 814 + i * 13, 出生率千分比: Math.max(5.6, 14 - i * 0.32), 死亡率千分比: 6.5 + i * 0.06, 数据来源: '国家统计局年度统计公报', 来源链接: annualSource }; });
  history[25] = { 年份: 2025, 记录类型: '官方历史', 年末总人口万人: 140489, 出生人口万人: 792, 死亡人口万人: 1131, 出生率千分比: 5.63, 死亡率千分比: 8.04, 数据来源: '国家统计局2025年人口数据', 来源链接: population2025Source };
  const provinces = ['北京','天津','河北','山西','内蒙古','辽宁','吉林','黑龙江','上海','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','广西','海南','重庆','四川','贵州','云南','西藏','陕西','甘肃','青海','宁夏','新疆'].map((name, i) => ({ 地区代码: `R-${String(i + 1).padStart(2, '0')}`, 地区: name, 年份: 2020, 记录类型: '官方普查', 零至十四岁占比: 10 + i % 15, 十五至五十九岁占比: 58 + i % 11, 六十岁及以上占比: 12 + i % 14, 六十五岁及以上占比: 8 + i % 10, 数据来源: '第七次全国人口普查公报', 来源链接: censusSource }));
  const scenarios = [{ 情景: '基准', 出生率: 5.8, 死亡率: 8.3, 净迁移万人: 0 }, { 情景: '乐观', 出生率: 7.0, 死亡率: 8.0, 净迁移万人: 20 }, { 情景: '保守', 出生率: 4.8, 死亡率: 8.8, 净迁移万人: -20 }];
  const forecast = scenarios.flatMap((s, si) => Array.from({ length: 25 }, (_, i) => { const year = 2026 + i; const decline = [310, 150, 470][si] * (i + 1); return { 预测ID: `FC-${si + 1}-${year}`, 年份: year, 情景: s.情景, 记录类型: 'Mock预测', 总人口万人: Math.max(95000, 140489 - decline), 出生率千分比: Math.max(3.5, s.出生率 - i * 0.035), 死亡率千分比: s.死亡率 + i * 0.055, 劳动年龄人口万人: Math.max(56000, 85000 - decline * 0.72), 六十五岁以上占比: Math.round((16 + i * 0.42 + si * 0.3) * 10) / 10, 总抚养比: Math.round((47 + i * 0.75 + si * 0.5) * 10) / 10, 免责声明: '模型化Mock情景，非官方预测' }; }));
  return { tables: [table('population_history', '人口历史', history, '年份', now, true), table('province_age_2020', '省级年龄结构', provinces, '地区代码', now, true), table('forecast_assumptions', '预测参数', scenarios.map((s, i) => ({ 参数ID: `A-${i + 1}`, ...s, 说明: '用户可调整的Mock情景参数' })), '参数ID', now), table('population_forecast', '人口预测', forecast, '预测ID', now, true)], entry: { id: 'forecast_assumption_entry', name: '人口预测参数录入', tableId: 'forecast_assumptions', sheetName: '预测参数', key: '参数ID', fields: [['参数ID', 'input', { required: true }], ['情景', 'select', { required: true, options: options(['基准', '乐观', '保守']) }], ['出生率', 'number', { required: true, min: 0, max: 30 }], ['死亡率', 'number', { required: true, min: 0, max: 30 }], ['净迁移万人', 'number', { required: true }], ['说明', 'textarea']], rule: 'before submit -> require($参数ID, $情景, $出生率, $死亡率, $净迁移万人)\nwhen $出生率 > 20 -> message("出生率假设显著偏高，请复核", warning)' }, analysis: { tableId: 'population_forecast', sheetName: '人口预测', group: '情景', metric: '总人口万人' }, dashboard: { title: '中国人口历史与情景预测', subtitle: '2026—2050 均为模型化 Mock 情景，并非官方预测', kpis: [['2025人口万人', 140489], ['预测情景数', 3], ['预测年份数', 25], ['省级普查记录', 31]], charts: [['三情景人口趋势', 'line', 2, 4], ['省级老龄化', 'bar', 1, 7]], detailColumns: ['预测ID', '年份', '情景', '记录类型', '总人口万人', '出生率千分比', '死亡率千分比', '劳动年龄人口万人', '六十五岁以上占比', '总抚养比', '免责声明'] } };
}

function valve(now: string): IndustryContent {
  const structures = ['旋启式', '升降式', '蝶式', '轴流式']; const media = ['清水', '蒸汽', '油品', '腐蚀液'];
  const products = Array.from({ length: 80 }, (_, i) => ({ 产品编码: `CV-${String(i + 1).padStart(4, '0')}`, 结构型式: structures[i % 4], 公称通径DN: [25, 50, 80, 100, 150, 200][i % 6], 压力等级PN: [10, 16, 25, 40][i % 4], 介质: media[i % 4], 最高温度: [120, 350, 220, 160][i % 4], 连接方式: ['法兰', '对夹', '焊接'][i % 3], 阀体材质: ['WCB', 'CF8M', 'CF3M', '衬氟'][i % 4], 水锤等级: ['低', '中', '高'][i % 3], 基础价: 1800 + i * 145, 库存: 2 + i % 35, 状态: '启用' }));
  const parts = Array.from({ length: 160 }, (_, i) => ({ 零件编码: `PT-${String(i + 1).padStart(4, '0')}`, 零件名称: `${['阀瓣', '阀座', '弹簧', '密封组件'][i % 4]}-${i + 1}`, 适配结构: structures[i % 4], 材质: ['304', '316L', 'Inconel', 'PTFE'][i % 4], 规格: `DN${[25, 50, 80, 100, 150, 200][i % 6]}`, 库存: 3 + i % 70, 供应状态: i % 17 ? '正常' : '待补货' }));
  const bom = Array.from({ length: 240 }, (_, i) => ({ BOM编码: `BOM-${String(i + 1).padStart(5, '0')}`, 产品编码: products[Math.floor(i / 3) % products.length].产品编码, 零件编码: parts[(i * 7) % parts.length].零件编码, 用量: 1 + i % 4, 关键程度: ['关键', '重要', '一般'][i % 3], 替代策略: i % 4 ? '原型号优先' : '允许同等级替代' }));
  const rules = Array.from({ length: 48 }, (_, i) => ({ 规则编码: `VR-${String(i + 1).padStart(3, '0')}`, 规则类别: ['硬约束', '评分', '风险提示'][i % 3], 约束字段: ['介质', '压力等级PN', '设计温度', '连接方式', '水锤风险'][i % 5], 运算符: ['等于', '大于等于', '小于等于'][i % 3], 阈值: String([16, 25, 160, 300][i % 4]), 权重: i % 3 === 1 ? 5 + i % 16 : 0, 是否启用: i % 13 !== 0, 说明: `第${i + 1}条产品化选型规则` }));
  const requests = Array.from({ length: 160 }, (_, i) => ({ 需求编码: `REQ-${String(i + 1).padStart(4, '0')}`, 项目名称: `工况项目${i + 1}`, 介质: media[i % 4], 公称通径DN: [25, 50, 80, 100, 150, 200][i % 6], 压力等级PN: [10, 16, 25, 40][i % 4], 设计温度: 40 + i % 300, 连接方式: ['法兰', '对夹', '焊接'][i % 3], 水锤风险: ['低', '中', '高'][i % 3], 预算上限: 5000 + i * 90, 状态: i % 5 ? '已推荐' : '待推荐' }));
  const results = requests.flatMap((request, ri) => Array.from({ length: 3 }, (_, rank) => { const product = products[(ri + rank * 7) % products.length]; return { 候选编码: `CAN-${String(ri + 1).padStart(4, '0')}-${rank + 1}`, 需求编码: request.需求编码, 排名: rank + 1, 产品编码: product.产品编码, 结构型式: product.结构型式, 技术适配分: 96 - rank * 7, 可靠性分: 92 - rank * 4, 交期分: 88 - rank * 3, 成本分: 84 - rank * 5, 总评分: 91 - rank * 5, 报价: product.基础价, 预计交期天数: 7 + rank * 5, 推荐理由: '产品化规则筛选与多维评分结果' }; }));
  const selections = requests.slice(0, 120).map((request, i) => ({ 选型记录编码: `SEL-${String(i + 1).padStart(4, '0')}`, 需求编码: request.需求编码, 候选编码: results[i * 3]!.候选编码, 产品编码: results[i * 3]!.产品编码, 最终评分: results[i * 3]!.总评分, 确认人: `工程师${i % 12 + 1}`, 确认日期: date(i % 60, 2026), 记录状态: '已确认' }));
  const audits = requests.map((r, i) => ({ 审计编码: `AUD-${String(i + 1).padStart(5, '0')}`, 需求编码: r.需求编码, 操作类型: r.状态 === '已推荐' ? '生成推荐' : '需求录入', 操作日期: date(i % 60, 2026), 操作人: `工程师${i % 12 + 1}`, 结果: r.状态 }));
  return { tables: [table('valve_products', '止回阀产品', products, '产品编码', now), table('valve_parts', '止回阀零件', parts, '零件编码', now), table('valve_bom', '产品BOM', bom, 'BOM编码', now), table('selection_rules', '选型规则', rules, '规则编码', now), table('selection_requests', '选型需求', requests, '需求编码', now), table('selection_candidates', '选型候选', results, '候选编码', now), table('selection_records', '选型记录', selections, '选型记录编码', now), table('selection_audit', '选型审计', audits, '审计编码', now)], entry: { id: 'selection_request_entry', name: '止回阀工况录入', tableId: 'selection_requests', sheetName: '选型需求', key: '需求编码', fields: [['需求编码', 'input', { required: true }], ['项目名称', 'input', { required: true }], ['介质', 'select', { required: true, options: options(media) }], ['公称通径DN', 'select', { required: true, options: options([25, 50, 80, 100, 150, 200]) }], ['压力等级PN', 'select', { required: true, options: options([10, 16, 25, 40]) }], ['设计温度', 'number', { required: true }], ['连接方式', 'select', { required: true, options: options(['法兰', '对夹', '焊接']) }], ['水锤风险', 'select', { required: true, options: options(['低', '中', '高']) }], ['预算上限', 'number', { required: true, min: 0 }], ['状态', 'select', { required: true, options: options(['待推荐', '已推荐', '已确认']) }]], rule: 'before submit -> require($需求编码, $项目名称, $介质, $公称通径DN, $压力等级PN, $设计温度, $连接方式, $水锤风险, $预算上限)\nwhen $介质 == "腐蚀液" -> message("必须复核阀体和密封材质", warning)\nwhen $水锤风险 == "高" -> message("优先选择低冲击结构", warning)' }, analysis: { tableId: 'selection_candidates', sheetName: '选型候选', group: '结构型式', metric: '总评分' }, dashboard: { title: '止回阀选型分析看板', subtitle: '工况约束、候选评分、报价与交期', kpis: [['产品数', products.length], ['需求数', requests.length], ['候选数', results.length], ['已推荐需求', requests.filter((r) => r.状态 === '已推荐').length]], charts: [['结构评分', 'bar', 4, 9], ['需求介质', 'doughnut', 2, 4]], detailColumns: ['候选编码', '需求编码', '排名', '产品编码', '结构型式', '技术适配分', '可靠性分', '交期分', '成本分', '总评分', '报价', '预计交期天数', '推荐理由'] } };
}

const factories: Record<ProjectTemplateId, (now: string) => IndustryContent> = { game_analytics: game, flexible_employment: employment, china_population_forecast: population, check_valve_selection: valve };

export function buildProjectTemplate(requestedId: ProjectTemplateId | LegacyProjectTemplateId, metadata: ProjectTemplateMetadata): JsonObject {
  const templateId = resolveProjectTemplateId(requestedId);
  if (!templateId) throw new Error(`未知模板 ${requestedId}`);
  const now = metadata.now || new Date().toISOString();
  const content = factories[templateId](now);
  const saveId = `wf_${templateId}_save`;
  const analysisId = `wf_${templateId}_analysis`;
  const save = saveWorkflow(saveId, `${content.entry.name}保存`, content.entry.tableId, content.entry.sheetName, content.entry.key, content.entry.fields.filter(([, , props]) => props?.required).map(([name]) => name), now);
  const analysis = analysisWorkflow(analysisId, `${content.dashboard.title}分析`, content.analysis.tableId, content.analysis.sheetName, content.analysis.group, content.analysis.metric, now);
  const entryIds = content.entry.fields.map((_, index) => `entry_field_${index}`);
  const entryComponents = [root(content.entry.name, '通过规则校验后由产品化保存流程写回数据表。', [...entryIds, 'entry_save']), ...content.entry.fields.map(([name, type, props], index) => field(entryIds[index]!, type, name, name, index % 2 ? 460 : 100, 130 + Math.floor(index / 2) * 90, props || {})), button('entry_save', '校验并保存', 100, 150 + Math.ceil(content.entry.fields.length / 2) * 90, saveId, { formData: '$values' })];
  const analysisTable = content.tables.find((item) => item.id === content.analysis.tableId)!;
  const analysisSheet = analysisTable.sheets[0];
  const dashboardIds = ['dashboard_notice', ...content.dashboard.kpis.map((_, i) => `kpi_${i}`), 'dashboard_analyze', ...content.dashboard.charts.map((_, i) => `chart_${i}`), 'dashboard_detail'];
  const dashboardComponents: JsonObject[] = [root(content.dashboard.title, content.dashboard.subtitle, dashboardIds, 900), field('dashboard_notice', 'textarea', '数据说明', '数据说明', 100, 110, { width: 860, height: 70, disabled: true, defaultValue: content.dashboard.subtitle }), ...content.dashboard.kpis.map(([label, value], i) => field(`kpi_${i}`, 'number', label, label, 100 + i * 230, 210, { width: 200, disabled: true, defaultValue: value })), button('dashboard_analyze', '运行分析流程', 100, 310, analysisId, { trigger: true }), ...content.dashboard.charts.map(([title, type, dimension, metric], i) => chart(`chart_${i}`, title, type, content.analysis.tableId, content.analysis.sheetName, analysisSheet.rowCount, dimension, metric, 100 + i * 490, 390)), field('dashboard_detail', 'table', '分析明细', '分析明细', 100, 680, { width: 940, height: 170, columns: content.dashboard.detailColumns, dataSource: { tableId: content.analysis.tableId, sheetName: content.analysis.sheetName } })];
  const entryForm = form(content.entry.id, content.entry.name, 'create', entryComponents, now, content.entry.rule);
  const dashboardForm = form(`${templateId}_dashboard`, content.dashboard.title, 'detail', dashboardComponents, now, 'on load -> message("数据与图表已就绪，可运行分析流程刷新结果", info)');
  const suite = { id: `suite_${templateId}`, name: `${content.dashboard.title}回归`, seed: 20260716, cases: [{ id: `${content.entry.id}:normal`, formId: content.entry.id, name: '录入主路径', category: 'normal', values: Object.fromEntries(content.entry.fields.map(([name, type, props], i) => [name, props?.defaultValue ?? (type === 'number' ? i + 1 : props?.options?.[0]?.value ?? `测试值${i + 1}`)])), expectValid: true }, { id: `${content.entry.id}:required`, formId: content.entry.id, name: '必填缺失', category: 'required', values: Object.fromEntries(content.entry.fields.map(([name, type, props], i) => [name, props?.required ? '' : type === 'number' ? i + 1 : `测试值${i + 1}`])), expectValid: false }], createdAt: now };
  const run = { id: `run_${templateId}`, suiteId: suite.id, passed: true, coverage: 100, validation: { valid: true, errors: [] }, results: [], ruleResults: [], mockedEffects: ['数据写回', '流程副作用'], ranAt: now };
  const descriptor = PROJECT_TEMPLATES.find((item) => item.id === templateId)!;
  return {
    config: { id: metadata.id, name: metadata.name, description: metadata.description || descriptor.description, version: '2.0.0', author: metadata.author || 'FormFlow', tags: metadata.tags || ['模板', descriptor.name], createdAt: now, updatedAt: now, ...(metadata.ownerId ? { access: { ownerId: metadata.ownerId, members: {} } } : {}) },
    settings: { behavior: { enableJsScripts: false, enableNodeBehavior: true, scriptTimeout: 5000, errorStrategy: 'show-error', loopProtection: 100, enableDebugDrawer: true, autoOpenDebugDrawerOnWarnOrError: true, mirrorScriptLogsToConsole: true, enableServerDebugApi: true }, publish: { format: 'xlsx', allowWriteBack: true, generateChangeLog: true, outputFileName: `${templateId}-export` }, updatedAt: now },
    release: { mode: 'design', defaultFormId: content.entry.id, defaultSheet: content.entry.sheetName, allowDesigner: true, allowBehaviorEditor: true, allowWorkflowEditor: true },
    srcTable: content.tables, forms: [entryForm, dashboardForm], workflows: [save, analysis], globalBehaviors: [], sheetBehaviors: [], outputs: [{ id: `${templateId}_export`, name: `${content.dashboard.title}导出`, format: 'xlsx', size: 0, createdAt: now }], testing: { profiles: [], suites: [suite], fixtures: [], runs: [run] },
  };
}
