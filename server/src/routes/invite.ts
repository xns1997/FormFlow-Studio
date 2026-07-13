import { Router } from 'express';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { serverDataPath } from '../config/paths';
import type { AuthRequest } from '../middleware/auth';
import { setProjectMember, type ProjectAccess } from '../services/permission';
import { readProjectPackage, writeProjectPackage, listProjectPackages } from '../services/project-package-store';
import { findUserById, listUsers } from '../services/user-store';
import { createNotification } from '../services/notification';

const dir = serverDataPath('invites');
const file = `${dir}/invites.json`;

type Invite = {
  id: string;
  projectId: string;
  projectName: string;
  inviterId: string;
  inviterName: string;
  email?: string;
  grants: ProjectAccess[];
  token: string;
  createdAt: string;
  expiresAt: string;
  accepted: boolean;
};

function readInvites(): Invite[] {
  if (!existsSync(file)) return [];
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return []; }
}

function writeInvites(invites: Invite[]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(invites, null, 2));
}

const router = Router();

// POST /api/projects/:id/invite - 生成邀请
router.post('/:id/invite', (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '需要登录' });
    const project = readProjectPackage(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    const access = project.config?.access;
    if (access?.ownerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '只有项目所有者或管理员可以邀请成员' });
    }

    const { userId, grants = ['view'] } = req.body;
    if (!userId) return res.status(400).json({ error: '缺少目标用户 ID' });

    const validGrants: ProjectAccess[] = ['view', 'edit', 'run', 'manage'];
    if (!Array.isArray(grants) || grants.some((g: string) => !validGrants.includes(g as ProjectAccess))) {
      return res.status(400).json({ error: '无效权限' });
    }

    const targetUser = findUserById(userId);
    if (!targetUser) return res.status(404).json({ error: '目标用户不存在' });

    const token = randomBytes(32).toString('hex');
    const invite: Invite = {
      id: `invite_${Date.now()}_${randomBytes(4).toString('hex')}`,
      projectId: project.config.id,
      projectName: project.config.name,
      inviterId: req.user.id,
      inviterName: req.user.username,
      grants,
      token,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      accepted: false,
    };

    writeInvites([...readInvites(), invite]);

    // 直接将用户添加为成员（无需接受流程，简化协作）
    writeProjectPackage(setProjectMember(project, userId, grants));

    // 发送通知给被邀请者
    createNotification({
      userId,
      title: '项目共享邀请',
      message: `${req.user.username} 将项目「${project.config.name}」共享给了你，权限：${grants.join(', ')}`,
      level: 'info',
    });

    res.json({ inviteId: invite.id, token, expiresAt: invite.expiresAt });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/projects/accept-invite - 接受邀请（备用，当前直接添加成员）
router.post('/accept-invite', (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '需要登录' });
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: '缺少邀请 token' });

    const invites = readInvites();
    const invite = invites.find((i) => i.token === token && !i.accepted && new Date(i.expiresAt) > new Date());
    if (!invite) return res.status(404).json({ error: '邀请无效或已过期' });

    const project = readProjectPackage(invite.projectId);
    if (!project) return res.status(404).json({ error: '项目不存在' });

    writeProjectPackage(setProjectMember(project, req.user.id, invite.grants));

    invite.accepted = true;
    writeInvites(invites);

    createNotification({
      userId: invite.inviterId,
      title: '邀请已接受',
      message: `${req.user.username} 接受了项目「${invite.projectName}」的邀请`,
      level: 'success',
    });

    res.json({ success: true, projectId: invite.projectId });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GET /api/projects/:id/members - 获取项目成员列表
router.get('/:id/members', (req: AuthRequest, res) => {
  try {
    const project = readProjectPackage(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    const access = project.config?.access || {};
    const ownerId = access.ownerId;
    const members = access.members || {};

    const allUsers = listUsers();
    const memberList = [
      ...(ownerId ? [{ userId: ownerId, username: allUsers.find((u) => u.id === ownerId)?.username || ownerId, role: 'owner' as const, grants: ['manage'] }] : []),
      ...Object.entries(members).map(([userId, grants]) => ({
        userId,
        username: allUsers.find((u) => u.id === userId)?.username || userId,
        role: 'member' as const,
        grants,
      })),
    ];

    res.json(memberList);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// DELETE /api/projects/:id/members/:userId - 移除成员
router.delete('/:id/members/:userId', (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '需要登录' });
    const project = readProjectPackage(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    const access = project.config?.access;
    if (access?.ownerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '只有项目所有者或管理员可以移除成员' });
    }
    if (req.params.userId === access?.ownerId) {
      return res.status(400).json({ error: '不能移除项目所有者' });
    }

    const members = { ...access?.members };
    delete members[req.params.userId];
    project.config.access = { ...access, members };
    writeProjectPackage(project);

    createNotification({
      userId: req.params.userId,
      title: '已从项目移除',
      message: `你已从项目「${project.config.name}」中移除`,
      level: 'warning',
    });

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GET /api/projects/shared-with-me - 获取共享给我的项目
router.get('/shared-with-me', (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '需要登录' });
    const allProjects = listProjectPackages();
    // 过滤出共享给当前用户的项目（非自己创建的）
    const shared = allProjects.filter((p: any) =>
      p.access?.members?.[req.user!.id] && p.access?.ownerId !== req.user!.id
    );
    res.json(shared);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export { router as inviteRouter };
