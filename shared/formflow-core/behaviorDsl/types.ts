/** 规则触发类型：字段变化、表单加载/提交、控件点击等。 */
export type TriggerType =
  | 'formLoad' | 'rowLoad' | 'fieldChange' | 'fieldBlur' | 'fieldFocus'
  | 'buttonClick' | 'validate' | 'submit' | 'submitSuccess' | 'submitError'
  | 'dataSourceChange' | 'tabChange' | 'formReady' | 'formReset' | 'beforeSubmit'
  | 'fieldKeyDown' | 'fieldPaste' | 'fieldClear' | 'rowAdd' | 'rowDelete'
  | 'rowSelect' | 'dataImport' | 'dataExport' | 'valueChange';

/** 条件运算符（含文本与空值语义）。 */
export type ConditionOperator =
  | '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'notContains'
  | 'startsWith' | 'notStartsWith' | 'endsWith' | 'notEndsWith'
  | 'isEmpty' | 'isNotEmpty' | 'regex' | 'custom';

/** 单个条件子句：字段、运算符与值（值可为源字段引用）。 */
export interface ConditionConfig {
  fieldName: string;
  operator: ConditionOperator;
  value: unknown;
  sourceField?: string;
  value2?: unknown;
  customExpression?: string;
  logic: 'AND' | 'OR';
  dataSource?: 'form' | 'flow' | 'behavior';
  flowOutputField?: string;
  behaviorName?: string;
}

/** 字段选项联动配置。 */
export interface FormLinkageOptionsConfig {
  mode: 'table' | 'range' | 'staticMap';
  table?: string;
  [key: string]: unknown;
}

/** 动作配置：类型、目标字段、表达式与消息。 */
export interface ActionConfig {
  type: string;
  targetField?: string;
  targetComponent?: string;
  fields?: string[];
  value?: unknown;
  valueSource?: 'static' | 'event' | 'field';
  sourceField?: string;
  expression?: string;
  message?: string;
  messageType?: 'info' | 'success' | 'warning' | 'error';
  validator?: string;
  pattern?: string;
  operator?: '==' | '!=' | '>' | '<' | '>=' | '<=';
  min?: number | null;
  max?: number | null;
  workflowId?: string;
  workflowParameters?: Record<string, unknown>;
  optionsConfig?: FormLinkageOptionsConfig;
}

/** 行为规则：触发器、条件、动作与静态分析元数据。 */
export interface BehaviorRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  trigger: { type: TriggerType; fieldName?: string; componentName?: string; buttonName?: string; debounce?: number };
  conditions: ConditionConfig[];
  actions: ActionConfig[];
  sideEffects: Array<{ type: 'log' | 'analytics' | 'notification'; message?: string; data?: Record<string, unknown> }>;
}

/** 表单联动规则运算符。 */
export type FormLinkageOperator =
  | 'equals' | 'notEquals' | 'isEmpty' | 'isNotEmpty' | 'contains' | 'notContains'
  | 'startsWith' | 'notStartsWith' | 'endsWith' | 'notEndsWith'
  | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual';

/** 表单联动条件。 */
export interface FormLinkageCondition {
  id: string;
  field?: string;
  operator: FormLinkageOperator;
  value?: unknown;
  valueSource?: 'static' | 'field';
  sourceField?: string;
}

/** 表单联动动作。 */
export interface FormLinkageAction {
  id: string;
  type: string;
  targetField?: string;
  targetComponentId?: string;
  fields?: string[];
  value?: unknown;
  expression?: string;
  valueSource?: 'static' | 'event' | 'field';
  sourceField?: string;
  visible?: boolean;
  disabled?: boolean;
  required?: boolean;
  message?: string;
  level?: 'info' | 'success' | 'warning' | 'error';
  validator?: string;
  pattern?: string;
  operator?: '==' | '!=' | '>' | '<' | '>=' | '<=';
  min?: number | null;
  max?: number | null;
  workflowId?: string;
  parameters?: Record<string, unknown>;
  optionsConfig?: FormLinkageOptionsConfig;
}

/** 表单联动规则：条件与动作的配对。 */
export interface FormLinkageRule {
  id: string;
  name: string;
  trigger: { eventName: string; sourceField?: string; sourceComponentId?: string };
  conditions: FormLinkageCondition[];
  conditionMode?: 'all' | 'any';
  actions: FormLinkageAction[];
  scope?: 'current-form' | 'current-component' | 'target-fields';
  enabled: boolean;
  priority: number;
}

/** 设计稿组件（联动应用所需的最小形状）。 */
export interface DesignComponent {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, any>;
  fieldBinding?: string;
}

/** 表单窗口配置（联动应用所需的最小形状）。 */
export interface FormWindowConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, any>;
}

/** 源数据表最小形状。 */
export interface SrcTableEntry { id: string; fileName: string; }
/** 工作流文件最小形状。 */
export interface WorkflowFile { id: string; name: string; }

/** 诊断严重级别。 */
export type BehaviorDslDiagnosticSeverity = 'error' | 'warning' | 'info';

/** DSL 诊断：位置、严重级别、代码与建议。 */
export interface BehaviorDslDiagnostic {
  line: number;
  column: number;
  endColumn?: number;
  severity: BehaviorDslDiagnosticSeverity;
  code: string;
  message: string;
  suggestion?: string;
}

/** 编译上下文：字段类型、动作级别与来源行信息。 */
export interface BehaviorDslCompileContext {
  fields?: string[];
  /** 字段静态类型（供 FFR306 表达式类型检查；缺省按 unknown 处理，不产生误报） */
  fieldTypes?: Record<string, FieldType>;
  components?: DesignComponent[];
  tables?: SrcTableEntry[];
  workflows?: WorkflowFile[];
}

/** 字段类型（类型检查用）。 */
export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'unknown';

/** DSL 编译结果：规则、诊断与预览。 */
export interface BehaviorDslCompilation {
  rules: BehaviorRule[];
  diagnostics: BehaviorDslDiagnostic[];
  preview: string[];
}

/** 自然语言转 DSL 的结果：生成的代码、预览行与诊断。 */
export interface NaturalRuleTranslation { dsl: string; preview: string[]; diagnostics: string[]; }
