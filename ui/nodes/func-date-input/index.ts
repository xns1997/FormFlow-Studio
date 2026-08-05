import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [trigger, value] = args;
  return { trigger: { event: 'dateChange', value, timestamp: Date.now() }, value: value ?? props.defaultValue ?? '', fieldName: props.fieldName as string };
};
