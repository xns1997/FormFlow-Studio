import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, a, b, c] = args;
  const expr = (props.expression as string) || '';
  const targetField = String(props.targetField || '');
  let result: unknown = null;
  try {
    const inputs = { trigger, a, b, c };
    const fn = new Function('inputs', 'properties', 'a', 'b', 'c', `return ${expr}`);
    result = fn(inputs, props, a, b, c);
  } catch { result = null; }
  return {
    trigger,
    targetField,
    result,
    value: result,
    sideEffects: targetField ? [{ kind: 'set-form-value', field: targetField, value: result }] : [],
  };
};
