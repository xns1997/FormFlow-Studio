import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args) => {
  const [trigger] = args;
  const row = (trigger as any)?.rowData || {};
  const sheet = (trigger as any)?.sheetName || '';
  return { trigger: { event: 'formLoad', timestamp: Date.now() }, rowData: row, sheetName: sheet };
};
