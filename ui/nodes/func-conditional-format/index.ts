import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [worksheet, addrOverride, ruleOverride, valOverride] = args;
  const ws = worksheet as any;
  const addr = (addrOverride as string) || (props.rangeAddress as string) || 'A1';
  const ruleType = (ruleOverride as string) || (props.ruleType as string) || 'cellValue';
  const value1 = (valOverride as string) || (props.value1 as string) || '0';
  if (!ws) return { worksheet: ws };

  if (!ws['!conditionalFormatting']) ws['!conditionalFormatting'] = [];
  ws['!conditionalFormatting'].push({
    sqref: addr,
    rules: [{
      type: ruleType,
      operator: (props.operator as string) || 'greaterThan',
      value: value1,
      value2: (props.value2 as string) || '100',
      fill: { fgColor: { rgb: ((props.fillColor as string) || '#FFC7CE').replace('#', '') } },
      font: { color: { rgb: ((props.fontColor as string) || '#9C0006').replace('#', '') } },
    }],
  });

  return { worksheet: ws };
};
