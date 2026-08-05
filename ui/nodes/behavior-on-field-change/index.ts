import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [trigger] = args;
  const field = (trigger as any)?.fieldName || (props.fieldName as string) || '';
  return { trigger: { event: 'fieldChange', field, timestamp: Date.now() }, oldValue: (trigger as any)?.oldValue, newValue: (trigger as any)?.newValue, fieldName: field };
};
