import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [override] = args;
  const value = (override as string) ?? (properties.value as string) ?? '';
  return { value };
};
