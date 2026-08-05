import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
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
