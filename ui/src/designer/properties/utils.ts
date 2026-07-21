import type { DesignComponent, FormLinkageAction, FormLinkageCondition, FormLinkageRule } from '../../project/types';

export function getDefaultEventCode(eventKey: string, fieldName: string): string {
  const templates: Record<string, string> = {
    onChange: `/** @param {FormEventContext} ctx */
async (ctx) => {
  PrintDebug('${fieldName} 变更为:', value);
  return value;
}`,
    onBlur: `/** @param {FormEventContext} ctx */
async (ctx) => {
  PrintDebug('${fieldName} 失焦, 当前值:', value);
}`,
    onFocus: `/** @param {FormEventContext} ctx */
async (ctx) => {
  PrintDebug('${fieldName} 获得焦点');
}`,
    onClick: `/** @param {FormEventContext} ctx */
async (ctx) => {
  PrintDebug('${fieldName} 被点击', values);
}`,
  };
  return templates[eventKey] || `// ${eventKey}\n`;
}

export function createRuleId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createDefaultLinkageCondition(field?: string): FormLinkageCondition {
  return {
    id: createRuleId('cond'),
    field,
    operator: 'equals',
    value: '',
  };
}

export function createDefaultLinkageAction(): FormLinkageAction {
  return {
    id: createRuleId('action'),
    type: 'setValue',
    targetField: '',
    valueSource: 'event',
  };
}

export function createDefaultLinkageRule(eventName: string, fieldName: string): FormLinkageRule {
  return {
    id: createRuleId('rule'),
    name: `${eventName} 联动`,
    trigger: { eventName, sourceField: fieldName },
    conditions: [createDefaultLinkageCondition(fieldName)],
    conditionMode: 'all',
    actions: [createDefaultLinkageAction()],
    scope: 'current-form',
    enabled: true,
    priority: 10,
  };
}

export type StaticObjectValueMode = 'eventValue' | 'fieldValue' | 'formPath' | 'expression' | 'static';

export type StaticObjectEntry = {
  id: string;
  key: string;
  valueMode: StaticObjectValueMode;
  value: string;
};

export function inferStaticObjectValueMode(raw: unknown): { valueMode: StaticObjectValueMode; value: string } {
  if (typeof raw !== 'string') return { valueMode: 'static', value: JSON.stringify(raw ?? '') };
  if (raw === '$value') return { valueMode: 'eventValue', value: '' };
  if (raw.startsWith('$form.')) {
    const path = raw.slice(6);
    return { valueMode: path.includes('.') ? 'formPath' : 'fieldValue', value: path };
  }
  return raw.startsWith('$') ? { valueMode: 'expression', value: raw } : { valueMode: 'static', value: raw };
}

export function buildStaticObjectEntryValue(entry: StaticObjectEntry): unknown {
  switch (entry.valueMode) {
    case 'eventValue': return '$value';
    case 'fieldValue': return `$form.${entry.value}`;
    case 'formPath': return `$form.${entry.value}`;
    case 'expression': return entry.value;
    case 'static':
      try {
        return JSON.parse(entry.value);
      } catch {
        return entry.value;
      }
    default:
      return entry.value;
  }
}

export function parseStaticObjectEntries(raw: string): StaticObjectEntry[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return Object.entries(parsed).map(([key, value]) => {
      const resolved = inferStaticObjectValueMode(value);
      return {
        id: createRuleId('obj'),
        key,
        valueMode: resolved.valueMode,
        value: resolved.value,
      };
    });
  } catch {
    return null;
  }
}

export function buildStaticObjectJson(entries: StaticObjectEntry[]) {
  return JSON.stringify(
    Object.fromEntries(
      entries
        .filter((entry) => entry.key.trim())
        .map((entry) => [entry.key.trim(), buildStaticObjectEntryValue(entry)]),
    ),
    null,
    2,
  );
}

export function normalizeMappingName(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

export function findMatchingField(target: string, fields: string[]) {
  const normalizedTarget = normalizeMappingName(target);
  if (!normalizedTarget) return '';
  return fields.find((field) => normalizeMappingName(field) === normalizedTarget) || '';
}

export interface Props {
  component: DesignComponent | null;
  components?: DesignComponent[];
  onUpdate: (id: string, patch: Record<string, any>) => void;
  onUpdateGeometry?: (id: string, patch: Partial<Pick<DesignComponent, 'x' | 'y' | 'width' | 'height'>>) => void;
  onRemove: (id: string) => void;
  onClose?: () => void;
}

export function getComponentDisplayName(component: DesignComponent) {
  return String(component.props.label || component.props.name || component.fieldBinding || component.type || component.id);
}

export function appendScriptSnippet(current: string, snippet: string) {
  const trimmed = String(current || '').trim();
  return trimmed ? `${trimmed}\n\n${snippet}` : snippet;
}
