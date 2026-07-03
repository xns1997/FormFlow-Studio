import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [workbook, structOverride, passOverride] = args;
  const wb = workbook as any;
  const protectStruct = (structOverride as boolean) ?? (props.protectStructure as boolean) ?? true;
  const password = (passOverride as string) || (props.password as string) || '';
  if (!wb) return { workbook: wb };

  if (!wb.Workbook) wb.Workbook = {};
  wb.Workbook.Protection = {
    lockStructure: protectStruct,
    lockWindows: props.protectWindows as boolean ?? false,
    password: password || undefined,
  };
  return { workbook: wb };
};
