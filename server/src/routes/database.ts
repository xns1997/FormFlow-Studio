import { Router } from 'express';
import { queryDatabase, testConnection, writeDatabase } from '../services/db-connector';

const router = Router();
router.post('/test', async (req, res) => {
  try { res.json(await testConnection(req.body)); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});
router.post('/query', async (req, res) => {
  try { res.json(await queryDatabase(req.body, req.body.query, req.body.params || [])); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});
router.post('/write', async (req, res) => {
  try { res.json(await writeDatabase(req.body, req.body.table, req.body.rows || [], req.body.mode, req.body.keys || [])); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});
export { router as databaseRouter };
