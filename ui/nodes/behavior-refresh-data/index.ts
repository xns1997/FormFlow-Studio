import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args) => {
  const [trigger] = args;
  return { trigger: { event: 'refreshData', timestamp: Date.now() } };
};
