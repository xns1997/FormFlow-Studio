import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, value] = args;
  const options = Array.isArray(props.options) ? props.options : [];
  return {
    trigger: { event: 'radio', value, timestamp: Date.now() },
    value: value ?? props.defaultValue ?? '',
    options,
    fieldName: props.fieldName as string,
  };
};
