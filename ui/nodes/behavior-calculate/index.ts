import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, a, b, c] = args;
  const expr = (props.expression as string) || '';
  let result = 0;
  try {
    const fn = new Function('a', 'b', 'c', `return ${expr}`);
    result = Number(fn(a, b, c));
  } catch { result = 0; }
  return { trigger: { event: 'calculate', expression: expr, result, timestamp: Date.now() }, result };
};
