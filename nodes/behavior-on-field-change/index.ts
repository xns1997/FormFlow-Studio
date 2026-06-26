import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger] = args;
  const field = (trigger as any)?.fieldName || (props.fieldName as string) || '';
  return { trigger: { event: 'fieldChange', field, timestamp: Date.now() }, oldValue: (trigger as any)?.oldValue, newValue: (trigger as any)?.newValue, fieldName: field };
};
