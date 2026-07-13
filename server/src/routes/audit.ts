import { Router } from 'express';
import { listAudit } from '../services/audit-store';
const router = Router();
router.get('/', (req, res) => res.json(listAudit({ projectId: req.query.projectId as string, userId: req.query.userId as string, limit: Number(req.query.limit) || 200 })));
export { router as auditRouter };
