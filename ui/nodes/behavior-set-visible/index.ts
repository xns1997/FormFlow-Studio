import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, idOverride, visOverride] = args;
  const id = (idOverride as string) || (props.componentId as string) || '';
  const vis = (visOverride as boolean) ?? (props.visible as boolean) ?? true;
  return { trigger: { event: 'setVisible', componentId: id, visible: vis, timestamp: Date.now() }, componentId: id, visible: vis };
};
