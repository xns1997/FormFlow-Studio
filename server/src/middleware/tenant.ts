import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth';
import { getTenant, checkQuota } from '../services/tenant-store';

export function tenantIsolation(req: AuthRequest, res: Response, next: NextFunction) {
  // 本地模式跳过租户检查
  if (process.env.FORMFLOW_MODE !== 'cloud') return next();

  const tenantId = req.headers['x-tenant-id'] as string;
  if (!tenantId) return next();

  const tenant = getTenant(tenantId);
  if (!tenant) return res.status(404).json({ error: '租户不存在' });

  (req as any).tenantId = tenantId;

  // 写操作检查配额
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const projectId = req.body?.projectId || (req.path.startsWith('/api/projects/') ? req.path.split('/')[3] : undefined);
    if (projectId) {
      const quota = checkQuota(tenantId, projectId);
      if (!quota.allowed) {
        return res.status(429).json({ error: quota.reason });
      }
    }
  }

  next();
}
