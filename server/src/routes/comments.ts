import { Router } from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { serverDataPath } from '../config/paths';
import type { AuthRequest } from '../middleware/auth';
import { createNotification } from '../services/notification';

export type Comment = {
  id: string;
  projectId: string;
  targetType: 'node' | 'cell' | 'workflow';
  targetId: string;
  userId: string;
  username: string;
  content: string;
  parentId?: string;
  createdAt: string;
  updatedAt?: string;
};

const dir = serverDataPath('comments');
const file = `${dir}/comments.json`;

function readComments(): Comment[] {
  if (!existsSync(file)) return [];
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return []; }
}

function writeComments(comments: Comment[]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(comments, null, 2));
}

const router = Router();

// GET /api/comments - 获取评论列表
router.get('/', (req: AuthRequest, res) => {
  try {
    const { projectId, targetType, targetId } = req.query;
    let comments = readComments();
    if (projectId) comments = comments.filter((c) => c.projectId === projectId);
    if (targetType) comments = comments.filter((c) => c.targetType === targetType);
    if (targetId) comments = comments.filter((c) => c.targetId === targetId);
    res.json(comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/comments - 创建评论
router.post('/', (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '需要登录' });
    const { projectId, targetType, targetId, content, parentId } = req.body;
    if (!projectId || !targetType || !targetId || !content?.trim()) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const comment: Comment = {
      id: `comment_${randomUUID()}`,
      projectId,
      targetType,
      targetId,
      userId: req.user.id,
      username: req.user.username,
      content: content.trim(),
      parentId,
      createdAt: new Date().toISOString(),
    };

    writeComments([...readComments(), comment]);

    // 通知项目所有者（如果是回复）
    if (parentId) {
      const comments = readComments();
      const parent = comments.find((c) => c.id === parentId);
      if (parent && parent.userId !== req.user.id) {
        createNotification({
          userId: parent.userId,
          title: '评论回复',
          message: `${req.user.username} 回复了你的评论`,
          level: 'info',
        });
      }
    }

    res.status(201).json(comment);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// PATCH /api/comments/:id - 更新评论
router.patch('/:id', (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '需要登录' });
    const comments = readComments();
    const comment = comments.find((c) => c.id === req.params.id);
    if (!comment) return res.status(404).json({ error: '评论不存在' });
    if (comment.userId !== req.user.id) return res.status(403).json({ error: '只能编辑自己的评论' });

    comment.content = req.body.content?.trim() || comment.content;
    comment.updatedAt = new Date().toISOString();
    writeComments(comments);
    res.json(comment);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// DELETE /api/comments/:id - 删除评论
router.delete('/:id', (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '需要登录' });
    const comments = readComments();
    const comment = comments.find((c) => c.id === req.params.id);
    if (!comment) return res.status(404).json({ error: '评论不存在' });
    if (comment.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权删除' });
    }

    writeComments(comments.filter((c) => c.id !== req.params.id && c.parentId !== req.params.id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GET /api/comments/count - 获取评论计数
router.get('/count', (req: AuthRequest, res) => {
  try {
    const { projectId } = req.query;
    let comments = readComments();
    if (projectId) comments = comments.filter((c) => c.projectId === projectId);

    const counts: Record<string, number> = {};
    for (const c of comments) {
      const key = `${c.targetType}:${c.targetId}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    res.json(counts);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export { router as commentRouter };
