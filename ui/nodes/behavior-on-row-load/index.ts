import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args) => {
  const [trigger] = args;
  const t = (trigger as any) || {};
  return { trigger: { event: 'rowLoad', timestamp: Date.now() }, rowData: t.rowData || {}, rowIndex: t.rowIndex ?? 0 };
};
