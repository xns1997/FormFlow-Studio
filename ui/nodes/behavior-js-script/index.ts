import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, context] = args;
  const script = (props.script as string) || '';
  let result: unknown = null;
  try {
    const ctx = context || {};
    const fn = new Function('ctx', 'trigger', script);
    result = fn(ctx, trigger);
  } catch (e) { result = { error: String(e) }; }
  return { trigger: { event: 'scriptExecuted', timestamp: Date.now() }, result };
};
