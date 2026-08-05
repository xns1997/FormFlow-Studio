/**
 * ctx.controls 动态键的单一事实来源。
 *
 * 派生规则（canonical 字段名键）：fieldBinding → props.name → name → id。
 * 旧实现曾用 name → props.name → id 派生（忽略 fieldBinding）；为兼容存量脚本，
 * 旧派生键在可推导、与 canonical/id 不同且未被占用时以 deprecated 别名保留。
 *
 * 构造规则（运行时、编辑器补全与一致性审计共用 planEventControlKeys）：
 * 1. canonical 字段名键按组件数组顺序写入，重复字段名后写覆盖；
 * 2. componentId 别名仅在键未被占用时写入；
 * 3. deprecated 别名仅在可推导、与 canonical/id 不同且未被占用时写入。
 */

/** 运行时与编辑器都能结构兼容的控件最小形状。 */
export interface EventControlComponentLike {
  id: string;
  name?: string;
  fieldBinding?: string;
  props: Record<string, unknown>;
}

export type EventControlKeyKind = 'canonical' | 'id' | 'deprecated';

export interface EventControlKeyAssignment {
  key: string;
  kind: EventControlKeyKind;
  componentIndex: number;
}

export interface EventControlKeyPlan {
  canonical: string;
  id: string;
  legacy?: string;
}

export interface EventControlKeyLintIssue {
  componentId: string;
  key: string;
  kind: 'duplicate-field-name' | 'id-collision';
  message: string;
}

function firstDefined(...values: unknown[]): string {
  for (const candidate of values) {
    if (candidate !== undefined && candidate !== null && String(candidate) !== '') return String(candidate);
  }
  return '';
}

/** 规范字段名键：fieldBinding → props.name → name → id。 */
export function resolveEventControlFieldName(component: EventControlComponentLike): string {
  const propsName = component.props && typeof component.props.name === 'string' ? component.props.name : '';
  return firstDefined(component.fieldBinding, propsName, component.name, component.id) || String(component.id);
}

/** 旧实现字段名键：name → props.name → id（忽略 fieldBinding）。 */
export function resolveLegacyEventControlFieldName(component: EventControlComponentLike): string {
  const propsName = component.props && typeof component.props.name === 'string' ? component.props.name : '';
  return firstDefined(component.name, propsName, component.id) || String(component.id);
}

export function resolveEventControlKeys(component: EventControlComponentLike): EventControlKeyPlan {
  const canonical = resolveEventControlFieldName(component);
  const legacy = resolveLegacyEventControlFieldName(component);
  return {
    canonical,
    id: String(component.id),
    legacy: legacy !== canonical ? legacy : undefined,
  };
}

/**
 * 按上述构造规则生成 controls 键的有序赋值计划。
 * 运行时按该计划写入句柄；一致性审计按同一计划断言键集合与句柄归属。
 */
export function planEventControlKeys(components: readonly EventControlComponentLike[]): EventControlKeyAssignment[] {
  const assignments: EventControlKeyAssignment[] = [];
  const taken = new Set<string>();
  for (let index = 0; index < components.length; index += 1) {
    const canonical = resolveEventControlFieldName(components[index]);
    assignments.push({ key: canonical, kind: 'canonical', componentIndex: index });
    taken.add(canonical);
  }
  for (let index = 0; index < components.length; index += 1) {
    const id = String(components[index].id);
    if (!taken.has(id)) {
      assignments.push({ key: id, kind: 'id', componentIndex: index });
      taken.add(id);
    }
  }
  for (let index = 0; index < components.length; index += 1) {
    const plan = resolveEventControlKeys(components[index]);
    if (plan.legacy && plan.legacy !== plan.id && !taken.has(plan.legacy)) {
      assignments.push({ key: plan.legacy, kind: 'deprecated', componentIndex: index });
      taken.add(plan.legacy);
    }
  }
  return assignments;
}

/** 表单级控件键 lint：重复 canonical 字段名、ID 别名被跳过。 */
export function lintEventControlKeys(components: readonly EventControlComponentLike[]): EventControlKeyLintIssue[] {
  const issues: EventControlKeyLintIssue[] = [];
  const canonicalOwners = new Map<string, string>();
  const taken = new Set<string>();
  for (const component of components) {
    const canonical = resolveEventControlFieldName(component);
    const previous = canonicalOwners.get(canonical);
    if (previous) {
      issues.push({
        componentId: String(component.id),
        key: canonical,
        kind: 'duplicate-field-name',
        message: `重复字段名 "${canonical}"：控件 ${previous}/${component.id} 的 ctx.controls 键后写覆盖`,
      });
    }
    canonicalOwners.set(canonical, String(component.id));
    taken.add(canonical);
  }
  for (const component of components) {
    const id = String(component.id);
    const canonical = resolveEventControlFieldName(component);
    if (canonical !== id && taken.has(id)) {
      issues.push({
        componentId: id,
        key: id,
        kind: 'id-collision',
        message: `控件 ID "${id}" 与字段名键冲突，ctx.controls 的 ID 别名被跳过`,
      });
    }
    taken.add(id);
  }
  return issues;
}
