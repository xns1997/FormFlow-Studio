import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, value] = args;
  return { trigger: { event: 'switch', value, timestamp: Date.now() }, value: value ?? props.defaultValue ?? false, fieldName: props.fieldName as string };
};
