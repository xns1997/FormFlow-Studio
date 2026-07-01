import { Router } from 'express';
import multer from 'multer';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, extname } from 'path';
import XLSX from 'xlsx';
import initSqlJs, { type Database } from 'sql.js';

const router = Router();
const FILES_DIR = join(import.meta.dirname, '..', 'storage', 'files');
const DATA_DIR = join(import.meta.dirname, '..', 'storage', 'data');
if (!existsSync(FILES_DIR)) mkdirSync(FILES_DIR, { recursive: true });
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, FILES_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

function parseExcelFile(filePath: string) {
  const workbook = XLSX.readFile(filePath);
  return {
    sheets: workbook.SheetNames.map((name: string) => {
      const ws = workbook.Sheets[name];
      const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
      return {
        name,
        rowCount: json.length,
        colCount: json.length > 0 ? Object.keys(json[0]).length : 0,
        headers: json.length > 0 ? Object.keys(json[0]) : [],
        data: json,
      };
    }),
  };
}

function parseJsonFile(filePath: string) {
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : parsed.data || parsed.rows || [parsed];
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return {
    sheets: [{
      name: 'Sheet1',
      rowCount: rows.length,
      colCount: headers.length,
      headers,
      data: rows,
    }],
  };
}

async function parseSqliteFile(filePath: string) {
  const SQL = await initSqlJs();
  const buffer = readFileSync(filePath);
  const db = new SQL.Database(buffer);
  const tableResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tableNames: string[] = tableResult.length > 0 ? tableResult[0].values.map((r: any[]) => String(r[0])) : [];
  const sheets = tableNames.map((name) => {
    const rows: Record<string, unknown>[] = [];
    const colResult = db.exec(`PRAGMA table_info("${name}")`);
    const headers: string[] = colResult.length > 0 ? colResult[0].values.map((r: any[]) => String(r[1])) : [];
    const dataResult = db.exec(`SELECT * FROM "${name}" LIMIT 10000`);
    if (dataResult.length > 0) {
      const cols = dataResult[0].columns;
      for (const row of dataResult[0].values) {
        const obj: Record<string, unknown> = {};
        cols.forEach((c: string, i: number) => { obj[c] = row[i]; });
        rows.push(obj);
      }
    }
    return { name, rowCount: rows.length, colCount: headers.length, headers, data: rows };
  });
  db.close();
  return { sheets };
}

// POST /api/files/upload - 上传文件并解析
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '没有文件', detail: '请确保表单字段名为 file' });
    const filePath = req.file.path;
    if (!existsSync(filePath)) return res.status(400).json({ error: '文件写入失败', detail: `路径: ${filePath}` });

    const ext = extname(req.file.originalname).toLowerCase().replace('.', '');
    let parsed: { sheets: Array<{ name: string; rowCount: number; colCount: number; headers: string[]; data: Record<string, unknown>[] }> };

    try {
      if (ext === 'json') {
        parsed = parseJsonFile(filePath);
      } else if (ext === 'db' || ext === 'sqlite' || ext === 'sqlite3') {
        parsed = await parseSqliteFile(filePath);
      } else {
        parsed = parseExcelFile(filePath);
      }
    } catch (err) {
      return res.status(400).json({ error: '文件解析失败', detail: String(err), file: req.file.originalname });
    }

    const fileType = ext === 'json' ? 'json' : (ext === 'db' || ext === 'sqlite' || ext === 'sqlite3') ? 'sqlite' : ext;
    const meta = {
      id: `file_${Date.now()}`,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
      fileType,
      uploadedAt: new Date().toISOString(),
      sheets: parsed.sheets.map((s) => ({
        name: s.name,
        rowCount: s.rowCount,
        colCount: s.colCount,
        headers: s.headers,
      })),
    };

    // 写元数据
    try {
      writeFileSync(join(FILES_DIR, `${meta.id}.meta.json`), JSON.stringify(meta, null, 2));
    } catch (err) {
      return res.status(500).json({ error: '元数据写入失败', detail: String(err) });
    }

    // 缓存解析数据
    for (const sheet of parsed.sheets) {
      const cache = {
        fileId: meta.id,
        sheetName: sheet.name,
        headers: sheet.headers,
        rowCount: sheet.rowCount,
        data: sheet.data,
        parsedAt: new Date().toISOString(),
      };
      writeFileSync(join(DATA_DIR, `${meta.id}_${sheet.name}.json`), JSON.stringify(cache, null, 2));
    }

    res.json(meta);
  } catch (e) {
    console.error('[upload]', e);
    res.status(500).json({ error: '上传处理失败', detail: String(e) });
  }
});

// GET /api/files - 列出所有文件
router.get('/', (_req, res) => {
  try {
    const files = readdirSync(FILES_DIR).filter((f) => f.endsWith('.meta.json'));
    const list = files.map((f) => {
      try { return JSON.parse(readFileSync(join(FILES_DIR, f), 'utf-8')); } catch { return null; }
    }).filter(Boolean);
    res.json(list);
  } catch (e) { res.status(500).json({ error: '列出文件失败', detail: String(e) }); }
});

// GET /api/files/:id - 获取文件元数据
router.get('/:id', (req, res) => {
  try {
    const metaPath = join(FILES_DIR, `${req.params.id}.meta.json`);
    if (!existsSync(metaPath)) return res.status(404).json({ error: '文件不存在', detail: `ID: ${req.params.id}` });
    res.json(JSON.parse(readFileSync(metaPath, 'utf-8')));
  } catch (e) { res.status(500).json({ error: '读取元数据失败', detail: String(e) }); }
});

// GET /api/files/:id/raw - 下载上传时保存的原始文件
router.get('/:id/raw', (req, res) => {
  try {
    const metaPath = join(FILES_DIR, `${req.params.id}.meta.json`);
    if (!existsSync(metaPath)) return res.status(404).json({ error: '文件元数据不存在', detail: `ID: ${req.params.id}` });
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    const filePath = join(FILES_DIR, meta.storedName);
    if (!existsSync(filePath)) return res.status(404).json({ error: '原始文件不存在', detail: `存储名: ${meta.storedName}` });
    res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(meta.originalName || meta.storedName)}`);
    res.sendFile(filePath);
  } catch (e) {
    res.status(500).json({ error: '读取原始文件失败', detail: String(e) });
  }
});

// GET /api/files/:id/data - 读取文件数据
router.get('/:id/data', (req, res) => {
  try {
    const metaPath = join(FILES_DIR, `${req.params.id}.meta.json`);
    if (!existsSync(metaPath)) return res.status(404).json({ error: '文件元数据不存在', detail: `ID: ${req.params.id}` });
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    const filePath = join(FILES_DIR, meta.storedName);
    if (!existsSync(filePath)) return res.status(404).json({ error: '文件不存在', detail: `存储名: ${meta.storedName}` });

    let workbook;
    try {
      workbook = XLSX.readFile(filePath);
    } catch (err) {
      return res.status(500).json({ error: '文件解析失败', detail: String(err) });
    }

    const sheets = workbook.SheetNames.map((name: string) => {
      const ws = workbook.Sheets[name];
      return { name, data: XLSX.utils.sheet_to_json(ws) };
    });
    res.json({ sheets, sheetNames: workbook.SheetNames });
  } catch (e) {
    console.error('[files/data]', e);
    res.status(500).json({ error: '读取文件数据失败', detail: String(e) });
  }
});

// DELETE /api/files/:id - 删除文件
router.delete('/:id', (req, res) => {
  try {
    const metaPath = join(FILES_DIR, `${req.params.id}.meta.json`);
    if (!existsSync(metaPath)) return res.status(404).json({ error: '文件不存在', detail: `ID: ${req.params.id}` });
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    const dataPath = join(FILES_DIR, meta.storedName);
    if (existsSync(dataPath)) unlinkSync(dataPath);
    unlinkSync(metaPath);
    // 同时删除 data 缓存
    const dataFiles = readdirSync(DATA_DIR).filter((f) => f.startsWith(req.params.id));
    for (const f of dataFiles) { unlinkSync(join(DATA_DIR, f)); }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: '删除文件失败', detail: String(e) }); }
});

export { router as fileRouter };
