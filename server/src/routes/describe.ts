import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { PYTHON_EXECUTABLE, pythonServicePath, serverDataPath } from '../config/paths';

const router = Router();
const FILES_DIR = serverDataPath('files');
const REPORTS_DIR = serverDataPath('reports');
if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

const PYTHON = PYTHON_EXECUTABLE;
const DESCRIBE_SCRIPT = pythonServicePath('src', 'describe.py');

// GET /api/describe/:fileId - 获取数据描述报告（带缓存）
router.get('/:fileId', (req, res) => {
  try {
    const { fileId } = req.params;
    const sheetName = req.query.sheet as string || undefined;
    const cacheKey = sheetName ? `${fileId}_${sheetName}` : fileId;
    const reportPath = join(REPORTS_DIR, `${cacheKey}.json`);

    if (existsSync(reportPath)) {
      const cached = JSON.parse(readFileSync(reportPath, 'utf-8'));
      return res.json(cached);
    }

    const metaPath = join(FILES_DIR, `${fileId}.meta.json`);
    if (!existsSync(metaPath)) {
      return res.status(404).json({ error: '文件不存在', detail: `ID: ${fileId}` });
    }
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    const filePath = join(FILES_DIR, meta.storedName);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: '存储文件不存在', detail: meta.storedName });
    }

    try {
      const sheetArg = sheetName ? ` "${sheetName}"` : '';
      const cmd = `"${PYTHON}" "${DESCRIBE_SCRIPT}" "${filePath}"${sheetArg}`;
      const output = execSync(cmd, { timeout: 30000, encoding: 'utf-8' });
      const report = JSON.parse(output);
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      res.json(report);
    } catch (err: any) {
      console.error('[describe]', err.message);
      res.status(500).json({ error: '数据分析失败', detail: err.message });
    }
  } catch (e) {
    console.error('[describe]', e);
    res.status(500).json({ error: '描述请求失败', detail: String(e) });
  }
});

// GET /api/describe/:fileId/cache - 检查缓存状态
router.get('/:fileId/cache', (req, res) => {
  try {
    const { fileId } = req.params;
    const sheetName = req.query.sheet as string || undefined;
    const cacheKey = sheetName ? `${fileId}_${sheetName}` : fileId;
    const reportPath = join(REPORTS_DIR, `${cacheKey}.json`);
    res.json({ cached: existsSync(reportPath), cacheKey });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/describe/:fileId - 清除缓存
router.delete('/:fileId', (req, res) => {
  try {
    const { fileId } = req.params;
    const files = readdirSync(REPORTS_DIR).filter((f) => f.startsWith(fileId));
    for (const f of files) {
      const path = join(REPORTS_DIR, f);
      if (existsSync(path)) unlinkSync(path);
    }
    res.json({ success: true, deleted: files.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export { router as describeRouter };
