import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { env } from '../config/env';
import { aggregateDocsEvent, readDocsState, saveDocsState, type DocsEvent } from '../services/docs-store';

const router = Router();
function scope(req: AuthRequest) {
  const userId = req.user?.id || '';
  const tenantId = String((req as any).tenantId || req.headers['x-tenant-id'] || '');
  if (env.mode === 'cloud' && (!userId || !tenantId)) throw new Error('云模式文档状态需要登录用户和租户');
  return { userId: userId || 'local', tenantId: tenantId || 'local' };
}

router.get('/state', (req: AuthRequest, res) => {
  try {
    const current = scope(req);
    res.json(readDocsState(current.tenantId, current.userId));
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

router.put('/state', (req: AuthRequest, res) => {
  try {
    const current = scope(req);
    res.json(saveDocsState(current.tenantId, current.userId, req.body || {}));
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

router.post('/events', (req, res) => {
  try {
    aggregateDocsEvent(req.body as DocsEvent);
    res.status(202).json({ accepted: true });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

export { router as docsRouter };
