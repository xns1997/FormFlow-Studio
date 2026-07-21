import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import XLSX from 'xlsx';
import { serverDataPath } from '../config/paths';
import { getTableSheetData, readProjectPackage, updateTableSheetData } from '../services/project-package-store';
import { applyBatchChanges, dataVersion, queryRows, validateConfiguredKeys } from '../services/data-preview';

const router = Router();
const DATA_DIR = serverDataPath('data');
const FILES_DIR = serverDataPath('files');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function getCachePath(fileId: string, sheetName: string, projectId?: string) {
  const prefix = projectId ? `${projectId}__${fileId}` : fileId;
  return join(DATA_DIR, `${prefix}_${sheetName}.json`);
}

function attachmentHeader(fileName: string, extension: string) {
  const raw = `${fileName || 'export'}.${extension}`;
  const fallback = raw.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(raw)}`;
}

function getProjectSheet(projectId: string, tableId: string, sheetName?: string) {
  const project = readProjectPackage(projectId);
  if (!project) return null;
  const table = (project.srcTable || []).find((entry: Record<string, any>) => entry.id === tableId);
  if (!table) return null;
  const sheet = sheetName
    ? (table.sheets || []).find((entry: Record<string, any>) => entry.name === sheetName)
    : table.sheets?.[0];
  if (!sheet) return null;
  return { project, table, sheet };
}

function buildColumns(headers: string[], data: Record<string, unknown>[]) {
  return headers.map((header, index) => {
    const values = data.map((row) => row[header]);
    const nonEmpty = values.filter((value) => value !== '' && value !== null && value !== undefined);
    return {
      name: header,
      index,
      rowCount: values.length,
      uniqueCount: new Set(values.map(String)).size,
      emptyCount: values.length - nonEmpty.length,
      sampleValues: [...new Set(values.map(String))].filter(Boolean).slice(0, 5),
    };
  });
}

// POST /api/data/paginated - 项目表或已解析文件的统一分页入口
router.post('/paginated', (req, res) => {
  try {
    let headers: string[] = []; let data: Record<string, unknown>[] = []; let keyFields: string[] = [];
    if (req.body.projectId) {
      const result = getTableSheetData(req.body.projectId, req.body.tableId || req.body.fileId, req.body.sheetName);
      if (!result) return res.status(404).json({ error: '项目数据不存在' });
      headers = result.headers; data = result.data; keyFields = result.keyFields;
    } else {
      const path = getCachePath(req.body.fileId, req.body.sheetName);
      if (!existsSync(path)) return res.status(404).json({ error: '数据不存在' });
      const cache = JSON.parse(readFileSync(path, 'utf8')); headers = cache.headers || []; data = cache.data || [];
    }
    res.json({
      headers,
      ...queryRows({
        rows: data,
        headers,
        keyFields,
        page: req.body.page,
        pageSize: req.body.pageSize,
        search: req.body.search,
        keySearch: req.body.keySearch,
        sortModel: req.body.sortModel,
        filterModel: req.body.filterModel,
      }),
    });
  } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : String(error) }); }
});

// POST /api/data/batch - 使用稳定 rowKey 原子应用跨页变更
router.post('/batch', (req, res) => {
  try {
    const { projectId, tableId, sheetName, baseVersion, adds, updates, deletes } = req.body || {};
    if (!projectId || !tableId || !sheetName) return res.status(400).json({ error: '缺少项目、数据表或 Sheet 参数' });
    const result = getTableSheetData(projectId, tableId, sheetName);
    if (!result) return res.status(404).json({ error: '项目数据不存在' });
    const currentVersion = dataVersion(result.data);
    if (baseVersion && baseVersion !== currentVersion) {
      return res.status(409).json({ error: '数据已被其他操作修改，请重新加载后重试', code: 'DATA_VERSION_CONFLICT', dataVersion: currentVersion });
    }
    const next = applyBatchChanges(result.data, result.keyFields, { adds, updates, deletes });
    validateConfiguredKeys(next, result.keyFields);
    updateTableSheetData(projectId, tableId, sheetName, next);
    res.json({
      success: true,
      total: next.length,
      dataVersion: dataVersion(next),
      applied: { adds: adds?.length || 0, updates: updates?.length || 0, deletes: deletes?.length || 0 },
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// POST /api/data/export-query - 导出服务端筛选和排序后的完整结果
router.post('/export-query', (req, res) => {
  try {
    const { projectId, tableId, sheetName, search, keySearch, sortModel, filterModel, format, fileName } = req.body || {};
    const result = getTableSheetData(projectId, tableId, sheetName);
    if (!result) return res.status(404).json({ error: '项目数据不存在' });
    const queried = queryRows({ rows: result.data, headers: result.headers, keyFields: result.keyFields, search, keySearch, sortModel, filterModel, page: 1, pageSize: result.data.length || 1, maxPageSize: result.data.length || 1 });
    const rows = queried.rows.map(({ __rowKey: _key, __rowIndex: _index, ...row }) => row);
    const ws = XLSX.utils.json_to_sheet(rows, { header: result.headers });
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', attachmentHeader(fileName, 'csv'));
      return res.send(`\ufeff${XLSX.utils.sheet_to_csv(ws)}`);
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', attachmentHeader(fileName, 'xlsx'));
    return res.send(Buffer.from(buffer));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// POST /api/data/parse - 解析文件并缓存数据
router.post('/parse', (req, res) => {
  try {
    const { fileId, sheetName, projectId } = req.body;
    if (!fileId) return res.status(400).json({ error: '缺少 fileId 参数', detail: '请提供 fileId' });

    if (projectId) {
      const source = getProjectSheet(projectId, fileId, sheetName);
      if (!source) return res.status(404).json({ error: '项目表不存在', detail: `项目: ${projectId}, 表: ${fileId}, Sheet: ${sheetName || '(默认)'}` });
      const targetSheetName = String(source.sheet.name);
      const headers = Array.isArray(source.sheet.headers) ? source.sheet.headers : [];
      const data = Array.isArray(source.sheet.preview) ? source.sheet.preview : [];
      const cache = {
        projectId,
        fileId,
        sheetName: targetSheetName,
        headers,
        rowCount: data.length,
        data,
        parsedAt: new Date().toISOString(),
      };
      writeFileSync(getCachePath(fileId, targetSheetName, projectId), JSON.stringify(cache, null, 2));
      return res.json({ headers, rowCount: data.length, sheetName: targetSheetName, fileId, projectId });
    }

    const metaPath = join(FILES_DIR, `${fileId}.meta.json`);
    if (!existsSync(metaPath)) return res.status(404).json({ error: '文件不存在', detail: `ID: ${fileId}, 期望路径: ${metaPath}` });

    let meta;
    try { meta = JSON.parse(readFileSync(metaPath, 'utf-8')); } catch { return res.status(500).json({ error: '元数据解析失败', detail: metaPath }); }

    const filePath = join(FILES_DIR, meta.storedName);
    if (!existsSync(filePath)) return res.status(404).json({ error: '存储文件不存在', detail: `存储名: ${meta.storedName}` });

    let workbook;
    try { workbook = XLSX.readFile(filePath); } catch { return res.status(500).json({ error: 'Excel 解析失败', detail: filePath }); }

    const targetSheet = sheetName || workbook.SheetNames[0];
    const ws = workbook.Sheets[targetSheet];
    if (!ws) return res.status(404).json({ error: 'Sheet 不存在', detail: `Sheet: ${targetSheet}, 可用: ${workbook.SheetNames.join(', ')}` });

    const jsonData = XLSX.utils.sheet_to_json(ws);
    const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
    const cache = { fileId, sheetName: targetSheet, headers, rowCount: jsonData.length, data: jsonData, parsedAt: new Date().toISOString() };
    writeFileSync(getCachePath(fileId, targetSheet), JSON.stringify(cache, null, 2));
    res.json({ headers, rowCount: jsonData.length, sheetName: targetSheet, fileId });
  } catch (e) {
    console.error('[parse]', e);
    res.status(500).json({ error: '解析失败', detail: String(e) });
  }
});

// GET /api/data/:fileId/:sheetName/rows - 分页获取行数据
router.get('/:fileId/:sheetName/rows', (req, res) => {
  try {
    const { fileId, sheetName } = req.params;
    const projectId = req.query.projectId as string | undefined;
    if (projectId) {
      const result = getTableSheetData(projectId, fileId, sheetName);
      if (!result) {
        return res.status(404).json({ error: '项目数据不存在', detail: `项目: ${projectId}, 表: ${fileId}, Sheet: ${sheetName}` });
      }
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 100;
      const start = (page - 1) * pageSize;
      const rows = result.data.slice(start, start + pageSize);
      return res.json({ rows, total: result.data.length, page, pageSize, totalPages: Math.ceil(result.data.length / pageSize) });
    }

    const dataPath = getCachePath(fileId, sheetName);
    if (!existsSync(dataPath)) {
      const cached = readdirSync(DATA_DIR).filter((f) => f.startsWith(fileId));
      return res.status(404).json({ error: '数据不存在', detail: `文件: ${fileId}, Sheet: ${sheetName}`, cachedFiles: cached });
    }
    const cache = JSON.parse(readFileSync(dataPath, 'utf-8'));
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 100;
    const start = (page - 1) * pageSize;
    const rows = cache.data.slice(start, start + pageSize);
    res.json({ rows, total: cache.data.length, page, pageSize, totalPages: Math.ceil(cache.data.length / pageSize) });
  } catch (e) {
    console.error('[rows]', e);
    res.status(500).json({ error: '读取行数据失败', detail: String(e) });
  }
});

// GET /api/data/:fileId/:sheetName/columns - 获取列信息
router.get('/:fileId/:sheetName/columns', (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    if (projectId) {
      const result = getTableSheetData(projectId, req.params.fileId, req.params.sheetName);
      if (!result) return res.status(404).json({ error: '项目数据不存在' });
      return res.json(buildColumns(result.headers, result.data));
    }

    const dataPath = getCachePath(req.params.fileId, req.params.sheetName);
    if (!existsSync(dataPath)) return res.status(404).json({ error: '数据不存在' });
    const cache = JSON.parse(readFileSync(dataPath, 'utf-8'));
    res.json(buildColumns(cache.headers, cache.data));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/data/:fileId/:sheetName/rows - 新增行
router.post('/:fileId/:sheetName/rows', (req, res) => {
  try {
    const { fileId, sheetName } = req.params;
    const newRow = req.body;
    if (!newRow || typeof newRow !== 'object') return res.status(400).json({ error: '无效的行数据' });

    const projectId = (req.query.projectId as string | undefined) || (req.body?.projectId as string | undefined);
    if (projectId) {
      const result = getTableSheetData(projectId, fileId, sheetName);
      if (!result) return res.status(404).json({ error: '项目数据不存在' });
      const next = [...result.data, newRow];
      updateTableSheetData(projectId, fileId, sheetName, next);
      return res.json({ success: true, rowIndex: next.length - 1, total: next.length });
    }

    const dataPath = getCachePath(fileId, sheetName);
    if (!existsSync(dataPath)) return res.status(404).json({ error: '数据不存在' });

    const cache = JSON.parse(readFileSync(dataPath, 'utf-8'));

    cache.data.push(newRow);
    cache.rowCount = cache.data.length;
    writeFileSync(dataPath, JSON.stringify(cache, null, 2));

    res.json({ success: true, rowIndex: cache.data.length - 1, total: cache.data.length });
  } catch (e) {
    console.error('[add-row]', e);
    res.status(500).json({ error: '新增行失败', detail: String(e) });
  }
});

// PUT /api/data/:fileId/:sheetName/rows/:rowIdx - 更新行
router.put('/:fileId/:sheetName/rows/:rowIdx', (req, res) => {
  try {
    const { fileId, sheetName, rowIdx } = req.params;
    const patch = req.body;
    if (!patch || typeof patch !== 'object') return res.status(400).json({ error: '无效的更新数据' });
    const idx = parseInt(rowIdx);

    const projectId = (req.query.projectId as string | undefined) || (req.body?.projectId as string | undefined);
    if (projectId) {
      const result = getTableSheetData(projectId, fileId, sheetName);
      if (!result) return res.status(404).json({ error: '项目数据不存在' });
      if (isNaN(idx) || idx < 0 || idx >= result.data.length) return res.status(400).json({ error: '无效的行索引' });
      const next = [...result.data];
      next[idx] = { ...next[idx], ...patch };
      updateTableSheetData(projectId, fileId, sheetName, next);
      return res.json({ success: true, rowIndex: idx, row: next[idx] });
    }

    const dataPath = getCachePath(fileId, sheetName);
    if (!existsSync(dataPath)) return res.status(404).json({ error: '数据不存在' });

    const cache = JSON.parse(readFileSync(dataPath, 'utf-8'));
    if (isNaN(idx) || idx < 0 || idx >= cache.data.length) return res.status(400).json({ error: '无效的行索引' });

    cache.data[idx] = { ...cache.data[idx], ...patch };
    writeFileSync(dataPath, JSON.stringify(cache, null, 2));

    res.json({ success: true, rowIndex: idx, row: cache.data[idx] });
  } catch (e) {
    console.error('[update-row]', e);
    res.status(500).json({ error: '更新行失败', detail: String(e) });
  }
});

// DELETE /api/data/:fileId/:sheetName/rows/:rowIdx - 删除行
router.delete('/:fileId/:sheetName/rows/:rowIdx', (req, res) => {
  try {
    const { fileId, sheetName, rowIdx } = req.params;
    const idx = parseInt(rowIdx);
    const projectId = (req.query.projectId as string | undefined) || (req.body?.projectId as string | undefined);
    if (projectId) {
      const result = getTableSheetData(projectId, fileId, sheetName);
      if (!result) return res.status(404).json({ error: '项目数据不存在' });
      if (isNaN(idx) || idx < 0 || idx >= result.data.length) return res.status(400).json({ error: '无效的行索引' });
      const next = result.data.filter((_, index) => index !== idx);
      updateTableSheetData(projectId, fileId, sheetName, next);
      return res.json({ success: true, rowIndex: idx, total: next.length });
    }

    const dataPath = getCachePath(fileId, sheetName);
    if (!existsSync(dataPath)) return res.status(404).json({ error: '数据不存在' });

    const cache = JSON.parse(readFileSync(dataPath, 'utf-8'));
    if (isNaN(idx) || idx < 0 || idx >= cache.data.length) return res.status(400).json({ error: '无效的行索引' });

    cache.data.splice(idx, 1);
    cache.rowCount = cache.data.length;
    writeFileSync(dataPath, JSON.stringify(cache, null, 2));

    res.json({ success: true, rowIndex: idx, total: cache.data.length });
  } catch (e) {
    console.error('[delete-row]', e);
    res.status(500).json({ error: '删除行失败', detail: String(e) });
  }
});

// POST /api/data/export - 导出数据
router.post('/export', (req, res) => {
  try {
    const { data, format, fileName } = req.body;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', attachmentHeader(fileName, 'csv'));
      res.send(XLSX.utils.sheet_to_csv(ws));
    } else {
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', attachmentHeader(fileName, 'xlsx'));
      res.send(Buffer.from(buf));
    }
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export { router as dataRouter };
