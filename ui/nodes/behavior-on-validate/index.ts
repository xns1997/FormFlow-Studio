import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args) => {
  const [trigger, value] = args;
  return { trigger: { event: 'validate', timestamp: Date.now() }, value, isValid: value !== null && value !== undefined && value !== '' };
};
