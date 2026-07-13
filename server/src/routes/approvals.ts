import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { createApprovalInstance, getApprovalInstance, listApprovalInstances, processApprovalAction } from '../services/approval';
import { createNotification } from '../services/notification';

const router = Router();

// POST /api/approvals - 创建审批实例
router.post('/', (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '需要登录' });
    const { projectId, workflowId, title, nodes } = req.body;
    if (!projectId || !title || !nodes?.length) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const instance = createApprovalInstance({
      projectId,
      workflowId: workflowId || '',
      title,
      initiatorId: req.user.id,
      initiatorName: req.user.username,
      nodes,
    });

    // 通知第一个审批人
    const firstNode = nodes.find((n: any) => n.type === 'approve' || n.type === 'reject');
    if (firstNode?.assigneeType === 'user' && firstNode.assigneeValue) {
      createNotification({
        userId: firstNode.assigneeValue,
        title: '待审批',
        message: `${req.user.username} 发起了审批「${title}」`,
        level: 'info',
      });
    }

    res.status(201).json(instance);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GET /api/approvals - 获取审批列表
router.get('/', (req: AuthRequest, res) => {
  try {
    const { projectId, status } = req.query;
    let instances = listApprovalInstances(projectId as string);
    if (status) instances = instances.filter((i) => i.status === status);
    res.json(instances);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GET /api/approvals/:id - 获取审批详情
router.get('/:id', (req: AuthRequest, res) => {
  try {
    const instance = getApprovalInstance(req.params.id);
    if (!instance) return res.status(404).json({ error: '审批不存在' });
    res.json(instance);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// POST /api/approvals/:id/action - 审批操作
router.post('/:id/action', (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '需要登录' });
    const { action, comment } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: '无效操作' });
    }

    const instance = processApprovalAction(req.params.id, req.user.id, req.user.username, action, comment);
    if (!instance) return res.status(404).json({ error: '审批不存在或已结束' });

    // 通知发起人
    createNotification({
      userId: instance.initiatorId,
      title: `审批${action === 'approve' ? '通过' : '拒绝'}`,
      message: `${req.user.username} ${action === 'approve' ? '通过' : '拒绝'}了审批「${instance.title}」`,
      level: action === 'approve' ? 'success' : 'warning',
    });

    res.json(instance);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export { router as approvalRouter };
