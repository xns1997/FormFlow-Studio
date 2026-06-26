import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, value, compareOverride] = args;
  const op = (props.operator as string) || '==';
  const cv = compareOverride ?? props.compareValue ?? '';
  let result = false;
  switch (op) {
    case '==': result = value == cv; break;
    case '!=': result = value != cv; break;
    case '>': result = Number(value) > Number(cv); break;
    case '<': result = Number(value) < Number(cv); break;
    case '>=': result = Number(value) >= Number(cv); break;
    case '<=': result = Number(value) <= Number(cv); break;
    case 'contains': result = String(value).includes(String(cv)); break;
    case 'notContains': result = !String(value).includes(String(cv)); break;
    case 'isEmpty': result = value === null || value === undefined || value === ''; break;
    case 'isNotEmpty': result = value !== null && value !== undefined && value !== ''; break;
    case 'regex': try { result = new RegExp(String(cv)).test(String(value)); } catch { result = false; } break;
  }
  return { 'true': result ? { event: 'conditionTrue', timestamp: Date.now() } : undefined, 'false': !result ? { event: 'conditionFalse', timestamp: Date.now() } : undefined, value };
};
