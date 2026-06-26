import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [override] = args;
  const value = (override as boolean) ?? (properties.value as boolean) ?? false;
  return { value };
};
