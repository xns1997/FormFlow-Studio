import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger] = args;
  return { _stopped: true, reason: (props.reason as string) || '手动中止' };
};
