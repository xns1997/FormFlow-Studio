import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadDatasourceConfig, saveDatasourceConfig } from './external-datasource';
import type { DatasourceConfig } from './external-datasource';

const directories: string[] = [];
test.after(() => { for (const dir of directories) rmSync(dir, { recursive: true, force: true }); });

function tempProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'formflow-datasource-'));
  directories.push(dir);
  return dir;
}

const baseConfig: DatasourceConfig = {
  id: 'ds_mysql',
  name: '测试数据库',
  type: 'mysql',
  connection: { host: '127.0.0.1', port: 3306, database: 'app', user: 'root', password: 'p@ss', ssl: false },
  query: 'SELECT 1',
  cache: { enabled: true, ttl: 300 },
  writeBack: false,
  createdAt: '2026-08-03T00:00:00.000Z',
  updatedAt: '2026-08-03T00:00:00.000Z',
};

test('datasource config round-trips through encrypted storage and decrypts on load', () => {
  const dir = tempProjectDir();
  assert.doesNotThrow(() => saveDatasourceConfig(dir, baseConfig));
  const loaded = loadDatasourceConfig(dir, 'ds_mysql');
  assert.deepEqual(loaded, baseConfig);
  // 明文密码不应出现在磁盘上
  const raw = readFileSync(join(dir, '.datasources', 'ds_mysql.json'), 'utf8');
  assert.equal(raw.includes('p@ss'), false);
  assert.equal(raw.includes('_encrypted'), true);
});

test('corrupt or undecryptable datasource config loads as null instead of throwing', () => {
  const dir = tempProjectDir();
  const configDir = join(dir, '.datasources');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'ds_broken.json'), '{not valid json');
  assert.equal(loadDatasourceConfig(dir, 'ds_broken'), null);
  writeFileSync(join(configDir, 'ds_tampered.json'), JSON.stringify({ id: 'ds_tampered', _encrypted: true, connection: '!!!not-base64!!!' }));
  assert.equal(loadDatasourceConfig(dir, 'ds_tampered'), null);
});
