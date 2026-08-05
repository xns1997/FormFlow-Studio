import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [trigger, fieldOverride] = args;
  const field = (fieldOverride as string) || (props.fieldName as string) || '';
  return { trigger: { event: 'clearField', fieldName: field, timestamp: Date.now() }, fieldName: field };
};
