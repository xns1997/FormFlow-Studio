import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [trigger, fieldOverride, valOverride] = args;
  const field = (fieldOverride as string) || (props.fieldName as string) || '';
  const val = valOverride ?? props.defaultValue ?? '';
  return { trigger: { event: 'setDefault', fieldName: field, value: val, timestamp: Date.now() }, fieldName: field, value: val };
};
