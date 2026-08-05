import type { NodeExecutor } from '../types';
import { writeWorksheetRange } from '../xlsx-worksheet-ops';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [worksheet, values, addrOverride] = args;
  const addr = (addrOverride as string) || (props.address as string) || 'A1';
  if (!worksheet || !values) return { worksheet };
  return { worksheet: writeWorksheetRange(worksheet, values, addr) };
};
