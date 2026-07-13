import type { NextFunction, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import type { UserRole } from '../services/user-store';

export type AuthUser = { id: string; username: string; role: UserRole };
export type AuthRequest = Request & { user?: AuthUser };

const secret = () => process.env.JWT_SECRET || 'formflow-development-secret-change-me';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function signToken(user: AuthUser, expiresInSeconds = 24 * 60 * 60) {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ ...user, exp: Math.floor(Date.now() / 1000) + expiresInSeconds });
  const signature = createHmac('sha256', secret()).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string): AuthUser | undefined {
  try {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return undefined;
    const expected = createHmac('sha256', secret()).update(`${header}.${payload}`).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.id || !decoded.username || !decoded.role || decoded.exp <= Date.now() / 1000) return undefined;
    return { id: decoded.id, username: decoded.username, role: decoded.role };
  } catch { return undefined; }
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) req.user = verifyToken(token);
  next();
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  optionalAuth(req, res, () => req.user ? next() : res.status(401).json({ error: '需要登录' }));
}
