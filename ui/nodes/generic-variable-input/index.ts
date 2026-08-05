import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [override] = args;
  const varName = (properties.varName as string) || 'myVar';
  const varType = (properties.varType as string) || 'string';
  const varValue = properties.varValue;

  const value = override !== undefined && override !== null ? override : varValue;
  return { value, varName, varType };
};
