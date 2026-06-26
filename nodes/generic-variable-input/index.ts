import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [override] = args;
  const varName = (properties.varName as string) || 'myVar';
  const varType = (properties.varType as string) || 'string';
  const varValue = properties.varValue;

  const value = override !== undefined && override !== null ? override : varValue;
  return { value, varName, varType };
};
