export type FormEventContractMemberKind = 'value' | 'method';

export interface FormEventContractMemberOptions {
  /** 内部成员：运行时存在，但编辑器补全、参考文档与别名 d.ts 不暴露。 */
  internal?: boolean;
  /** 已废弃：仅保留运行期兼容，编辑器补全与参考文档不推荐。 */
  deprecated?: boolean;
}

export interface FormEventContractMember {
  name: string;
  kind: FormEventContractMemberKind;
  type: string;
  signature?: string;
  description: string;
  topLevelAlias?: boolean;
  internal?: boolean;
  deprecated?: boolean;
}

const value = (
  name: string,
  type: string,
  description: string,
  topLevelAlias = true,
  options: FormEventContractMemberOptions = {},
): FormEventContractMember => ({ name, kind: 'value', type, description, topLevelAlias, ...options });

const method = (
  name: string,
  signature: string,
  description: string,
  topLevelAlias = true,
  options: FormEventContractMemberOptions = {},
): FormEventContractMember => ({ name, kind: 'method', type: 'function', signature, description, topLevelAlias, ...options });

/**
 * Canonical public contract for control-event scripts.
 *
 * Runtime aliases, editor completion and reference documentation consume this
 * inventory so adding an API in one surface cannot silently omit the others.
 * `internal` members are part of the runtime contract but intentionally hidden
 * from editor completion, reference docs and top-level aliases.
 */
export const FORM_EVENT_CONTRACT: readonly FormEventContractMember[] = [
  value('event', 'string', '当前事件名。'),
  value('eventName', 'string', '当前事件名。'),
  value('field', 'string', '当前触发字段名。'),
  value('value', 'unknown', '当前事件值。'),
  value('values', 'Record<string, unknown>', '当前表单值。'),
  value('formData', 'Record<string, unknown>', '当前表单值的业务别名。'),
  value('originalValues', 'Record<string, unknown>', '事件开始前的原始值。'),
  value('detail', 'unknown', '事件专属附加数据。'),
  value('previousValue', 'unknown', '当前字段的前值。'),
  value('timestamp', 'number', '事件创建时间戳。'),
  value('dirty', 'boolean', '当前字段是否变化。'),
  value('changedFields', 'string[]', '相对原始值发生变化的字段。'),
  value('component', 'FormEventComponent', '当前控件定义。'),
  value('componentId', 'string', '当前控件 ID。'),
  value('componentType', 'string', '当前控件类型。'),
  value('controls', 'Record<string, FormEventControlHandle>', '按字段名或控件 ID 访问控件句柄。字段名键按 fieldBinding→props.name→name→id 派生；ID 键仅在未被占用时写入；旧派生键（name→props.name→id）在未冲突时以 deprecated 别名保留。'),
  value('callbacks', 'Record<string, EventCallback>', '宿主注册的回调。'),
  method('getValue', 'getValue(field: string): unknown', '读取字段值。'),
  method('getValues', 'getValues(fields: readonly string[]): Record<string, unknown>', '批量读取字段值。'),
  method('setValue', 'setValue(field: string, value: unknown): Promise<void>', '设置字段值。'),
  method('setValues', 'setValues(patch: Record<string, unknown>): Promise<void>', '批量设置字段值。'),
  method('clearValue', 'clearValue(field: string): Promise<void>', '清空字段。'),
  method('clearValues', 'clearValues(fields: readonly string[]): Promise<void>', '批量清空字段。'),
  method('setVisible', 'setVisible(componentId: string, visible: boolean): Promise<void>', '设置控件显隐。'),
  method('toggleVisible', 'toggleVisible(componentId: string): Promise<boolean>', '切换控件显隐。'),
  method('setDisabled', 'setDisabled(componentId: string, disabled: boolean): Promise<void>', '设置控件禁用状态。'),
  method('toggleDisabled', 'toggleDisabled(componentId: string): Promise<boolean>', '切换控件禁用状态。'),
  method('setRequired', 'setRequired(field: string, required: boolean): Promise<void>', '设置字段必填状态。'),
  method('toggleRequired', 'toggleRequired(field: string): Promise<boolean>', '切换字段必填状态。'),
  method('setFieldState', 'setFieldState(fieldOrComponentId: string, patch: FormFieldStatePatch): Promise<void>', '一次设置字段值与控件状态。'),
  method('setOptions', 'setOptions(field: string, config: FormLinkageOptionsConfig): Promise<void>', '设置字段选项配置。', false),
  method('focusField', 'focusField(field: string): Promise<void>', '聚焦字段。'),
  method('focusControl', 'focusControl(componentId: string): Promise<void>', '聚焦控件。'),
  method('scrollToField', 'scrollToField(field: string): Promise<void>', '滚动到字段。'),
  method('scrollToControl', 'scrollToControl(componentId: string): Promise<void>', '滚动到控件。'),
  method('switchTab', 'switchTab(tabIdOrIndex: string | number): Promise<void>', '切换页签。'),
  method('openTab', 'openTab(tabIdOrIndex: string | number): Promise<void>', '切换页签的业务别名。'),
  method('showMessage', "showMessage(message: string, level?: 'info' | 'success' | 'warning' | 'error'): Promise<void>", '显示用户提示。'),
  method('debug', 'debug(label: string, data?: unknown, options?: Record<string, unknown>): void', '写入结构化调试日志。'),
  value('console', "Pick<Console, 'log' | 'warn' | 'error' | 'debug'>", '事件内调试控制台；写入结构化日志。', false),
  method('querySheet', 'querySheet(sheetId: string, filter?: Record<string, unknown>): Record<string, unknown>[]', '查询项目数据表。'),
  method('findRows', 'findRows(sheetId: string, criteria?: Record<string, unknown>, options?: FormFindRowsOptions): Record<string, unknown>[]', '查询多条记录。'),
  method('findRow', 'findRow(sheetId: string, criteria: Record<string, unknown>, options?: FormFindRowOptions): Record<string, unknown> | null', '查询单条记录。'),
  method('nextSequence', 'nextSequence(sheetId: string, column: string, options?: FormNextSequenceOptions): number', '生成下一个顺序编号。'),
  method('fillForm', 'fillForm(record: Record<string, unknown> | null | undefined, fieldMap?: Record<string, string>, options?: FormFillFormOptions): Promise<FormFillFormResult>', '批量回填表单。'),
  method('requireFields', 'requireFields(fields: string[], options?: FormRequireFieldsOptions): Promise<FormRequireFieldsResult>', '批量校验必填字段。'),
  method('resetForm', 'resetForm(options?: FormResetFormOptions): Promise<FormResetFormResult>', '重置表单。'),
  method('evaluate', 'evaluate(expression: string): unknown', '计算受限表达式。', false),
  method('fields', 'fields(fields: string | string[]): FormFlowFieldChain', '创建字段链式操作。', false),
  value('form', 'FormFlowFormChain', '表单链式操作。', false),
  method('table', 'table(sheetId: string): FormFlowTableChain', '创建数据表链式操作。', false),
  method('flow', 'flow(workflow?: string): FormFlowChain', '创建流程链式操作。', false),
  method('runWorkflow', 'runWorkflow(workflow?: string, parameters?: Record<string, unknown>, options?: { targetNodeId?: string }): Promise<EventFlowResult>', '运行指定流程。'),
  method('runConfiguredWorkflow', 'runConfiguredWorkflow(parameters?: Record<string, unknown>): Promise<EventFlowResult>', '运行当前事件绑定的流程。'),
  method('queueFlowOutput', 'queueFlowOutput(field: string, value: unknown): void', '记录流程输出意图，事件尾部统一提交（内部成员，不面向脚本）。', false, { internal: true }),
  method('call', 'call(name: string, ...args: unknown[]): Promise<unknown>', '调用宿主回调。'),
] as const;

export const FORM_EVENT_SCRIPT_ALIAS_KEYS = FORM_EVENT_CONTRACT
  .filter((member) => member.topLevelAlias)
  .map((member) => member.name);

export const FORM_EVENT_PUBLIC_MEMBERS = FORM_EVENT_CONTRACT.filter((member) => !member.internal);
export const FORM_EVENT_INTERNAL_MEMBERS = FORM_EVENT_CONTRACT.filter((member) => member.internal);

export type FormEventContractKey = typeof FORM_EVENT_CONTRACT[number]['name'];
/** Compile-time completeness constraint for concrete runtime contexts. */
export type FormEventRuntimeContract = { [Key in FormEventContractKey]: unknown };

export function getFormEventContractMember(name: string) {
  return FORM_EVENT_CONTRACT.find((member) => member.name === name);
}

function memberJsDoc(member: FormEventContractMember) {
  return `/** ${member.description} */`;
}

export function renderFormEventContractInterface(
  name = 'FormEventCanonicalContract',
  options: { includeInternal?: boolean } = {},
) {
  const members = FORM_EVENT_CONTRACT
    .filter((member) => options.includeInternal || !member.internal)
    .map((member) => {
      const jsDoc = member.deprecated
        ? `${memberJsDoc(member)}\n  @deprecated 保留运行期兼容，编辑器与文档不再推荐。`
        : memberJsDoc(member);
      return member.kind === 'method'
        ? `${jsDoc}\n  ${member.signature};`
        : `${jsDoc}\n  ${member.name}: ${member.type};`;
    });
  return `interface ${name} {\n${members.join('\n')}\n}`;
}

export function renderFormEventContractAliases() {
  return FORM_EVENT_CONTRACT
    .filter((member) => member.topLevelAlias)
    .map((member) => member.kind === 'method'
      ? `${memberJsDoc(member)}\ndeclare function ${member.signature};`
      : `${memberJsDoc(member)}\ndeclare const ${member.name}: ${member.type};`)
    .join('\n');
}
