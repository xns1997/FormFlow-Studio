import { Router } from 'express';
import multer from 'multer';
import type { AuthRequest } from '../middleware/auth';
import {
  consumeStagedUpload, getStagedUpload, listStagedUploads, stageUpload,
} from '../services/upload-staging';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function publicMetadata(record: NonNullable<ReturnType<typeof getStagedUpload>>) {
  return {
    id: record.id,
    originalName: record.originalName,
    storedName: record.storedName,
    size: record.size,
    mimeType: record.mimeType,
    fileType: record.fileType,
    uploadedAt: record.uploadedAt,
    expiresAt: record.expiresAt,
    tenantId: record.tenantId,
    uploadedBy: record.uploadedBy,
    sheets: record.sheets.map(({ data: _data, ...sheet }) => sheet),
  };
}

// MCP 兼容入口：文件只进入操作系统临时目录，成功导入后由导入事务消费。
router.post('/upload', upload.single('file'), (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '没有文件', detail: '请确保表单字段名为 file' });
    const record = stageUpload({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      tenantId: (req as AuthRequest & { tenantId?: string }).tenantId,
      uploadedBy: req.user?.id,
    });
    return res.json(publicMetadata(record));
  } catch (error) {
    return res.status(400).json({ error: '文件解析失败', detail: String(error) });
  }
});

router.get('/', (_req, res) => res.json(listStagedUploads().map(publicMetadata)));

router.get('/:id', (req, res) => {
  try {
    const record = getStagedUpload(req.params.id);
    return record ? res.json(publicMetadata(record)) : res.status(404).json({ error: '文件不存在或已过期' });
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
});

router.get('/:id/raw', (req, res) => {
  try {
    const record = getStagedUpload(req.params.id);
    if (!record) return res.status(404).json({ error: '文件不存在或已过期' });
    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(record.originalName)}`);
    return res.sendFile(record.path);
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
});

router.get('/:id/data', (req, res) => {
  try {
    const record = getStagedUpload(req.params.id);
    if (!record) return res.status(404).json({ error: '文件不存在或已过期' });
    return res.json({
      sheets: record.sheets.map((sheet) => ({ name: sheet.name, data: sheet.data })),
      sheetNames: record.sheets.map((sheet) => sheet.name),
    });
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
});

router.delete('/:id', (req, res) => {
  try {
    consumeStagedUpload(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
});

export { router as fileRouter };
