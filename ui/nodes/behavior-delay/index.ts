import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger] = args;
  const ms = (props.delayMs as number) || 1000;
  return new Promise((resolve) => {
    setTimeout(() => resolve({ trigger: { event: 'delayComplete', delayMs: ms, timestamp: Date.now() } }), ms);
  });
};
