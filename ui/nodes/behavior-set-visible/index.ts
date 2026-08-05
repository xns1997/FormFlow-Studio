import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [trigger, idOverride, visOverride] = args;
  const id = (idOverride as string) || (props.componentId as string) || '';
  const vis = (visOverride as boolean) ?? (props.visible as boolean) ?? true;
  return { trigger: { event: 'setVisible', componentId: id, visible: vis, timestamp: Date.now() }, componentId: id, visible: vis };
};
