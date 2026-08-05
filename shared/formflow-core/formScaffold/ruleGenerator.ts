/**
 * Rule generation for form scaffold.
 *
 * Generates validation rules and reset scripts.
 */
import type { InferredFormField } from '../fieldInference';
import type { SrcSheetInfo, SrcTableEntry, BehaviorFile } from '../formScaffold';

/** 生成必填/类型/枚举校验规则 DSL；提供 saveButtonName 时同时生成点击守卫。 */
export function buildRuleCode(fields: InferredFormField[], saveButtonName?: string) {
  const rules: string[] = [];
  const requiredFields = fields.filter((field) => field.required && !field.readonly).map((field) => `$${field.name}`);
  if (requiredFields.length) {
    if (saveButtonName) rules.push(`before click(${JSON.stringify(saveButtonName)}) -> require(${requiredFields.join(', ')})`);
    rules.push(`before submit -> require(${requiredFields.join(', ')})`);
  }
  for (const field of fields) {
    if (field.readonly) continue;
    const ref = `$${field.name}`;
    if (field.controlType === 'number') rules.push(`before submit -> validate(${ref}, number)`);
    if (field.controlType === 'datePicker') rules.push(`before submit -> validate(${ref}, date)`);
    if (field.controlType === 'select' && field.options?.length) rules.push(`before submit -> enum(${ref}, ${field.options.map((v) => JSON.stringify(v)).join(', ')})`);
  }
  return rules.join('\n');
}

/** 生成表单重置脚本：清理非键字段并回填默认值（数字主键自动续号）。 */
export function buildResetScript(fields: InferredFormField[], table: SrcTableEntry, sheet: SrcSheetInfo) {
  const key = fields.find((field) => field.isKey);
  const clearFields = fields.filter((field) => !field.isKey && field.defaultValue === undefined).map((field) => field.name);
  const defaults = Object.fromEntries(fields.filter((field) => field.defaultValue !== undefined).map((field) => [field.name, field.defaultValue]));
  const lines: string[] = [];
  if (key && key.controlType === 'number') lines.push(`const nextId = ctx.nextSequence(${JSON.stringify(`${table.id}:${sheet.name}`)}, ${JSON.stringify(key.name)}, { start: 1 });`);
  if (key && key.controlType === 'number') defaults[key.name] = '$nextId';
  const defaultsSource = JSON.stringify(defaults).replace('"$nextId"', 'nextId');
  lines.push(`await ctx.resetForm({ clearFields: ${JSON.stringify(clearFields)}, defaults: ${defaultsSource}, focusField: ${JSON.stringify(fields.find((field) => !field.readonly)?.name || '')} });`);
  return lines.join('\n');
}

/** 生成初始化/重置行为文件（按是否只读与是否包含重置开关）。 */
export function createBehaviors(
  prefix: string,
  name: string,
  fields: InferredFormField[],
  table: SrcTableEntry,
  sheet: SrcSheetInfo,
  options: { now: string; readonlyPurpose: boolean; includeReset: boolean },
): BehaviorFile[] {
  const resetScript = buildResetScript(fields, table, sheet);
  const initBehavior: BehaviorFile | undefined = fields.some((field) => field.isKey && field.controlType === 'number') ? {
    id: `${prefix}_initialize`,
    name: `初始化${name}`,
    event: 'onFormLoad',
    code: resetScript,
    priority: 10,
    enabled: true,
    createdAt: options.now,
    updatedAt: options.now,
  } : undefined;

  const resetBehavior: BehaviorFile | undefined = !options.readonlyPurpose && options.includeReset ? {
    id: `${prefix}_reset_action`,
    name: `重置${name}`,
    event: 'onClick',
    code: resetScript,
    priority: 20,
    enabled: true,
    createdAt: options.now,
    updatedAt: options.now,
    trigger: { componentId: `${prefix}_reset`, eventName: 'onClick' },
    eventFallbackReason: 'runtime-ui-only',
  } : undefined;

  return [initBehavior, resetBehavior].filter(Boolean) as BehaviorFile[];
}
