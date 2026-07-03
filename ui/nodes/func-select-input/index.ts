import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, value, optsOverride] = args;
  const field = (props.fieldName as string) || '';
  const opts = (optsOverride as string[]) || (props.options as string || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  return { trigger: { event: 'select', value, fieldName: field, timestamp: Date.now() }, value: value ?? props.defaultValue ?? '', fieldName: field };
};
