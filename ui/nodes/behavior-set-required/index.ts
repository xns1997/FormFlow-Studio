import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, fieldOverride, reqOverride] = args;
  const field = (fieldOverride as string) || (props.fieldName as string) || '';
  const req = (reqOverride as boolean) ?? (props.required as boolean) ?? true;
  return { trigger: { event: 'setRequired', fieldName: field, required: req, timestamp: Date.now() }, fieldName: field, required: req };
};
