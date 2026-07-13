import { Router } from 'express';
import { clearDebugLogs, getDebugLogs } from '../services/debug-logger';

const router = Router();

router.get('/logs', (req, res) => {
  const logs = getDebugLogs({
    level: typeof req.query.level === 'string' ? req.query.level as any : undefined,
    source: typeof req.query.source === 'string' ? req.query.source : undefined,
    limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
    requestId: typeof req.query.requestId === 'string' ? req.query.requestId : undefined,
  });
  res.json({ logs });
});

router.get('/requests/:requestId', (req, res) => {
  res.json({ logs: getDebugLogs({ requestId: req.params.requestId, limit: 500 }) });
});

router.delete('/logs', (_req, res) => {
  clearDebugLogs();
  res.json({ success: true });
});

export { router as debugRouter };
