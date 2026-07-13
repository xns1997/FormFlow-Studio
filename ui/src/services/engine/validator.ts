import type { ValidationRule, ColumnSchema } from '../../models';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateField(value: unknown, rules: ValidationRule[], values: Record<string, unknown> = {}): string | null {
  for (const rule of rules) {
    const error = applyRule(value, rule, values);
    if (error) return error;
  }
  return null;
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function isPotentiallyUnsafeRegex(pattern: string) {
  return /\([^)]*[+*][^)]*\)[+*{]/.test(pattern) || /([+*])\1/.test(pattern);
}

function compareValues(left: unknown, right: unknown, operator: ValidationRule['operator']) {
  switch (operator || 'eq') {
    case 'eq': return left === right;
    case 'ne': return left !== right;
    case 'gt': return Number(left) > Number(right);
    case 'gte': return Number(left) >= Number(right);
    case 'lt': return Number(left) < Number(right);
    case 'lte': return Number(left) <= Number(right);
  }
}

function applyRule(value: unknown, rule: ValidationRule, values: Record<string, unknown>): string | null {
  const str = String(value ?? '');
  switch (rule.type) {
    case 'required':
      if (isEmpty(value)) return rule.message || '此字段为必填项';
      break;
    case 'email':
      if (str && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return rule.message || '请输入有效的邮箱地址';
      break;
    case 'phone':
      if (str && !/^1\d{10}$/.test(str)) return rule.message || '请输入有效的手机号';
      break;
    case 'url':
      if (str) { try { const parsed = new URL(str); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); } catch { return rule.message || '请输入有效的 HTTP(S) 地址'; } }
      break;
    case 'idcard':
      if (str && !/^\d{17}[\dXx]$/.test(str)) return rule.message || '请输入有效的身份证号';
      break;
    case 'number':
      if (str && isNaN(Number(str))) return rule.message || '请输入有效的数字';
      break;
    case 'integer':
      if (str && !Number.isInteger(Number(str))) return rule.message || '请输入整数';
      break;
    case 'positive':
      if (str && Number(str) <= 0) return rule.message || '请输入正数';
      break;
    case 'min':
      if (str && Number(str) < Number(rule.param)) return rule.message || `不能小于 ${rule.param}`;
      break;
    case 'max':
      if (str && Number(str) > Number(rule.param)) return rule.message || `不能大于 ${rule.param}`;
      break;
    case 'minLength':
      if (str.length < Number(rule.param)) return rule.message || `最少 ${rule.param} 个字符`;
      break;
    case 'maxLength':
      if (str.length > Number(rule.param)) return rule.message || `最多 ${rule.param} 个字符`;
      break;
    case 'pattern':
      try {
        if (isPotentiallyUnsafeRegex(rule.param || '')) return rule.message || '正则表达式可能造成灾难性回溯';
        if (str && !new RegExp(rule.param || '').test(str)) return rule.message || '格式不正确';
      } catch { return rule.message || '正则表达式无效'; }
      break;
    case 'minSelect':
      if (Array.isArray(value) && value.length < Number(rule.param)) return rule.message || `至少选择 ${rule.param} 项`;
      break;
    case 'maxSelect':
      if (Array.isArray(value) && Number(rule.param) > 0 && value.length > Number(rule.param)) return rule.message || `最多选择 ${rule.param} 项`;
      break;
    case 'date':
      if (str && Number.isNaN(new Date(str).getTime())) return rule.message || '请输入有效日期';
      break;
    case 'compare':
      if (rule.field && !compareValues(value, values[rule.field], rule.operator)) return rule.message || `需要满足与 ${rule.field} 的比较条件`;
      break;
  }
  return null;
}

export function compileComponentValidation(props: Record<string, unknown>): ValidationRule[] {
  const rules: ValidationRule[] = Array.isArray(props.validationRules)
    ? (props.validationRules as ValidationRule[]).map((rule) => ({ ...rule }))
    : [];
  const message = String(props.customMessage || '');
  if (props.required && !rules.some((rule) => rule.type === 'required')) rules.unshift({ type: 'required', message: message || '此字段为必填项' });
  const validator = String(props.validator || 'none');
  if (['email', 'phone', 'url', 'idcard', 'number', 'integer'].includes(validator) && !rules.some((rule) => rule.type === validator)) rules.push({ type: validator as ValidationRule['type'], message });
  if (props.integer && !rules.some((rule) => rule.type === 'integer')) rules.push({ type: 'integer', message });
  if (props.positive && !rules.some((rule) => rule.type === 'positive')) rules.push({ type: 'positive', message });
  if ((validator === 'pattern' || props.pattern) && props.pattern && !rules.some((rule) => rule.type === 'pattern')) rules.push({ type: 'pattern', param: String(props.pattern), message: String(props.patternMessage || message || '格式不正确') });
  if (Number(props.minLength) > 0 && !rules.some((rule) => rule.type === 'minLength')) rules.push({ type: 'minLength', param: String(props.minLength), message });
  if (Number(props.maxLength) > 0 && !rules.some((rule) => rule.type === 'maxLength')) rules.push({ type: 'maxLength', param: String(props.maxLength), message });
  if (props.min !== undefined && props.min !== '' && !rules.some((rule) => rule.type === 'min')) rules.push({ type: 'min', param: String(props.min), message });
  if (props.max !== undefined && props.max !== '' && !rules.some((rule) => rule.type === 'max')) rules.push({ type: 'max', param: String(props.max), message });
  if (Number(props.minSelect) > 0 && !rules.some((rule) => rule.type === 'minSelect')) rules.push({ type: 'minSelect', param: String(props.minSelect), message });
  if (Number(props.maxSelect) > 0 && !rules.some((rule) => rule.type === 'maxSelect')) rules.push({ type: 'maxSelect', param: String(props.maxSelect), message });
  return rules;
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
    const error = validateField(value, rules, formValues);
    if (error) errors[col.name] = error;
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
