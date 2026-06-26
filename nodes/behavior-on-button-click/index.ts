import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger] = args;
  return { trigger: { event: 'buttonClick', button: (props.buttonName as string) || '', timestamp: Date.now() }, buttonName: props.buttonName as string || '' };
};
