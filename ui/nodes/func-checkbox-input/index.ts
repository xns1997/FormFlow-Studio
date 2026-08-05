import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [trigger, value] = args;
  const defaultValue = Array.isArray(props.defaultValue)
    ? props.defaultValue
    : String(props.defaultValue ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const val = Array.isArray(value) ? value : defaultValue;
  const options = Array.isArray(props.options) ? props.options : [];
  return {
    trigger: { event: 'checkbox', value: val, timestamp: Date.now() },
    value: val,
    options,
    fieldName: props.fieldName as string,
  };
};
