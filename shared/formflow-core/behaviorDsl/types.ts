export type TriggerType =
  | 'formLoad' | 'rowLoad' | 'fieldChange' | 'fieldBlur' | 'fieldFocus'
  | 'buttonClick' | 'validate' | 'submit' | 'submitSuccess' | 'submitError'
  | 'dataSourceChange' | 'tabChange' | 'formReady' | 'formReset' | 'beforeSubmit'
  | 'fieldKeyDown' | 'fieldPaste' | 'fieldClear' | 'rowAdd' | 'rowDelete'
  | 'rowSelect' | 'dataImport' | 'dataExport' | 'valueChange';

export type ConditionOperator =
  | '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'notContains'
  | 'startsWith' | 'notStartsWith' | 'endsWith' | 'notEndsWith'
  | 'isEmpty' | 'isNotEmpty' | 'regex' | 'custom';

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

export interface FormLinkageOptionsConfig {
  mode: 'table' | 'range' | 'staticMap';
  table?: string;
  [key: string]: unknown;
}

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

export type FormLinkageOperator =
  | 'equals' | 'notEquals' | 'isEmpty' | 'isNotEmpty' | 'contains' | 'notContains'
  | 'startsWith' | 'notStartsWith' | 'endsWith' | 'notEndsWith'
  | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual';

export interface FormLinkageCondition {
  id: string;
  field?: string;
  operator: FormLinkageOperator;
  value?: unknown;
  valueSource?: 'static' | 'field';
  sourceField?: string;
}

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

export interface FormWindowConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, any>;
}

export interface SrcTableEntry { id: string; fileName: string; }
export interface WorkflowFile { id: string; name: string; }

export type BehaviorDslDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface BehaviorDslDiagnostic {
  line: number;
  column: number;
  endColumn?: number;
  severity: BehaviorDslDiagnosticSeverity;
  code: string;
  message: string;
  suggestion?: string;
}

export interface BehaviorDslCompileContext {
  fields?: string[];
  /** 字段静态类型（供 FFR306 表达式类型检查；缺省按 unknown 处理，不产生误报） */
  fieldTypes?: Record<string, FieldType>;
  components?: DesignComponent[];
  tables?: SrcTableEntry[];
  workflows?: WorkflowFile[];
}

export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'unknown';

export interface BehaviorDslCompilation {
  rules: BehaviorRule[];
  diagnostics: BehaviorDslDiagnostic[];
  preview: string[];
}

export interface NaturalRuleTranslation { dsl: string; preview: string[]; diagnostics: string[]; }
