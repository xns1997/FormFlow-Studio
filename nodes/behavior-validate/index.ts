import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, value, fieldOverride] = args;
  const rule = (props.rule as string) || 'required';
  const param = (props.ruleParam as string) || '';
  const errMsg = (props.errorMessage as string) || `${fieldOverride || props.fieldName} 校验失败`;
  let passed = true;
  switch (rule) {
    case 'required': passed = value !== null && value !== undefined && value !== ''; break;
    case 'email': passed = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)); break;
    case 'phone': passed = /^1\d{10}$/.test(String(value)); break;
    case 'number': passed = !isNaN(Number(value)); break;
    case 'minLength': passed = String(value).length >= Number(param); break;
    case 'maxLength': passed = String(value).length <= Number(param); break;
    case 'pattern': try { passed = new RegExp(param).test(String(value)); } catch { passed = false; } break;
  }
  return { passed: passed ? { event: 'validatePassed', timestamp: Date.now() } : undefined, failed: !passed ? { event: 'validateFailed', errorMessage: errMsg, timestamp: Date.now() } : undefined, errorMessage: passed ? '' : errMsg };
};
