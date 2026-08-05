import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [override] = args;
  const value = (override as string) ?? (properties.value as string) ?? '';
  return { value };
};
