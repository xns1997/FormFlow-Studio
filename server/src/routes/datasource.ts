/**
 * External Datasource API Routes
 */
import { Router } from 'express';
import {
  saveDatasourceConfig,
  loadDatasourceConfig,
  listDatasourceConfigs,
  deleteDatasourceConfig,
  queryDatasource,
  testConnection,
  type DatasourceConfig,
  type DatasourceType,
} from '../services/external-datasource.js';

const router = Router();

// List all datasources for a project
router.get('/api/datasources/:projectId', (req, res) => {
  try {
    const projectDir = req.app.locals.getProjectDir?.(req.params.projectId);
    if (!projectDir) return res.status(404).json({ error: '项目不存在' });
    const configs = listDatasourceConfigs(projectDir);
    // Redact passwords in response
    const safe = configs.map((c) => ({
      ...c,
      connection: redactSensitive(c.connection, c.type),
    }));
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Get a single datasource config
router.get('/api/datasources/:projectId/:id', (req, res) => {
  try {
    const projectDir = req.app.locals.getProjectDir?.(req.params.projectId);
    if (!projectDir) return res.status(404).json({ error: '项目不存在' });
    const config = loadDatasourceConfig(projectDir, req.params.id);
    if (!config) return res.status(404).json({ error: '数据源不存在' });
    res.json({ ...config, connection: redactSensitive(config.connection, config.type) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Create or update a datasource
router.post('/api/datasources/:projectId', (req, res) => {
  try {
    const projectDir = req.app.locals.getProjectDir?.(req.params.projectId);
    if (!projectDir) return res.status(404).json({ error: '项目不存在' });
    const { id, name, type, connection, query, cache, writeBack } = req.body;
    if (!name || !type || !connection) {
      return res.status(400).json({ error: '缺少必填字段: name, type, connection' });
    }
    const config: DatasourceConfig = {
      id: id || `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      type: type as DatasourceType,
      connection,
      query,
      cache: cache || { enabled: false, ttl: 300 },
      writeBack: writeBack || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveDatasourceConfig(projectDir, config);
    res.json({ success: true, id: config.id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Delete a datasource
router.delete('/api/datasources/:projectId/:id', (req, res) => {
  try {
    const projectDir = req.app.locals.getProjectDir?.(req.params.projectId);
    if (!projectDir) return res.status(404).json({ error: '项目不存在' });
    deleteDatasourceConfig(projectDir, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Test connection
router.post('/api/datasources/:projectId/:id/test', async (req, res) => {
  try {
    const projectDir = req.app.locals.getProjectDir?.(req.params.projectId);
    if (!projectDir) return res.status(404).json({ error: '项目不存在' });
    const config = loadDatasourceConfig(projectDir, req.params.id);
    if (!config) return res.status(404).json({ error: '数据源不存在' });
    const result = await testConnection(config);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Test connection with inline config (before saving)
router.post('/api/datasources/test', async (req, res) => {
  try {
    const { type, connection } = req.body;
    if (!type || !connection) return res.status(400).json({ error: '缺少 type 和 connection' });
    const result = await testConnection({
      id: 'test', name: 'test', type: type as DatasourceType,
      connection, cache: { enabled: false, ttl: 0 }, writeBack: false,
      createdAt: '', updatedAt: '',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Query a datasource
router.post('/api/datasources/:projectId/:id/query', async (req, res) => {
  try {
    const projectDir = req.app.locals.getProjectDir?.(req.params.projectId);
    if (!projectDir) return res.status(404).json({ error: '项目不存在' });
    const config = loadDatasourceConfig(projectDir, req.params.id);
    if (!config) return res.status(404).json({ error: '数据源不存在' });
    const result = await queryDatasource(projectDir, config, {
      forceRefresh: req.body.forceRefresh,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Helpers ─────────────────────────────────────────

function redactSensitive(connection: unknown, type: string): Record<string, unknown> {
  const redacted = { ...(connection as Record<string, unknown>) };
  if ('password' in redacted) redacted.password = '***';
  if (type === 'api' && 'headers' in redacted && typeof redacted.headers === 'object') {
    const headers = { ...redacted.headers as Record<string, unknown> };
    for (const key of Object.keys(headers)) {
      if (/auth|token|key|secret/i.test(key)) headers[key] = '***';
    }
    redacted.headers = headers;
  }
  return redacted;
}

export { router as datasourceRouter };
