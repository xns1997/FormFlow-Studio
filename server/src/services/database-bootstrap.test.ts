import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from 'pg';
import { ensureDatabase } from './database-bootstrap';

test('startup self-check creates a missing PostgreSQL database', { skip: !process.env.TEST_POSTGRES_ADMIN_URL }, async () => {
  const targetName = `formflow_bootstrap_${Date.now()}`;
  const target = new URL(process.env.TEST_POSTGRES_ADMIN_URL!);
  target.pathname = `/${targetName}`;
  const result = await ensureDatabase({ databaseUrl: target.toString(), autoStart: false });
  assert.equal(result.available, true);
  assert.equal(result.created, true);

  const client = new Client({ connectionString: target.toString() });
  await client.connect();
  await client.query('SELECT 1');
  await client.end();

  const admin = new Client({ connectionString: process.env.TEST_POSTGRES_ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE "${targetName}"`);
  await admin.end();
});
