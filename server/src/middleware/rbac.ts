import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth';
import type { UserRole } from '../services/user-store';

const rank: Record<UserRole, number> = { viewer: 1, editor: 2, admin: 3 };

export function requireRole(minimum: UserRole) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: '需要登录' });
    if (rank[req.user.role] < rank[minimum]) return res.status(403).json({ error: '权限不足' });
    next();
  };
}
