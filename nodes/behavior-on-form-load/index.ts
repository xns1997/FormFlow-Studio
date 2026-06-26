import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args) => {
  const [trigger] = args;
  const row = (trigger as any)?.rowData || {};
  const sheet = (trigger as any)?.sheetName || '';
  return { trigger: { event: 'formLoad', timestamp: Date.now() }, rowData: row, sheetName: sheet };
};
