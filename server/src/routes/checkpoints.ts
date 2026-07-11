import { Router } from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { serverDataPath } from '../config/paths';

const router = Router();
const dir = serverDataPath('checkpoints');

router.post('/', (req, res) => {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: '缺少 id' });
    writeFileSync(`${dir}/${id}.json`, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.get('/:id', (req, res) => {
  try {
    const path = `${dir}/${req.params.id}.json`;
    if (!existsSync(path)) return res.status(404).json({ error: '检查点不存在' });
    res.json(JSON.parse(readFileSync(path, 'utf8')));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.delete('/:id', (req, res) => {
  try {
    const path = `${dir}/${req.params.id}.json`;
    if (existsSync(path)) unlinkSync(path);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export { router as checkpointRouter };
