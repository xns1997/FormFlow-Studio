import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [worksheet, cellAddr, contentOverride] = args;
  const ws = worksheet as any;
  const addr = (cellAddr as string) || (props.cellAddress as string) || 'A1';
  const content = (contentOverride as string) || (props.content as string) || '';
  const author = (props.author as string) || '';
  if (!ws) return { worksheet: ws };

  XLSX.utils.cell_add_comment(ws[addr] || (ws[addr] = { t: 's', v: '' }), content, { a: author });
  return { worksheet: ws };
};
