import express from 'express';
import cors from 'cors';
import { projectRouter } from './routes/projects';
import { fileRouter } from './routes/files';
import { dataRouter } from './routes/data';
import { historyRouter } from './routes/history';
import { workflowRouter } from './routes/workflows';
import { behaviorRouter } from './routes/behaviors';
import { describeRouter } from './routes/describe';
import { configRouter } from './routes/configs';
import mlRouter from './routes/ml';
import { debugRouter } from './routes/debug';
import { logDebug } from './services/debug-logger';
import { userRouter } from './routes/users';
import { optionalAuth, requireAuth } from './middleware/auth';
import { databaseRouter } from './routes/database';
import { taskRouter } from './routes/tasks';
import { initScheduler } from './services/scheduler';
import { initTaskQueue } from './services/task-queue';
import { env } from './config/env';
import { auditRouter } from './routes/audit';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { logAudit } from './services/audit-logger';
import { metadataRouter } from './routes/metadata';
import { aiRouter } from './routes/ai';
import { exportRouter } from './routes/export';
import { notificationRouter } from './routes/notifications';
import { pluginRouter } from './routes/plugins';
import { swaggerRouter } from './swagger';
import { corsOptions } from './config/cors';
import { dataAccessAudit } from './middleware/data-audit';
import { backupRouter } from './routes/backup';
import { inviteRouter } from './routes/invite';
import { commentRouter } from './routes/comments';
import { approvalRouter } from './routes/approvals';
import { tenantRouter } from './routes/tenants';
import { tenantIsolation } from './middleware/tenant';
import { initNotificationWs } from './services/notification-ws';
import { checkpointRouter } from './routes/checkpoints';

const app = express();
const PORT = env.port;

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(optionalAuth);
app.use((req: import('./middleware/auth').AuthRequest, res, next) => {
  if (env.mode !== 'cloud' || req.method === 'OPTIONS' || !req.path.startsWith('/api/')) return next();
  const publicPaths = new Set(['/api/health', '/api/users/login', '/api/users/register']);
  if (publicPaths.has(req.path) || req.path.startsWith('/api-docs')) return next();
  return requireAuth(req, res, next);
});
app.use((req: import('./middleware/auth').AuthRequest, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const projectId = req.body?.projectId || (req.path.startsWith('/api/projects/') ? req.path.split('/')[3] : undefined);
    logAudit({ userId: req.user?.id, username: req.user?.username, action: `http.${req.method.toLowerCase()}`, resource: req.path, projectId, after: req.body, ip: req.ip, userAgent: req.headers['user-agent'], requestId: (req as any).requestId });
  });
  next();
});
app.use(dataAccessAudit);
app.use(tenantIsolation);

app.use((req, res, next) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  (req as typeof req & { requestId?: string }).requestId = requestId;
  res.setHeader('x-request-id', requestId);
  const startedAt = Date.now();
  logDebug('info', 'http', 'request:start', {
    route: req.path,
    requestId,
    context: { method: req.method, query: req.query },
  });
  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    logDebug(res.statusCode >= 400 ? 'warn' : 'info', 'http', 'request:finish', {
      route: req.path,
      requestId,
      context: { method: req.method, statusCode: res.statusCode, duration },
    });
  });
  next();
});

app.use('/api/projects', projectRouter);
app.use('/api/files', fileRouter);
app.use('/api/data', dataRouter);
app.use('/api/history', historyRouter);
app.use('/api/workflows', workflowRouter);
app.use('/api/behaviors', behaviorRouter);
app.use('/api/describe', describeRouter);
app.use('/api/configs', configRouter);
app.use('/api/ml', mlRouter);
app.use('/api/debug', debugRouter);
app.use('/api/users', userRouter);
app.use('/api/database', databaseRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/audit', auditRouter);
app.use('/api/metadata', metadataRouter);
app.use('/api/ai', aiRouter);
app.use('/api/export', exportRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/plugins', pluginRouter);
app.use('/api-docs', swaggerRouter);
app.use('/api/backup', backupRouter);
app.use('/api/projects', inviteRouter);
app.use('/api/comments', commentRouter);
app.use('/api/approvals', approvalRouter);
app.use('/api/tenants', tenantRouter);
app.use('/api/checkpoints', checkpointRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const frontendDir = join(env.repositoryRoot, 'ui', 'dist');
if (existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
  app.get('/{*path}', (_req, res) => res.sendFile(join(frontendDir, 'index.html')));
}

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const requestId = (req as express.Request & { requestId?: string }).requestId;
  const message = err instanceof Error ? err.message : String(err);
  logDebug('error', 'http', 'request:error', {
    route: req.path,
    requestId,
    context: { method: req.method, error: message },
  });
  if (res.headersSent) return;
  res.status(500).json({ error: message, requestId });
});

initTaskQueue();
initScheduler();
const server = app.listen(PORT, () => {
  logDebug('info', 'server', `FormFlow Server running on http://localhost:${PORT}`);
});
initNotificationWs(server);

export default app;
