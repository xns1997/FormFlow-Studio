import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, idOverride, disOverride] = args;
  const id = (idOverride as string) || (props.componentId as string) || '';
  const dis = (disOverride as boolean) ?? (props.disabled as boolean) ?? false;
  return { trigger: { event: 'setDisabled', componentId: id, disabled: dis, timestamp: Date.now() }, componentId: id, disabled: dis };
};
