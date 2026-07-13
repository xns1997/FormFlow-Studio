import { Router } from 'express';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { REPOSITORY_ROOT, serverDataPath } from '../config/paths';
const router = Router(); const root = join(REPOSITORY_ROOT, 'plugins'); const storage = serverDataPath('plugins'); const safe = (value: string) => { if (!/^[\w:-]+$/.test(value)) throw new Error('无效插件标识'); return value; };
router.get('/', (_req, res) => { if (!existsSync(root)) return res.json([]); const manifests = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => { try { return [JSON.parse(readFileSync(join(root, entry.name, 'plugin.json'), 'utf8'))]; } catch { return []; } }); res.json(manifests); });
router.get('/:id/storage/:key', (req, res) => { try { const path = join(storage, `${safe(req.params.id)}.json`); const value = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}; res.json(value[safe(req.params.key)] ?? null); } catch (error) { res.status(400).json({ error: String(error) }); } });
router.put('/:id/storage/:key', (req, res) => { try { mkdirSync(storage, { recursive: true }); const path = join(storage, `${safe(req.params.id)}.json`); const value = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}; value[safe(req.params.key)] = req.body.value; writeFileSync(path, JSON.stringify(value, null, 2)); res.json({ success: true }); } catch (error) { res.status(400).json({ error: String(error) }); } });
export { router as pluginRouter };
