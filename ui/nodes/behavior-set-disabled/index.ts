import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [trigger, idOverride, disOverride] = args;
  const id = (idOverride as string) || (props.componentId as string) || '';
  const dis = (disOverride as boolean) ?? (props.disabled as boolean) ?? false;
  return { trigger: { event: 'setDisabled', componentId: id, disabled: dis, timestamp: Date.now() }, componentId: id, disabled: dis };
};
