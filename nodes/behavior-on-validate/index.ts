import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args) => {
  const [trigger, value] = args;
  return { trigger: { event: 'validate', timestamp: Date.now() }, value, isValid: value !== null && value !== undefined && value !== '' };
};
