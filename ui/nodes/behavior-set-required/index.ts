import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [trigger, fieldOverride, reqOverride] = args;
  const field = (fieldOverride as string) || (props.fieldName as string) || '';
  const req = (reqOverride as boolean) ?? (props.required as boolean) ?? true;
  return { trigger: { event: 'setRequired', fieldName: field, required: req, timestamp: Date.now() }, fieldName: field, required: req };
};
