import { Router } from 'express';
import { requireAuth, signToken, type AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { authenticateUser, createUser, listUsers, updateUserRole, type UserRole } from '../services/user-store';

const router = Router();

router.post('/register', (req: AuthRequest, res) => {
  try {
    const existing = listUsers();
    if (existing.length > 0 && req.user?.role !== 'admin') return res.status(403).json({ error: '注册已关闭，请由管理员创建用户' });
    const user = createUser(req.body.username || '', req.body.password || '', req.body.role);
    res.status(201).json({ user, token: signToken(user) });
  } catch (error) { res.status(400).json({ error: String(error instanceof Error ? error.message : error) }); }
});

router.post('/login', (req, res) => {
  const user = authenticateUser(req.body.username || '', req.body.password || '');
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });
  res.json({ user, token: signToken(user) });
});

router.get('/me', requireAuth, (req: AuthRequest, res) => res.json(req.user));
router.get('/', requireAuth, requireRole('admin'), (_req, res) => res.json(listUsers()));
router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  try { res.status(201).json(createUser(req.body.username || '', req.body.password || '', req.body.role)); }
  catch (error) { res.status(400).json({ error: String(error instanceof Error ? error.message : error) }); }
});
router.patch('/:id/role', requireAuth, requireRole('admin'), (req, res) => {
  const roles: UserRole[] = ['admin', 'editor', 'viewer'];
  if (!roles.includes(req.body.role)) return res.status(400).json({ error: '无效角色' });
  const user = updateUserRole(req.params.id, req.body.role);
  return user ? res.json(user) : res.status(404).json({ error: '用户不存在' });
});

export { router as userRouter };
