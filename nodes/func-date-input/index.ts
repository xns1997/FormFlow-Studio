import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, value] = args;
  return { trigger: { event: 'dateChange', value, timestamp: Date.now() }, value: value ?? props.defaultValue ?? '', fieldName: props.fieldName as string };
};
