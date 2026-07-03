import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [workbook, worksheet, style, addrOverride] = args;
  const wb = workbook as any;
  const ws = worksheet as any || wb?.Sheets?.[wb?.SheetNames?.[0]];
  const addr = (addrOverride as string) || (props.rangeAddress as string) || 'A1';
  const s = style as Record<string, unknown>;

  if (!ws) return { workbook: wb };

  const rangeRef = addr.includes(':') ? addr : addr;
  const match = rangeRef.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
  if (!match) return { workbook: wb };

  const sc = XLSX.utils.decode_col(RegExp.$1);
  const sr = parseInt(RegExp.$2) - 1;
  const ec = RegExp.$3 ? XLSX.utils.decode_col(RegExp.$3) : sc;
  const er = RegExp.$4 ? parseInt(RegExp.$4) - 1 : sr;

  for (let r = sr; r <= er; r++) {
    for (let c = sc; c <= ec; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      const cell = ws[ref];
      if (s.fontName || s.fontSize || s.fontBold || s.fontItalic || s.fontColor) {
        if (!cell.s) cell.s = {};
        if (!cell.s.font) cell.s.font = {};
        if (s.fontName) cell.s.font.name = s.fontName as string;
        if (s.fontSize) cell.s.font.sz = s.fontSize as number;
        if (s.fontBold) cell.s.font.bold = s.fontBold as boolean;
        if (s.fontItalic) cell.s.font.italic = s.fontItalic as boolean;
        if (s.fontColor) cell.s.font.color = { rgb: (s.fontColor as string).replace('#', '') };
      }
      if (s.fillColor && s.fillColor !== '#FFFFFF') {
        if (!cell.s) cell.s = {};
        if (!cell.s.fill) cell.s.fill = {};
        cell.s.fill.fgColor = { rgb: (s.fillColor as string).replace('#', '') };
      }
      if (s.numberFormat && s.numberFormat !== 'General') {
        if (!cell.s) cell.s = {};
        cell.s.numFmt = s.numberFormat as string;
      }
      if (s.horizontalAlign || s.verticalAlign || s.wrapText) {
        if (!cell.s) cell.s = {};
        if (!cell.s.alignment) cell.s.alignment = {};
        if (s.horizontalAlign) cell.s.alignment.horizontal = (s.horizontalAlign as string).toLowerCase();
        if (s.verticalAlign) cell.s.alignment.vertical = (s.verticalAlign as string).toLowerCase();
        if (s.wrapText) cell.s.alignment.wrapText = true;
      }
    }
  }

  return { workbook: wb };
};

import * as XLSX from 'xlsx';
