import { Router } from 'express';
import { getErrors, getErrorSummary, ingestErrors, clearErrors } from '../services/error-logger';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

// POST /api/errors — receive errors from frontend (batch)
router.post('/', asyncHandler(async (req, res) => {
  const { errors } = req.body as { errors?: Array<Record<string, unknown>> };
  if (!Array.isArray(errors) || errors.length === 0) {
    res.status(400).json({ error: 'errors array is required' });
    return;
  }
  const sanitized = errors.slice(0, 100).map((e) => ({
    severity: typeof e.severity === 'string' ? e.severity : 'error',
    source: typeof e.source === 'string' ? e.source : 'frontend',
    category: typeof e.category === 'string' ? e.category : 'unknown',
    title: typeof e.title === 'string' ? e.title : 'Unknown error',
    message: typeof e.message === 'string' ? e.message : '',
    componentId: typeof e.componentId === 'string' ? e.componentId : undefined,
    field: typeof e.field === 'string' ? e.field : undefined,
    nodeId: typeof e.nodeId === 'string' ? e.nodeId : undefined,
    workflowId: typeof e.workflowId === 'string' ? e.workflowId : undefined,
    context: e.context && typeof e.context === 'object' ? e.context as Record<string, unknown> : undefined,
    stack: typeof e.stack === 'string' ? e.stack : undefined,
  }));
  const ingested = ingestErrors(sanitized);
  res.json({ success: true, count: ingested.length });
}));

// GET /api/errors — query errors with filters
router.get('/', asyncHandler(async (req, res) => {
  const errors = getErrors({
    severity: typeof req.query.severity === 'string' ? req.query.severity as any : undefined,
    category: typeof req.query.category === 'string' ? req.query.category as any : undefined,
    source: typeof req.query.source === 'string' ? req.query.source : undefined,
    limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
  });
  res.json({ errors });
}));

// GET /api/errors/summary — get error statistics
router.get('/summary', asyncHandler(async (_req, res) => {
  res.json(getErrorSummary());
}));

// DELETE /api/errors — clear all errors
router.delete('/', asyncHandler(async (_req, res) => {
  clearErrors();
  res.json({ success: true });
}));

export { router as errorRouter };
