import { Router } from 'express';
import { mkdirSync, rmSync } from 'fs';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { serverDataPath, PYTHON_EXECUTABLE, pythonServicePath } from '../config/paths';
const router = Router();
router.post('/pdf', (req, res) => {
  const dir = serverDataPath('exports'); mkdirSync(dir, { recursive: true }); const output = `${dir}/${randomUUID()}.pdf`;
  const child = spawn(PYTHON_EXECUTABLE, [pythonServicePath('src', 'pdf_export.py')]); let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
  child.on('error', (error) => res.status(500).json({ error: error.message }));
  child.on('close', (code) => { if (res.headersSent) return; if (code !== 0) return res.status(500).json({ error: errors || 'PDF 生成失败' }); res.download(output, `${String(req.body.title || 'report').replace(/[^\w\u4e00-\u9fa5-]/g, '_')}.pdf`, () => rmSync(output, { force: true })); });
  child.stdin.end(JSON.stringify({ ...req.body, output }));
});
export { router as exportRouter };
