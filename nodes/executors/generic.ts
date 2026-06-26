import { registerExecutor, type NodeExecContext, type NodeExecResult } from '../executor-registry';
import type { SrcTableEntry } from '../../src/project/types';

function findSheet(tables: SrcTableEntry[], sheetName: string) {
  for (const table of tables) {
    const sheet = table.sheets.find(s => s.name === sheetName) || table.sheets[0];
    if (sheet) return { table, sheet };
  }
  return null;
}

registerExecutor('generic:file-picker', (ctx) => {
  const fileData = ctx.inputs.data || ctx.inputs.file;
  const check = ctx.checkType('file-data', fileData);
  return { data: check.valid ? check.normalized : fileData, name: ctx.inputs.name || '' };
});

registerExecutor('generic:worksheet-select', (ctx) => {
  const { inputs, properties, tables, assertType } = ctx;
  const wb = inputs.workbook;

  // 检查输入是否是 workbook
  const wbCheck = ctx.checkType('workbook', wb);
  if (wbCheck.valid) {
    const wbObj = wbCheck.normalized as any;
    const sheetName = String(properties.sheetName || wbObj.SheetNames[0]);
    const ws = wbObj.Sheets[sheetName];
    assertType('worksheet', ws, 'worksheet');
    return { worksheet: ws, sheetNames: wbObj.SheetNames };
  }

  // 从项目数据加载
  const sheetName = String(properties.sheetName || '');
  const found = findSheet(tables, sheetName);
  if (found) {
    const { table, sheet } = found;
    const ws = { __fromProject: true, tableId: table.id, sheetName: sheet.name, headers: sheet.headers, preview: sheet.preview, rowCount: sheet.rowCount, colCount: sheet.colCount };
    assertType('worksheet', ws, 'worksheet');
    return {
      worksheet: ws,
      sheetNames: table.sheets.map(s => s.name),
      headers: sheet.headers,
    };
  }

  // 回退：检查已有 worksheet 输入
  const wsCheck = ctx.checkType('worksheet', inputs.worksheet);
  return { worksheet: wsCheck.valid ? wsCheck.normalized : inputs.worksheet, sheetNames: [] };
});

registerExecutor('generic:range-select', (ctx) => {
  const { inputs, properties, tables, checkType } = ctx;
  const ws = inputs.worksheet;
  const address = String(inputs.address || properties.address || 'A1');

  // 校验地址格式
  const addrCheck = checkType('address', address);

  const wsAny = ws as any;
  if (wsAny?.__fromProject) {
    const headers: string[] = wsAny.headers || [];
    const preview = wsAny.preview || [];
    return {
      range: { s: { r: 0, c: 0 }, e: { r: preview.length - 1, c: headers.length - 1 } },
      values: preview,
      address: addrCheck.valid ? addrCheck.normalized : address,
      rowCount: preview.length,
      colCount: headers.length,
    };
  }

  return { range: inputs.range, values: inputs.values, address: addrCheck.valid ? addrCheck.normalized : address, rowCount: inputs.rowCount, colCount: inputs.colCount };
});

registerExecutor('generic:variable-input', (ctx) => {
  const value = ctx.inputs.override ?? ctx.properties.varValue ?? '';
  const varType = String(ctx.properties.varType || 'string');
  const check = ctx.checkType(varType, value);
  return { value: check.valid ? check.normalized : value, varName: ctx.properties.varName };
});

registerExecutor('generic:text-input', (ctx) => {
  const raw = ctx.inputs.override ?? ctx.properties.value ?? '';
  const check = ctx.checkType('string', raw);
  return { value: check.valid ? check.normalized : raw };
});

registerExecutor('generic:number-input', (ctx) => {
  const raw = ctx.inputs.override ?? ctx.properties.value ?? 0;
  const check = ctx.checkType('number', raw);
  if (!check.valid) return { value: 0, error: check.error };
  return { value: check.normalized };
});

registerExecutor('generic:boolean-switch', (ctx) => {
  const raw = ctx.inputs.override ?? ctx.properties.value ?? false;
  const check = ctx.checkType('boolean', raw);
  return { value: check.valid ? check.normalized : !!raw };
});

registerExecutor('generic:output-display', (ctx) => {
  return { value: ctx.inputs.value };
});
