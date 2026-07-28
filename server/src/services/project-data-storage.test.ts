import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import XLSX from 'xlsx';

const directory = mkdtempSync(join(tmpdir(), 'formflow-project-data-'));
process.env.FORMFLOW_PROJECTS_DIR = join(directory, 'projects');
process.env.FORMFLOW_DATA_DIR = join(directory, 'server-data');
process.env.FORMFLOW_DATABASE_REQUIRED = 'false';
process.env.FORMFLOW_DATABASE_AUTO_START = 'false';

const {
  commitProject, createEmptyProject, tableFromBuffer,
} = await import('./project-authoring');
const {
  getTableSheetData, projectPackagePath, readProjectPackage, updateTableSheetData, updateTableSheetsTransaction,
} = await import('./project-package-store');

test.after(() => rmSync(directory, { recursive: true, force: true }));

function editableConfig(name: string) {
  return { keyFields: ['id'], readOnly: false, tableName: name, id: name };
}

test('JSON raw source remains authoritative while persisted preview is capped at 100 rows', () => {
  const project = createEmptyProject({ id: 'json_source', name: 'JSON source' });
  const rows = Array.from({ length: 150 }, (_, index) => ({ id: `R-${index}`, value: index }));
  const buffer = Buffer.from(JSON.stringify(rows));
  const table = tableFromBuffer({ id: 'records', fileName: 'records.json', buffer });
  table.sheets[0].config = editableConfig('Sheet1');
  project.srcTable.push(table);
  commitProject(project, [{ fileName: table.fileName, buffer }]);

  const loaded = readProjectPackage(project.config.id)!;
  assert.equal(loaded.srcTable[0].sheets[0].preview.length, 100);
  assert.equal(getTableSheetData(project.config.id, 'records', 'Sheet1')?.data.length, 150);
  assert.deepEqual(JSON.parse(readFileSync(join(projectPackagePath(project.config.id), 'data', 'records.json'), 'utf8')), rows);

  loaded.config.description = 'metadata-only change';
  commitProject(loaded);
  assert.equal(getTableSheetData(project.config.id, 'records', 'Sheet1')?.data.length, 150);
});

test('row updates atomically rewrite raw JSON, hash, row count and bounded preview', () => {
  const rows = Array.from({ length: 125 }, (_, index) => ({ id: `R-${index}`, value: index * 2 }));
  updateTableSheetData('json_source', 'records', 'Sheet1', rows);
  const loaded = readProjectPackage('json_source')!;
  assert.equal(loaded.srcTable[0].sheets[0].rowCount, 125);
  assert.equal(loaded.srcTable[0].sheets[0].preview.length, 100);
  assert.equal(getTableSheetData('json_source', 'records', 'Sheet1')?.data[124]?.value, 248);
  assert.match(loaded.srcTable[0].dataHash, /^[a-f0-9]{64}$/);
});

test('CSV, XLS and XLSX sources are read in full from their original files', () => {
  for (const extension of ['csv', 'xls', 'xlsx'] as const) {
    const project = createEmptyProject({ id: `source_${extension}`, name: extension });
    const rows = Array.from({ length: 105 }, (_, index) => ({ id: `${extension}-${index}`, amount: index }));
    let buffer: Buffer;
    if (extension === 'csv') {
      buffer = Buffer.from(XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows)));
    } else {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Data');
      buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: extension }));
    }
    const table = tableFromBuffer({ id: 'records', fileName: `records.${extension}`, buffer });
    table.sheets[0].config = editableConfig(table.sheets[0].name);
    project.srcTable.push(table);
    commitProject(project, [{ fileName: table.fileName, buffer }]);
    assert.equal(getTableSheetData(project.config.id, table.id, table.sheets[0].name)?.data.length, 105);
    assert.equal(readProjectPackage(project.config.id)?.srcTable[0].sheets[0].preview.length, 100);
  }
});

test('multi-sheet JSON preserves every sheet and failed source replacement restores the old package', () => {
  const project = createEmptyProject({ id: 'multi_json', name: 'multi JSON' });
  const value = { North: [{ id: 'N1', value: 1 }], South: [{ id: 'S1', value: 2 }] };
  const buffer = Buffer.from(JSON.stringify(value));
  const table = tableFromBuffer({ id: 'regions', fileName: 'regions.json', buffer });
  for (const sheet of table.sheets) sheet.config = editableConfig(sheet.name);
  project.srcTable.push(table);
  commitProject(project, [{ fileName: table.fileName, buffer }]);
  assert.equal(getTableSheetData(project.config.id, table.id, 'South')?.data[0]?.id, 'S1');

  const before = readFileSync(join(projectPackagePath(project.config.id), 'data', table.fileName));
  assert.throws(() => commitProject(readProjectPackage(project.config.id)!, [{ fileName: table.fileName }]));
  assert.deepEqual(readFileSync(join(projectPackagePath(project.config.id), 'data', table.fileName)), before);
  assert.equal(existsSync(`${projectPackagePath(project.config.id)}.backup`), false);
});

test('multi-sheet transaction commits all prepared sheets together and rejects invalid targets before writing', () => {
  updateTableSheetsTransaction('multi_json', [
    { tableId: 'regions', sheetName: 'North', data: [{ id: 'N1', value: 10 }] },
    { tableId: 'regions', sheetName: 'South', data: [{ id: 'S1', value: 20 }] },
  ]);
  assert.equal(getTableSheetData('multi_json', 'regions', 'North')?.data[0]?.value, 10);
  assert.equal(getTableSheetData('multi_json', 'regions', 'South')?.data[0]?.value, 20);

  assert.throws(() => updateTableSheetsTransaction('multi_json', [
    { tableId: 'regions', sheetName: 'North', data: [{ id: 'N1', value: 99 }] },
    { tableId: 'missing', sheetName: 'Sheet1', data: [] },
  ]), /表 missing 不存在/);
  assert.equal(getTableSheetData('multi_json', 'regions', 'North')?.data[0]?.value, 10);
});

test('replacement keeps table identity and matching Sheet configuration; deletion removes the raw file', () => {
  const project = readProjectPackage('multi_json')!;
  const existing = project.srcTable[0];
  const replacement = Buffer.from(JSON.stringify({ North: [{ id: 'N2', value: 3 }], South: [{ id: 'S2', value: 4 }] }));
  const table = tableFromBuffer({ id: existing.id, fileName: existing.fileName, buffer: replacement, existingTable: existing });
  assert.equal(table.id, existing.id);
  assert.deepEqual(table.sheets.find((sheet: any) => sheet.name === 'North')?.config.keyFields, existing.sheets.find((sheet: any) => sheet.name === 'North')?.config.keyFields);
  assert.equal(table.sheets.find((sheet: any) => sheet.name === 'North')?.config.readOnly, existing.sheets.find((sheet: any) => sheet.name === 'North')?.config.readOnly);
  project.srcTable = [table];
  commitProject(project, [{ fileName: table.fileName, buffer: replacement }]);
  assert.equal(getTableSheetData('multi_json', table.id, 'South')?.data[0]?.id, 'S2');

  const withoutTable = readProjectPackage('multi_json')!;
  withoutTable.srcTable = [];
  commitProject(withoutTable);
  assert.equal(existsSync(join(projectPackagePath('multi_json'), 'data', table.fileName)), false);
});
