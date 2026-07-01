import type { NodeExecutor } from '../types';
import { writeWorksheetRange } from '../xlsx-worksheet-ops';

export const execute: NodeExecutor = (args, props) => {
  const [worksheet, values, addrOverride] = args;
  const addr = (addrOverride as string) || (props.address as string) || 'A1';
  if (!worksheet || !values) return { worksheet };
  return { worksheet: writeWorksheetRange(worksheet, values, addr) };
};
