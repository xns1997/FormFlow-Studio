import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [override] = args;
  let value = (override as number) ?? (properties.value as number) ?? 0;
  const min = properties.min as number;
  const max = properties.max as number;
  if (min !== undefined && value < min) value = min;
  if (max !== undefined && value > max) value = max;
  return { value };
};
