import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, fieldOverride, valOverride] = args;
  const field = (fieldOverride as string) || (props.fieldName as string) || '';
  const val = valOverride ?? props.defaultValue ?? '';
  return { trigger: { event: 'setDefault', fieldName: field, value: val, timestamp: Date.now() }, fieldName: field, value: val };
};
