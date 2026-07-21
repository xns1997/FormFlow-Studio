import type { SrcColumnInfo } from '../../project/types';

export const FIELD_DROP_COMMITTED_EVENT = 'formflow:field-drop-committed';

export interface DataFieldDragItem {
  tableId: string;
  tableName: string;
  sheetName: string;
  column: Pick<SrcColumnInfo, 'name' | 'dataType' | 'nullable' | 'sampleValues' | 'uniqueCount'>;
}

export interface ControlRecommendation {
  type: string;
  label: string;
  reason: string;
}

const LONG_TEXT = /(说明|描述|备注|意见|内容|详情|地址|原因|comment|description|remark|content|address)/i;

const LABELS: Record<string, string> = {
  input: '文本输入', textarea: '多行文本', number: '数字输入', datePicker: '日期选择',
  switch: '开关', select: '下拉选择', radio: '单选', checkbox: '多选', tagInput: '标签输入',
};

function option(type: string, reason: string): ControlRecommendation {
  return { type, label: LABELS[type] || type, reason };
}

export function recommendControls(column: DataFieldDragItem['column']): ControlRecommendation[] {
  const samples = [...new Set((column.sampleValues || []).filter((value) => value != null && value !== '').map(String))];
  let candidates: ControlRecommendation[];
  if (column.dataType === 'number') candidates = [option('number', '字段类型是数字，可直接获得数值和范围校验'), option('input', '若编号可能包含前导零或字母，使用文本更稳妥'), option('select', '若数字代表固定等级，可改为下拉选择')];
  else if (column.dataType === 'date') candidates = [option('datePicker', '字段类型是日期'), option('input', '需要录入非标准日期文本时使用')];
  else if (column.dataType === 'boolean') candidates = [option('switch', '布尔字段适合开关'), option('radio', '需要明确展示“是/否”两个选项时使用'), option('select', '空间紧张时可使用下拉选择')];
  else if (column.dataType === 'enum' || (samples.length > 1 && samples.length <= 12 && Number(column.uniqueCount || samples.length) <= 20)) candidates = [option('select', `检测到 ${samples.length || '少量'} 个候选值`), option('radio', '选项较少且希望全部可见'), option('input', '仍允许用户输入候选值之外的内容')];
  else if (LONG_TEXT.test(column.name) || samples.some((value) => value.length > 80)) candidates = [option('textarea', '字段名称或样例表示较长内容'), option('input', '内容通常只有一行时使用')];
  else candidates = [option('input', '通用文本字段'), option('select', '若该字段实际只有固定选项，可改为下拉'), option('textarea', '若需要录入较长内容，可改为多行文本')];
  return candidates;
}

export function recommendedControl(column: DataFieldDragItem['column']) {
  return recommendControls(column)[0];
}

export function controlOptionsFromSamples(item: DataFieldDragItem, controlType: string) {
  if (!['select', 'radio', 'checkbox'].includes(controlType)) return undefined;
  return [...new Set((item.column.sampleValues || []).filter((value) => value != null && value !== ''))].map((value) => ({ label: String(value), value }));
}
