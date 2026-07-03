import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [override] = args;
  const base = override && typeof override === 'object' ? override as Record<string, unknown> : {};
  return {
    style: {
      fontName: base.fontName ?? props.fontName ?? 'Calibri',
      fontSize: base.fontSize ?? props.fontSize ?? 11,
      fontBold: base.fontBold ?? props.fontBold ?? false,
      fontItalic: base.fontItalic ?? props.fontItalic ?? false,
      fontColor: base.fontColor ?? props.fontColor ?? '#000000',
      fillColor: base.fillColor ?? props.fillColor ?? '#FFFFFF',
      borderStyle: base.borderStyle ?? props.borderStyle ?? 'None',
      borderColor: base.borderColor ?? props.borderColor ?? '#000000',
      horizontalAlign: base.horizontalAlign ?? props.horizontalAlign ?? 'General',
      verticalAlign: base.verticalAlign ?? props.verticalAlign ?? 'Bottom',
      wrapText: base.wrapText ?? props.wrapText ?? false,
      numberFormat: base.numberFormat ?? props.numberFormat ?? 'General',
      indentLevel: base.indentLevel ?? props.indentLevel ?? 0,
    },
  };
};
