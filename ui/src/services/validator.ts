import type { ValidationRule, ColumnSchema } from '../models';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateField(value: unknown, rules: ValidationRule[]): string | null {
  for (const rule of rules) {
    const error = applyRule(value, rule);
    if (error) return error;
  }
  return null;
}

function applyRule(value: unknown, rule: ValidationRule): string | null {
  const str = String(value ?? '');
  switch (rule.type) {
    case 'required':
      if (value === null || value === undefined || str === '') return rule.message || '此字段为必填项';
      break;
    case 'email':
      if (str && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return rule.message || '请输入有效的邮箱地址';
      break;
    case 'phone':
      if (str && !/^1\d{10}$/.test(str)) return rule.message || '请输入有效的手机号';
      break;
    case 'number':
      if (str && isNaN(Number(str))) return rule.message || '请输入有效的数字';
      break;
    case 'minLength':
      if (str.length < Number(rule.param)) return rule.message || `最少 ${rule.param} 个字符`;
      break;
    case 'maxLength':
      if (str.length > Number(rule.param)) return rule.message || `最多 ${rule.param} 个字符`;
      break;
    case 'pattern':
      try {
        if (str && !new RegExp(rule.param || '').test(str)) return rule.message || '格式不正确';
      } catch { return rule.message || '正则表达式无效'; }
      break;
  }
  return null;
}

export function inferDataType(values: unknown[]): ColumnSchema['dataType'] {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (nonEmpty.length === 0) return 'unknown';

  const counts = { string: 0, number: 0, date: 0, boolean: 0 };
  for (const v of nonEmpty) {
    if (typeof v === 'boolean') counts.boolean++;
    else if (typeof v === 'number') counts.number++;
    else if (v instanceof Date) counts.date++;
    else {
      const s = String(v);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) counts.date++;
      else if (/^\d+(\.\d+)?$/.test(s)) counts.number++;
      else if (/^(true|false|是|否)$/i.test(s)) counts.boolean++;
      else counts.string++;
    }
  }

  const max = Math.max(counts.number, counts.date, counts.boolean, counts.string);
  if (max === 0) return 'unknown';
  if (counts.number === max) return 'number';
  if (counts.date === max) return 'date';
  if (counts.boolean === max) return 'boolean';
  return 'string';
}

export function inferEnumOptions(values: unknown[]): string[] | undefined {
  const unique = [...new Set(values.map(String).filter(Boolean))];
  if (unique.length > 0 && unique.length <= 20) return unique.sort();
  return undefined;
}

export function validateAllFields(formValues: Record<string, unknown>, columns: Array<{ name: string; required?: boolean; validationRules?: ValidationRule[] }>): ValidationResult {
  const errors: Record<string, string> = {};
  for (const col of columns) {
    const value = formValues[col.name];
    const rules: ValidationRule[] = [];
    if (col.required) rules.push({ type: 'required', message: `${col.name} 为必填项` });
    if (col.validationRules) rules.push(...col.validationRules);
    const error = validateField(value, rules);
    if (error) errors[col.name] = error;
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
