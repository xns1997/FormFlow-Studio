import type { ControlDef, PropSchemaEntry } from '../types';
import { isCompositePropDef } from '../types';

export type SchemaLintIssue = { control: string; key?: string; severity: 'error' | 'warning'; message: string };

/** Static guardrails for humane property schemas; it intentionally does not validate project data. */
export function lintControlSchema(control: ControlDef): SchemaLintIssue[] {
  const issues: SchemaLintIssue[] = [];
  const seen = new Set<string>();
  const entries = (control.propSchema || []) as PropSchemaEntry[];
  for (const def of entries) {
    const keys = isCompositePropDef(def) ? [def.key, ...def.keys] : [def.key];
    for (const key of keys) {
      if (seen.has(key)) issues.push({ control: control.type, key, severity: 'error', message: '属性 key 重复，保存时会产生歧义' });
      seen.add(key);
    }
    if (!def.label.trim()) issues.push({ control: control.type, key: def.key, severity: 'error', message: '属性必须有面向用户的标签' });
    if (!isCompositePropDef(def) && def.type === 'number') {
      if (def.min !== undefined && def.max !== undefined && def.min > def.max) issues.push({ control: control.type, key: def.key, severity: 'error', message: '最小值不能大于最大值' });
      if (def.step !== undefined && def.step <= 0) issues.push({ control: control.type, key: def.key, severity: 'error', message: '步长必须大于 0' });
      if (typeof def.default === 'number' && ((def.min !== undefined && def.default < def.min) || (def.max !== undefined && def.default > def.max))) issues.push({ control: control.type, key: def.key, severity: 'error', message: '默认值必须落在允许范围内' });
    }
    if (!isCompositePropDef(def) && def.type === 'select') {
      const values = (def.options || []).map((option) => String(option.value));
      if (new Set(values).size !== values.length) issues.push({ control: control.type, key: def.key, severity: 'error', message: '选项值不能重复' });
      if ((def.options || []).some((option) => !String(option.label).trim())) issues.push({ control: control.type, key: def.key, severity: 'error', message: '选项必须有可读标签' });
    }
    if (def.editor === 'json' && def.level !== 'advanced' && def.group !== '数据') issues.push({ control: control.type, key: def.key, severity: 'warning', message: 'JSON 配置应默认放入高级设置或提供表单向导' });
  }
  return issues;
}

export function lintControlSchemas(controls: ControlDef[]) {
  return controls.flatMap(lintControlSchema);
}
