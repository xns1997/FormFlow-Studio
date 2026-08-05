import type { DebugEntry, DesignComponent, SrcTableEntry } from '../../project/types';
import { getPreviewInitialValue } from '../display/previewValues';

export interface MaskedRuntimeValue {
  masked: true;
  type: string;
  length?: number;
  present: boolean;
}

export interface FormRuntimeSnapshot {
  formId: string;
  capturedAt: string;
  source: 'live' | 'synthetic';
  values: Record<string, unknown | MaskedRuntimeValue>;
  originalValues: Record<string, unknown | MaskedRuntimeValue>;
  dirtyFields: string[];
  componentStates: Record<string, { visible: boolean; disabled: boolean; required: boolean }>;
  validationErrors: Record<string, string>;
  recentLogs: Array<Pick<DebugEntry, 'level' | 'title' | 'message' | 'timestamp'>>;
}

const snapshots = new Map<string, FormRuntimeSnapshot>();
const listeners = new Set<() => void>();

const sensitive = /(password|passwd|pwd|token|secret|api.?key|access.?key|id.?card|身份证|手机|电话|phone|mobile|email|邮箱)/i;

/** 运行时值脱敏（隐藏敏感字段）。 */
export function maskRuntimeValues(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).map(([field, value]) => {
    if (!sensitive.test(field)) return [field, value];
    const text = value == null ? '' : String(value);
    return [field, { masked: true, type: Array.isArray(value) ? 'array' : typeof value, length: text.length, present: text.length > 0 } satisfies MaskedRuntimeValue];
  }));
}

/** 发布表单运行时快照并通知订阅者。 */
export function publishFormRuntimeSnapshot(snapshot: FormRuntimeSnapshot) {
  snapshots.set(snapshot.formId, snapshot);
  listeners.forEach((listener) => listener());
}

/** 移除表单运行时快照。 */
export function removeFormRuntimeSnapshot(formId: string) {
  snapshots.delete(formId);
  listeners.forEach((listener) => listener());
}

/** 读取表单运行时快照。 */
export function getFormRuntimeSnapshot(formId: string) { return snapshots.get(formId); }
/** 订阅快照变更（返回退订函数）。 */
export function subscribeFormRuntimeSnapshots(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** 由设计稿构造合成运行时快照（无真实运行时）。 */
export function createSyntheticRuntimeSnapshot(formId: string, components: DesignComponent[], tables: SrcTableEntry[]): FormRuntimeSnapshot {
  const rawValues = Object.fromEntries(components.map((component) => [String(component.fieldBinding || component.props?.name || component.id), getPreviewInitialValue(component, tables)]));
  return {
    formId,
    capturedAt: new Date().toISOString(),
    source: 'synthetic',
    values: maskRuntimeValues(rawValues),
    originalValues: maskRuntimeValues(rawValues),
    dirtyFields: [],
    componentStates: Object.fromEntries(components.map((component) => [component.id, {
      visible: component.visible !== false && component.props?.visible !== false,
      disabled: Boolean(component.props?.disabled),
      required: Boolean(component.props?.required),
    }])),
    validationErrors: {},
    recentLogs: [],
  };
}
