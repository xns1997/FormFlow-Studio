import { Router } from 'express';
import XLSX from 'xlsx';
import { getTableSheetData, readProjectPackage, updateTableSheetData, updateTableSheetsTransaction } from '../services/project-package-store';
import { applyBatchChanges, dataVersion, queryRows, validateConfiguredKeys } from '../services/data-preview';
import { getStagedUpload } from '../services/upload-staging';

const router = Router();

function getStagedSheet(fileId: string, sheetName?: string) {
  const upload = getStagedUpload(fileId);
  if (!upload) return null;
  return upload.sheets.find((sheet) => sheet.name === sheetName) || upload.sheets[0] || null;
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
      const staged = getStagedSheet(req.body.fileId, req.body.sheetName);
      if (!staged) return res.status(404).json({ error: '临时上传不存在或已过期' });
      headers = staged.headers; data = staged.data;
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

// POST /api/data/transaction - 对一个或多个 Sheet 进行版本保护的原子行写回
router.post('/transaction', (req, res) => {
  try {
    const { projectId, targets } = req.body || {};
    if (!projectId || !Array.isArray(targets) || targets.length === 0) return res.status(400).json({ error: '缺少项目或事务目标' });
    const mutationCount = targets.reduce((total: number, target: any) => total + (Array.isArray(target.mutations) ? target.mutations.length : 0), 0);
    if (mutationCount === 0) return res.json({ success: true, committed: false, applied: 0, message: '暂无需要提交的修改' });
    if (mutationCount > 1000) return res.status(400).json({ error: '单次事务最多提交 1000 行变更' });

    const prepared = targets.map((target: any) => {
      const tableId = String(target.tableId || ''); const sheetName = String(target.sheetName || ''); const keyField = String(target.keyField || '');
      const current = getTableSheetData(projectId, tableId, sheetName);
      if (!current) throw new Error(`写回目标 ${tableId}/${sheetName} 不存在`);
      if (!keyField || !current.keyFields.includes(keyField)) throw new Error(`写回目标 ${tableId}/${sheetName} 未配置主键 ${keyField}`);
      const currentVersion = dataVersion(current.data);
      if (target.baseVersion && target.baseVersion !== currentVersion) {
        const conflict = new Error(`数据 ${tableId}/${sheetName} 已被其他操作修改，请重新加载后重试`) as Error & { code?: string; dataVersion?: string };
        conflict.code = 'DATA_VERSION_CONFLICT'; conflict.dataVersion = currentVersion; throw conflict;
      }
      let rows = current.data.map((row) => ({ ...row }));
      for (const mutation of target.mutations || []) {
        const keyValue = mutation.keyValue;
        const index = rows.findIndex((row) => row[keyField] === keyValue);
        const mode = mutation.mode || 'upsert';
        if (mode === 'update' && index < 0) throw new Error(`${tableId}/${sheetName} 中不存在 ${keyField}=${String(keyValue)}`);
        if (mode === 'insert' && index >= 0) throw new Error(`${tableId}/${sheetName} 中已存在 ${keyField}=${String(keyValue)}`);
        if (mode === 'delete') {
          if (index < 0) throw new Error(`${tableId}/${sheetName} 中不存在 ${keyField}=${String(keyValue)}`);
          rows = rows.filter((_row, rowIndex) => rowIndex !== index);
        } else if (index >= 0) rows[index] = { ...rows[index], ...(mutation.row || {}) };
        else rows.push({ ...(mutation.row || {}) });
      }
      validateConfiguredKeys(rows, current.keyFields);
      return { tableId, sheetName, data: rows, dataVersion: currentVersion };
    });

    updateTableSheetsTransaction(projectId, prepared);
    res.json({
      success: true,
      committed: true,
      applied: mutationCount,
      targets: prepared.map((target) => ({ tableId: target.tableId, sheetName: target.sheetName, dataVersion: dataVersion(target.data) })),
    });
  } catch (error) {
    const typed = error as Error & { code?: string; dataVersion?: string };
    res.status(typed.code === 'DATA_VERSION_CONFLICT' ? 409 : 400).json({ error: typed.message, code: typed.code, dataVersion: typed.dataVersion });
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
      const result = getTableSheetData(projectId, fileId, targetSheetName);
      return res.json({ headers, rowCount: result?.data.length || 0, sheetName: targetSheetName, fileId, projectId });
    }

    const staged = getStagedSheet(fileId, sheetName);
    if (!staged) return res.status(404).json({ error: '临时上传不存在或已过期' });
    res.json({ headers: staged.headers, rowCount: staged.rowCount, sheetName: staged.name, fileId });
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

    const cache = getStagedSheet(fileId, sheetName);
    if (!cache) return res.status(404).json({ error: '临时上传不存在或已过期' });
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

    const cache = getStagedSheet(req.params.fileId, req.params.sheetName);
    if (!cache) return res.status(404).json({ error: '临时上传不存在或已过期' });
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

    return res.status(400).json({ error: '临时上传只读；请先导入项目后再编辑' });
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

    return res.status(400).json({ error: '临时上传只读；请先导入项目后再编辑' });
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

    return res.status(400).json({ error: '临时上传只读；请先导入项目后再编辑' });
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
