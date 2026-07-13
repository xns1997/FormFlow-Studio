import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { listTenants, getTenant, createTenant, updateTenant, deleteTenant } from '../services/tenant-store';

const router = Router();

// GET /api/tenants - 获取租户列表
router.get('/', (req: AuthRequest, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    res.json(listTenants());
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/tenants - 创建租户
router.post('/', (req: AuthRequest, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    const { name, maxProjects, maxStorageMb, maxApiCallsPerDay } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: '缺少租户名称' });
    res.status(201).json(createTenant({ name: name.trim(), maxProjects, maxStorageMb, maxApiCallsPerDay }));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GET /api/tenants/:id - 获取租户详情
router.get('/:id', (req: AuthRequest, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    const tenant = getTenant(req.params.id);
    if (!tenant) return res.status(404).json({ error: '租户不存在' });
    res.json(tenant);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// PUT /api/tenants/:id - 更新租户
router.put('/:id', (req: AuthRequest, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    const tenant = updateTenant(req.params.id, req.body);
    if (!tenant) return res.status(404).json({ error: '租户不存在' });
    res.json(tenant);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// DELETE /api/tenants/:id - 删除租户
router.delete('/:id', (req: AuthRequest, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    const success = deleteTenant(req.params.id);
    if (!success) return res.status(404).json({ error: '租户不存在' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export { router as tenantRouter };
