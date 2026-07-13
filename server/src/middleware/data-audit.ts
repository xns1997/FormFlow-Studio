import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth';
import { logAudit } from '../services/audit-logger';
export function dataAccessAudit(req: AuthRequest, res: Response, next: NextFunction) {
  const isDataRead = req.method === 'GET' && (/^\/api\/(data|files|describe)/.test(req.path) || /^\/api\/projects\/data/.test(req.path));
  if (isDataRead) res.on('finish', () => { if (res.statusCode < 400) logAudit({ userId: req.user?.id, username: req.user?.username, action: 'data.read', resource: req.path, projectId: String(req.query.projectId || req.body?.projectId || '') || undefined, ip: req.ip, userAgent: req.headers['user-agent'], requestId: (req as any).requestId }); });
  next();
}
