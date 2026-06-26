import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [override] = args;
  let value = (override as number) ?? (properties.value as number) ?? 0;
  const min = properties.min as number;
  const max = properties.max as number;
  if (min !== undefined && value < min) value = min;
  if (max !== undefined && value > max) value = max;
  return { value };
};
