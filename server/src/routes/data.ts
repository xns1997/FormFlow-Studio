import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import XLSX from 'xlsx';
import { serverDataPath } from '../config/paths';

const router = Router();
const DATA_DIR = serverDataPath('data');
const FILES_DIR = serverDataPath('files');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// POST /api/data/parse - 解析文件并缓存数据
router.post('/parse', (req, res) => {
  try {
    const { fileId, sheetName } = req.body;
    if (!fileId) return res.status(400).json({ error: '缺少 fileId 参数', detail: '请提供 fileId' });

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
    writeFileSync(join(DATA_DIR, `${fileId}_${targetSheet}.json`), JSON.stringify(cache, null, 2));
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
    const dataPath = join(DATA_DIR, `${fileId}_${sheetName}.json`);
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
    const dataPath = join(DATA_DIR, `${req.params.fileId}_${req.params.sheetName}.json`);
    if (!existsSync(dataPath)) return res.status(404).json({ error: '数据不存在' });
    const cache = JSON.parse(readFileSync(dataPath, 'utf-8'));
    const columns = cache.headers.map((h: string, i: number) => {
      const values = cache.data.map((row: Record<string, unknown>) => row[h]);
      const nonEmpty = values.filter((v: unknown) => v !== '' && v !== null && v !== undefined);
      return { name: h, index: i, rowCount: values.length, uniqueCount: new Set(values.map(String)).size, emptyCount: values.length - nonEmpty.length, sampleValues: [...new Set(values.map(String))].filter(Boolean).slice(0, 5) };
    });
    res.json(columns);
  } catch (e) { res.status(500).json({ error: String(e) }); }
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
      res.setHeader('Content-Disposition', `attachment; filename="${fileName || 'export'}.csv"`);
      res.send(XLSX.utils.sheet_to_csv(ws));
    } else {
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName || 'export'}.xlsx"`);
      res.send(Buffer.from(buf));
    }
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export { router as dataRouter };
