import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';

process.env.FORMFLOW_DATABASE_REQUIRED = 'false';
process.env.FORMFLOW_DATABASE_AUTO_START = 'false';

const { aiRouter } = await import('./ai');

test('POST /api/ai/code-format formats event javascript and rejects unsupported languages', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', aiRouter);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const root = `http://127.0.0.1:${address.port}`;
  try {
    const ok = await fetch(`${root}/api/ai/code-format`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'javascript', code: 'let a=42;' }),
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { code: 'let a = 42;\n' });

    const bad = await fetch(`${root}/api/ai/code-format`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'python', code: 'x = 1' }),
    });
    assert.equal(bad.status, 422);
    assert.match(JSON.stringify(await bad.json()), /不支持的格式化语言/);
  } finally {
    server.close();
  }
});
