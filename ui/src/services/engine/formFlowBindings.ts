import type { ComponentNode } from '../../models';
import type { DesignComponent, WorkflowFile } from '../../project/types';
import type { PropertyType } from '../../../nodes/excel-api-types';
import { evaluatePropertyExpression } from './propertyExpression';
import { ensureWorkflowIo, getWorkflowExportFields, getWorkflowImportFields } from './workflowIo';

export type FlowEventValue =
  | 'value' | 'field' | 'eventName' | 'formData' | 'originalValues'
  | 'previousValue' | 'detail' | 'timestamp' | 'dirty'
  | 'changedFields' | 'component';

export type FlowValueSource =
  | { kind: 'event'; value: FlowEventValue }
  | { kind: 'formField'; componentId: string; field: string }
  | { kind: 'path'; root: 'form' | 'original' | 'detail' | 'context'; path: string }
  | { kind: 'literal'; value: unknown }
  | { kind: 'object'; entries: Record<string, FlowValueSource> }
  | { kind: 'expression'; expression: string };

export interface FlowInputBinding {
  source: FlowValueSource;
  autoMapped?: boolean;
}

export type FlowOutputPresetStep = {
  op: 'toString' | 'toNumber' | 'toBoolean' | 'trim' | 'formatDate'
    | 'defaultIfEmpty' | 'skipIfEmpty' | 'clearIfEmpty';
  value?: unknown;
  format?: string;
};

export interface FlowOutputBinding {
  target: { componentId: string; field: string };
  transform:
    | { kind: 'direct' }
    | { kind: 'preset'; steps: FlowOutputPresetStep[] }
    | { kind: 'expression'; expression: string };
}

export interface FlowBindingsV2 {
  version: 2;
  inputs: Record<string, FlowInputBinding>;
  outputs: Record<string, FlowOutputBinding>;
  /** 无法安全归一化的旧条目；运行时不执行，但高级编辑器可无损查看和迁移。 */
  extensions?: { legacyParameterMap?: Record<string, unknown> };
}

export interface FlowBindingConfigLike {
  bindings?: FlowBindingsV2;
  parameterMap?: Record<string, unknown>;
}

export interface FlowBindingContext {
  eventName: string;
  field: string;
  value: unknown;
  values: Record<string, unknown>;
  originalValues?: Record<string, unknown>;
  detail?: unknown;
  component: ComponentNode;
  previousValue?: unknown;
  timestamp?: number;
  dirty?: boolean;
  changedFields?: string[];
}

type FieldComponent = Pick<DesignComponent, 'id' | 'type' | 'fieldBinding' | 'props'> | ComponentNode;

export interface FlowBindingRisk {
  kind: 'input' | 'output' | 'overwrite' | 'schema';
  severity: 'warning' | 'error';
  message: string;
}

export interface NormalizedFlowBindings {
  bindings: FlowBindingsV2;
  migratedLegacy: boolean;
  autoMappedInputs: number;
  autoMappedOutputs: number;
  risks: FlowBindingRisk[];
}

const EVENT_EXPRESSIONS: Record<FlowEventValue, string> = {
  value: '$value',
  field: '$field',
  eventName: '$event',
  formData: '$values',
  originalValues: '$originalValues',
  previousValue: '$previousValue',
  detail: '$detail',
  timestamp: '$timestamp',
  dirty: '$dirty',
  changedFields: '$changedFields',
  component: '$component',
};

const EXPRESSION_EVENTS = Object.fromEntries(
  Object.entries(EVENT_EXPRESSIONS).map(([key, expression]) => [expression, key]),
) as Record<string, FlowEventValue>;

function normalizedName(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function getFlowComponentField(component: FieldComponent) {
  if ('fieldBinding' in component && component.fieldBinding) return String(component.fieldBinding);
  const props = component.props || {};
  return String(props.name || ('name' in component ? component.name : '') || component.id);
}

function findFieldComponent(field: string, components: FieldComponent[]) {
  const exact = components.find((component) => getFlowComponentField(component) === field);
  if (exact) return exact;
  const normalized = normalizedName(field);
  return components.find((component) => normalizedName(getFlowComponentField(component)) === normalized);
}

function legacyValueToSource(value: unknown, components: FieldComponent[]): FlowValueSource {
  if (typeof value === 'string') {
    const eventValue = EXPRESSION_EVENTS[value];
    if (eventValue) return { kind: 'event', value: eventValue };
    for (const [prefix, root] of [
      ['$form.', 'form'],
      ['$original.', 'original'],
      ['$detail.', 'detail'],
      ['$context.', 'context'],
    ] as const) {
      if (value.startsWith(prefix)) {
        const path = value.slice(prefix.length);
        if (root === 'form' && !path.includes('.')) {
          const component = findFieldComponent(path, components);
          if (component) return { kind: 'formField', componentId: component.id, field: getFlowComponentField(component) };
        }
        return { kind: 'path', root, path };
      }
    }
    if (value.startsWith('$')) return { kind: 'expression', expression: value };
    return { kind: 'literal', value };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      kind: 'object',
      entries: Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, legacyValueToSource(entry, components)]),
      ),
    };
  }
  return { kind: 'literal', value };
}

function sourceForImport(name: string, components: FieldComponent[]): FlowInputBinding | undefined {
  const eventEntry = (Object.keys(EVENT_EXPRESSIONS) as FlowEventValue[]).find((key) => (
    normalizedName(key) === normalizedName(name)
    || (key === 'eventName' && normalizedName(name) === 'event')
  ));
  if (eventEntry) return { source: { kind: 'event', value: eventEntry }, autoMapped: true };
  const component = findFieldComponent(name, components);
  if (!component) return undefined;
  return {
    source: {
      kind: 'formField',
      componentId: component.id,
      field: getFlowComponentField(component),
    },
    autoMapped: true,
  };
}

function cloneBindings(bindings: FlowBindingsV2): FlowBindingsV2 {
  try {
    return JSON.parse(JSON.stringify(bindings)) as FlowBindingsV2;
  } catch {
    return { version: 2, inputs: {}, outputs: {} };
  }
}

export function normalizeFlowBindings(
  config: FlowBindingConfigLike | undefined,
  workflow: WorkflowFile | undefined,
  components: FieldComponent[] = [],
): NormalizedFlowBindings {
  if (!workflow) {
    return {
      bindings: { version: 2, inputs: {}, outputs: {} },
      migratedLegacy: Boolean(config?.parameterMap),
      autoMappedInputs: 0,
      autoMappedOutputs: 0,
      risks: [{ kind: 'schema', severity: 'error', message: '找不到绑定的流程' }],
    };
  }
  const activeWorkflow = ensureWorkflowIo(workflow).workflow;
  const importFields = getWorkflowImportFields(activeWorkflow);
  const exportFields = getWorkflowExportFields(activeWorkflow);
  const hasV2 = config?.bindings?.version === 2;
  const bindings = hasV2
    ? cloneBindings(config!.bindings!)
    : { version: 2 as const, inputs: {}, outputs: {} };
  let autoMappedInputs = 0;
  let autoMappedOutputs = 0;

  if (!hasV2) {
    const importNode = activeWorkflow.nodes.find((node) => node.specId === 'workflow:import');
    const consumedLegacyKeys = new Set<string>();
    for (const field of importFields) {
      const legacyKey = Object.keys(config?.parameterMap || {}).find((key) => (
        key === field.name || key === `${importNode?.id}.${field.name}` || key.endsWith(`.${field.name}`)
      ));
      if (legacyKey) {
        bindings.inputs[field.id] = { source: legacyValueToSource(config!.parameterMap![legacyKey], components) };
        consumedLegacyKeys.add(legacyKey);
        continue;
      }
      const automatic = sourceForImport(field.name, components);
      if (automatic) {
        bindings.inputs[field.id] = automatic;
        autoMappedInputs += 1;
      }
    }
    for (const field of exportFields) {
      const component = findFieldComponent(field.name, components);
      if (!component) continue;
      bindings.outputs[field.id] = {
        target: { componentId: component.id, field: getFlowComponentField(component) },
        transform: { kind: 'direct' },
      };
      autoMappedOutputs += 1;
    }
    const unsupportedLegacyEntries = Object.fromEntries(
      Object.entries(config?.parameterMap || {}).filter(([key]) => !consumedLegacyKeys.has(key)),
    );
    if (Object.keys(unsupportedLegacyEntries).length) {
      bindings.extensions = { legacyParameterMap: unsupportedLegacyEntries };
    }
  }

  const risks = getFlowBindingRisks(bindings, activeWorkflow, components);
  return {
    bindings,
    migratedLegacy: !hasV2 && Boolean(config?.parameterMap || exportFields.length),
    autoMappedInputs,
    autoMappedOutputs,
    risks,
  };
}

export function getFlowBindingRisks(
  bindings: FlowBindingsV2 | undefined,
  workflow: WorkflowFile | undefined,
  components: FieldComponent[] = [],
): FlowBindingRisk[] {
  if (!workflow) return [{ kind: 'schema', severity: 'error', message: '目标流程不存在' }];
  if (!bindings || bindings.version !== 2) return [];
  const activeWorkflow = ensureWorkflowIo(workflow).workflow;
  const imports = getWorkflowImportFields(activeWorkflow);
  const exports = getWorkflowExportFields(activeWorkflow);
  const risks: FlowBindingRisk[] = [];
  const legacyExtensionCount = Object.keys(bindings.extensions?.legacyParameterMap || {}).length;
  if (legacyExtensionCount) {
    risks.push({
      kind: 'schema',
      severity: 'warning',
      message: `保留了 ${legacyExtensionCount} 个无法自动迁移的旧参数；V2 运行时不会执行这些条目`,
    });
  }
  for (const field of imports) {
    if (!bindings.inputs[field.id]) {
      const suffix = Object.prototype.hasOwnProperty.call(field, 'defaultValue')
        ? '运行时将使用默认值'
        : field.required ? '运行时会阻止流程启动' : '运行时将传入 undefined';
      risks.push({ kind: 'input', severity: 'warning', message: `输入“${field.label || field.name}”未映射，${suffix}` });
    }
  }
  const seenTargets = new Map<string, string>();
  for (const field of exports) {
    const binding = bindings.outputs[field.id];
    if (!binding) continue;
    const component = components.find((item) => item.id === binding.target.componentId);
    if (!component) {
      risks.push({ kind: 'output', severity: 'warning', message: `输出“${field.label || field.name}”的目标控件已不存在，运行时整批不回写` });
      continue;
    }
    const targetField = getFlowComponentField(component);
    const previous = seenTargets.get(targetField);
    if (previous) {
      risks.push({ kind: 'schema', severity: 'error', message: `输出“${previous}”和“${field.label || field.name}”不能同时回写字段“${targetField}”` });
    } else {
      seenTargets.set(targetField, field.label || field.name);
    }
    risks.push({ kind: 'overwrite', severity: 'warning', message: `输出“${field.label || field.name}”将在事件末尾覆盖字段“${targetField}”的先前修改` });
    if (binding.transform.kind === 'expression') {
      const result = evaluatePropertyExpression(binding.transform.expression, {
        flow: { output: null, outputs: {} },
        form: {},
        original: {},
        event: {},
        context: {},
      });
      if (!result.ok) risks.push({ kind: 'output', severity: 'warning', message: `输出“${field.label || field.name}”的表达式无效：${result.error}` });
    }
  }
  return risks;
}

function resolvePath(source: unknown, path: string) {
  if (!path) return source;
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), source);
}

export function resolveFlowValueSource(source: FlowValueSource, context: FlowBindingContext): unknown {
  switch (source.kind) {
    case 'event': {
      const values: Record<FlowEventValue, unknown> = {
        value: context.value,
        field: context.field,
        eventName: context.eventName,
        formData: context.values,
        originalValues: context.originalValues || {},
        previousValue: context.previousValue,
        detail: context.detail,
        timestamp: context.timestamp,
        dirty: context.dirty,
        changedFields: context.changedFields || [],
        component: context.component,
      };
      return values[source.value];
    }
    case 'formField': return context.values[source.field];
    case 'path': {
      const roots = {
        form: context.values,
        original: context.originalValues || {},
        detail: context.detail,
        context,
      };
      return resolvePath(roots[source.root], source.path);
    }
    case 'literal': return source.value;
    case 'object': return Object.fromEntries(
      Object.entries(source.entries).map(([key, entry]) => [key, resolveFlowValueSource(entry, context)]),
    );
    case 'expression': {
      const result = evaluatePropertyExpression(source.expression, {
        form: context.values,
        original: context.originalValues || {},
        event: { name: context.eventName, value: context.value, detail: context.detail },
        component: context.component as unknown as Record<string, unknown>,
        context: context as unknown as Record<string, unknown>,
      });
      if (!result.ok) throw new Error(result.error || '输入表达式计算失败');
      return result.value;
    }
  }
}

function isMissingRequiredValue(value: unknown) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

export function resolveV2FlowInputs(
  bindings: FlowBindingsV2,
  workflow: WorkflowFile,
  context: FlowBindingContext,
) {
  const fields = getWorkflowImportFields(ensureWorkflowIo(workflow).workflow);
  const values: Record<string, unknown> = {};
  const missingRequired: string[] = [];
  for (const field of fields) {
    const binding = bindings.inputs[field.id];
    let value = binding ? resolveFlowValueSource(binding.source, context) : undefined;
    if (isMissingRequiredValue(value) && Object.prototype.hasOwnProperty.call(field, 'defaultValue')) {
      value = field.defaultValue;
    }
    if (field.required && isMissingRequiredValue(value)) missingRequired.push(field.label || field.name);
    values[field.name] = value;
  }
  if (missingRequired.length) throw new Error(`流程必填输入缺失：${missingRequired.join('、')}`);
  return values;
}

const SKIP_OUTPUT = Symbol('skip-flow-output');

function isEmptyOutput(value: unknown) {
  return value === undefined || value === null || value === '';
}

function applyPresetStep(value: unknown, step: FlowOutputPresetStep): unknown | typeof SKIP_OUTPUT {
  switch (step.op) {
    case 'toString': return value == null ? '' : String(value);
    case 'toNumber': {
      const next = Number(value);
      if (Number.isNaN(next)) throw new Error(`“${String(value)}”无法转换为数字`);
      return next;
    }
    case 'toBoolean':
      if (typeof value === 'string') return !['', 'false', '0', 'no', '否'].includes(value.trim().toLowerCase());
      return Boolean(value);
    case 'trim': return String(value ?? '').trim();
    case 'formatDate': {
      const date = new Date(String(value ?? ''));
      if (Number.isNaN(date.getTime())) throw new Error(`“${String(value)}”不是有效日期`);
      const format = step.format || 'YYYY-MM-DD';
      const parts: Record<string, string> = {
        YYYY: String(date.getFullYear()),
        MM: String(date.getMonth() + 1).padStart(2, '0'),
        DD: String(date.getDate()).padStart(2, '0'),
        HH: String(date.getHours()).padStart(2, '0'),
        mm: String(date.getMinutes()).padStart(2, '0'),
        ss: String(date.getSeconds()).padStart(2, '0'),
      };
      return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (key) => parts[key]);
    }
    case 'defaultIfEmpty': return isEmptyOutput(value) ? step.value : value;
    case 'skipIfEmpty': return isEmptyOutput(value) ? SKIP_OUTPUT : value;
    case 'clearIfEmpty': return isEmptyOutput(value) ? null : value;
  }
}

function expectedComponentType(component: FieldComponent): PropertyType {
  if (['numberInput', 'number', 'rating'].includes(component.type)) return 'number';
  if (component.type === 'switch') return 'boolean';
  if (component.type === 'checkbox') return 'array';
  if (['input', 'textarea', 'select', 'radio', 'datePicker', 'timePicker', 'dateRange'].includes(component.type)) return 'string';
  return 'any';
}

function assertCompatibleValue(value: unknown, type: PropertyType, field: string) {
  if (value === null || value === '' || value === undefined || type === 'any' || type === 'json') return;
  const valid = type === 'array' ? Array.isArray(value)
    : type === 'object' ? typeof value === 'object' && !Array.isArray(value)
      : typeof value === type;
  if (!valid) throw new Error(`字段“${field}”需要 ${type}，实际得到 ${Array.isArray(value) ? 'array' : typeof value}`);
}

export interface PreparedFlowOutputWrites {
  writes: Array<{ componentId: string; field: string; value: unknown; output: string }>;
  skipped: string[];
}

export function prepareV2FlowOutputWrites(
  bindings: FlowBindingsV2,
  workflow: WorkflowFile,
  outputs: Record<string, unknown>,
  context: FlowBindingContext,
  components: FieldComponent[],
): PreparedFlowOutputWrites {
  const fields = getWorkflowExportFields(ensureWorkflowIo(workflow).workflow);
  const writes: PreparedFlowOutputWrites['writes'] = [];
  const skipped: string[] = [];
  const targets = new Set<string>();
  for (const field of fields) {
    const binding = bindings.outputs[field.id];
    if (!binding) continue;
    const component = components.find((item) => item.id === binding.target.componentId);
    if (!component) throw new Error(`输出“${field.label || field.name}”的目标控件不存在`);
    const targetField = getFlowComponentField(component);
    if (targets.has(targetField)) throw new Error(`多个流程输出不能同时回写字段“${targetField}”`);
    targets.add(targetField);
    const raw = outputs[field.name];
    let value: unknown | typeof SKIP_OUTPUT = raw;
    if (binding.transform.kind === 'preset') {
      for (const step of binding.transform.steps) {
        value = applyPresetStep(value === SKIP_OUTPUT ? undefined : value, step);
        if (value === SKIP_OUTPUT) break;
      }
    } else if (binding.transform.kind === 'expression') {
      const result = evaluatePropertyExpression(binding.transform.expression, {
        flow: { output: raw, outputs },
        form: context.values,
        original: context.originalValues || {},
        event: { name: context.eventName, value: context.value, detail: context.detail },
        context: context as unknown as Record<string, unknown>,
      });
      if (!result.ok) throw new Error(`输出“${field.label || field.name}”转换失败：${result.error}`);
      value = result.value;
    }
    if (value === SKIP_OUTPUT || value === undefined) {
      skipped.push(field.label || field.name);
      continue;
    }
    assertCompatibleValue(value, expectedComponentType(component), targetField);
    writes.push({ componentId: component.id, field: targetField, value, output: field.label || field.name });
  }
  return { writes, skipped };
}

export function describeFlowValueSource(source: FlowValueSource) {
  switch (source.kind) {
    case 'event': return `事件 · ${source.value}`;
    case 'formField': return `表单字段 · ${source.field}`;
    case 'path': return `${source.root}.${source.path}`;
    case 'literal': return `固定值 · ${JSON.stringify(source.value)}`;
    case 'object': return `对象 · ${Object.keys(source.entries).length} 项`;
    case 'expression': return `表达式 · ${source.expression}`;
  }
}

// ─── V1 resolution (legacy string-expression based) ───────────────────────────

export type FormControlEventName = 'onChange' | 'onBlur' | 'onFocus' | 'onClick' | string;

export interface FormControlEventContext {
  eventName: FormControlEventName;
  field: string;
  value: unknown;
  values: Record<string, unknown>;
  originalValues?: Record<string, unknown>;
  detail?: unknown;
  component: ComponentNode;
  previousValue?: unknown;
  timestamp?: number;
  dirty?: boolean;
  changedFields?: string[];
  componentId?: string;
  componentType?: string;
  idempotencyKey?: string;
}

function resolvePathV1(source: unknown, path: string[]): unknown {
  return path.reduce((value: any, key) => value == null ? undefined : value[key], source as any);
}

export function resolveFormFlowValue(expression: unknown, context: FormControlEventContext): unknown {
  if (Array.isArray(expression)) return expression.map((item) => resolveFormFlowValue(item, context));
  if (expression && typeof expression === 'object') {
    return Object.fromEntries(Object.entries(expression).map(([key, value]) => [key, resolveFormFlowValue(value, context)]));
  }
  if (typeof expression !== 'string') return expression;
  const exact: Record<string, unknown> = {
    '$value': context.value,
    '$field': context.field,
    '$event': context.eventName,
    '$values': context.values,
    '$form': context.values,
    '$formData': context.values,
    '$originalValues': context.originalValues || {},
    '$component': context.component,
    '$componentId': context.component.id,
    '$detail': context.detail,
    '$previousValue': context.previousValue,
    '$timestamp': context.timestamp,
    '$dirty': context.dirty,
    '$changedFields': context.changedFields || [],
    '$context': context,
  };
  if (Object.prototype.hasOwnProperty.call(exact, expression)) return exact[expression];
  if (expression.startsWith('$form.')) return resolvePathV1(context.values, expression.slice(6).split('.'));
  if (expression.startsWith('$original.')) return resolvePathV1(context.originalValues || {}, expression.slice(10).split('.'));
  if (expression.startsWith('$component.')) return resolvePathV1(context.component, expression.slice(11).split('.'));
  if (expression.startsWith('$detail.')) return resolvePathV1(context.detail, expression.slice(8).split('.'));
  if (expression.startsWith('$context.')) return resolvePathV1(context, expression.slice(9).split('.'));
  return expression;
}
