import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const router = Router();
const CONFIGS_DIR = join(import.meta.dirname, '..', 'storage', 'configs');
if (!existsSync(CONFIGS_DIR)) mkdirSync(CONFIGS_DIR, { recursive: true });

// GET /api/configs - 列出所有配置
router.get('/', (_req, res) => {
  try {
    const files = readdirSync(CONFIGS_DIR).filter((f) => f.endsWith('.json'));
    const list = files.map((f) => {
      try {
        const data = JSON.parse(readFileSync(join(CONFIGS_DIR, f), 'utf-8'));
        return { id: f.replace('.json', ''), ...data };
      } catch { return null; }
    }).filter(Boolean);
    res.json(list);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GET /api/configs/:id - 获取配置
router.get('/:id', (req, res) => {
  try {
    const path = join(CONFIGS_DIR, `${req.params.id}.json`);
    if (!existsSync(path)) return res.status(404).json({ error: '配置不存在' });
    res.json(JSON.parse(readFileSync(path, 'utf-8')));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// PUT /api/configs/:id - 保存配置
router.put('/:id', (req, res) => {
  try {
    const config = { ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeFileSync(join(CONFIGS_DIR, `${req.params.id}.json`), JSON.stringify(config, null, 2));
    res.json(config);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// DELETE /api/configs/:id - 删除配置
router.delete('/:id', (req, res) => {
  try {
    const path = join(CONFIGS_DIR, `${req.params.id}.json`);
    if (existsSync(path)) unlinkSync(path);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export { router as configRouter };
