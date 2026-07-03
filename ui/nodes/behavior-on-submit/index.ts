import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args) => {
  const [trigger] = args;
  return { trigger: { event: 'submit', timestamp: Date.now() }, formData: (trigger as any)?.formData || {} };
};
