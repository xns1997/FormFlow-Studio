import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args) => {
  const [trigger] = args;
  const t = (trigger as any) || {};
  return { trigger: { event: 'rowLoad', timestamp: Date.now() }, rowData: t.rowData || {}, rowIndex: t.rowIndex ?? 0 };
};
