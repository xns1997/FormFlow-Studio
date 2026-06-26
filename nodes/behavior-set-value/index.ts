import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, inputValue, fieldOverride] = args;
  const field = (fieldOverride as string) || (props.fieldName as string) || '';
  const valueType = (props.valueType as string) || 'static';
  let value: unknown;
  if (valueType === 'fromInput') value = inputValue;
  else if (valueType === 'expression') { try { value = new Function('ctx', `return ${props.expression}`)({}); } catch { value = props.expression; } }
  else value = props.staticValue;
  return { trigger: { event: 'setValue', field, value, timestamp: Date.now() }, fieldName: field, value };
};
