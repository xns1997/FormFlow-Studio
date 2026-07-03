import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, fieldOverride] = args;
  const field = (fieldOverride as string) || (props.fieldName as string) || '';
  return { trigger: { event: 'clearField', fieldName: field, timestamp: Date.now() }, fieldName: field };
};
