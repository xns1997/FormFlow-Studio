import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { ProjectMutationError } from './project-mutation';
import { consumeConfirmation, issueConfirmation, operationHash } from './tool-confirmations';

function header(req: AuthRequest, name: string): string {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] || '' : String(value || '');
}

export function projectWriteMetadata(req: AuthRequest) {
  return {
    baseRevision: header(req, 'if-match').replace(/^W\//, '').replace(/^"|"$/g, '') || String(req.body?.baseRevision || ''),
    idempotencyKey: header(req, 'x-idempotency-key') || String(req.body?.idempotencyKey || ''),
  };
}

export function setProjectRevision(res: Response, revision: string) {
  res.setHeader('etag', `"${revision}"`);
  res.setHeader('x-project-revision', revision);
}

export async function requireDestructiveConfirmation(
  req: AuthRequest,
  res: Response,
  operation: string,
  projectId: string,
  impact: Record<string, unknown>,
) {
  const userId = req.user?.id || 'anonymous';
  const tenantId = header(req, 'x-tenant-id') || undefined;
  const input = {
    method: req.method,
    path: req.originalUrl,
    ...projectWriteMetadata(req),
    impact,
  };
  const toolName = `http.${operation}`;
  const expected = {
    operationHash: operationHash(toolName, input, { userId, tenantId, projectId }),
    userId,
    tenantId,
    projectId,
    toolName,
  };
  const token = header(req, 'x-confirmation-token') || String(req.body?.confirmationToken || '');
  if (await consumeConfirmation(token, expected)) return true;
  const confirmation = await issueConfirmation(expected);
  res.status(409).json({
    status: 'confirmation_required',
    confirmation: {
      ...confirmation,
      summary: '该操作会永久删除数据，确认后才会执行。',
      impact,
    },
  });
  return false;
}

export function sendProjectMutationError(res: Response, error: unknown) {
  if (error instanceof ProjectMutationError) {
    return res.status(error.status).json({ error: error.message, code: error.code, ...error.details });
  }
  return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
}
