import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [trigger, value, optsOverride] = args;
  const field = (props.fieldName as string) || '';
  const opts = (optsOverride as unknown[]) || (Array.isArray(props.options) ? props.options : String(props.options || '').split(',').map((s: string) => s.trim()).filter(Boolean));
  return {
    trigger: { event: 'select', value, fieldName: field, timestamp: Date.now() },
    value: value ?? props.defaultValue ?? '',
    options: opts,
    fieldName: field,
  };
};
