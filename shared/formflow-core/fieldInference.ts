import { columnDataTypeToControlType } from './columnTypes';

export interface CoreTableConfig {
  keyFields?: string[];
  keyValidation?: { valid: boolean };
}

export interface SrcColumnInfo {
  name: string;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'unknown';
  nullable: boolean;
  uniqueCount: number;
  sampleValues: unknown[];
  visible?: boolean;
  hidden?: boolean;
}

export interface SrcSheetInfo {
  name: string;
  rowCount: number;
  headers: string[];
  columns: SrcColumnInfo[];
  config?: CoreTableConfig;
}

export type GeneratedControlType = 'input' | 'textarea' | 'number' | 'datePicker' | 'switch' | 'select';

export interface InferredFormField {
  name: string;
  label: string;
  controlType: GeneratedControlType;
  required: boolean;
  readonly: boolean;
  isKey: boolean;
  options?: string[];
  defaultValue?: unknown;
  placeholder: string;
  confidence: number;
  reasons: string[];
}

const ID_PATTERN = /(^id$|[_-]id$|编号$|编码$|序号$|单号$|学号$|工号$|主键$)/i;
const LONG_TEXT_PATTERN = /(说明|描述|备注|意见|内容|详情|地址|原因|总结|日志|comment|description|remark|content|address)/i;
const REQUIRED_PATTERN = /(名称|姓名|标题|日期|类型|分类|部门|状态|电话|手机|邮箱|name|title|date|type|status|phone|email)/i;
const TODAY_PATTERN = /(创建日期|登记日期|申请日期|提交日期|日期|date)$/i;
const ENABLED_PATTERN = /(启用|有效|在职|是否|active|enabled|valid)/i;

function distinctValues(column: SrcColumnInfo) {
  return [...new Set((column.sampleValues || [])
    .filter((value) => value !== '' && value != null)
    .map((value) => String(value)))];
}

export function inferLikelyKey(sheet: SrcSheetInfo): string | undefined {
  const configured = sheet.config?.keyFields?.filter((field) => sheet.headers.includes(field)) || [];
  if (configured.length === 1) return configured[0];
  const exact = sheet.columns.find((column) => ID_PATTERN.test(column.name) && column.uniqueCount >= Math.max(1, sheet.rowCount));
  if (exact) return exact.name;
  return sheet.columns.find((column) => !column.nullable && column.uniqueCount >= Math.max(1, sheet.rowCount))?.name;
}

export function inferFormField(column: SrcColumnInfo, sheet: SrcSheetInfo, explicitKey?: string): InferredFormField {
  const keyField = explicitKey || inferLikelyKey(sheet);
  const isKey = column.name === keyField;
  const options = distinctValues(column);
  const reasons: string[] = [];
  let controlType: GeneratedControlType = 'input';
  let confidence = 0.72;

  const dataTypeControl = columnDataTypeToControlType(column.dataType) as GeneratedControlType;
  if (dataTypeControl !== 'input') {
    controlType = dataTypeControl;
    confidence = dataTypeControl === 'select' ? 0.96 : 0.98;
    reasons.push(dataTypeControl === 'switch' ? '数据类型为布尔值' : dataTypeControl === 'select' ? '字段为低基数枚举' : `数据类型为${column.dataType}`);
  } else if (LONG_TEXT_PATTERN.test(column.name) || options.some((value) => value.length > 80)) {
    controlType = 'textarea';
    confidence = 0.86;
    reasons.push('字段名称或样例表示长文本');
  } else if (options.length > 1 && options.length <= 12 && column.uniqueCount <= 20) {
    controlType = 'select';
    confidence = 0.82;
    reasons.push('字段样例为低基数值');
  } else {
    reasons.push('使用通用文本输入');
  }

  if (isKey) reasons.push('识别为唯一键');
  const required = !isKey && (!column.nullable || REQUIRED_PATTERN.test(column.name));
  const readonly = isKey;
  let defaultValue: unknown;
  if (column.dataType === 'boolean' && ENABLED_PATTERN.test(column.name)) defaultValue = true;
  if (column.dataType === 'date' && TODAY_PATTERN.test(column.name)) defaultValue = '@today';

  return {
    name: column.name,
    label: column.name,
    controlType,
    required,
    readonly,
    isKey,
    options: controlType === 'select' ? options : undefined,
    defaultValue,
    placeholder: readonly ? '' : controlType === 'select' || controlType === 'datePicker' ? `请选择${column.name}` : `请输入${column.name}`,
    confidence,
    reasons,
  };
}

export function inferFormFields(sheet: SrcSheetInfo, selectedFields?: string[]) {
  const selected = selectedFields?.length ? new Set(selectedFields) : null;
  const keyField = inferLikelyKey(sheet);
  return sheet.columns
    .filter((column) => !column.hidden && column.visible !== false && (!selected || selected.has(column.name)))
    .map((column) => inferFormField(column, sheet, keyField));
}
