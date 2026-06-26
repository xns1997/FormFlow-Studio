import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, value] = args;
  const val = Array.isArray(value) ? value : (props.defaultValue as string || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  return { trigger: { event: 'checkbox', value: val, timestamp: Date.now() }, value: val, fieldName: props.fieldName as string };
};
