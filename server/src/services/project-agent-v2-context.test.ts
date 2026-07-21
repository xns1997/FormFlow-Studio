import assert from 'node:assert/strict';
import test from 'node:test';
import { compactAgentToolResult } from './project-agent-v2-context';

test('small tool results remain unchanged', () => {
  const value = { ok: true, data: { revision: 'r1' } };
  assert.equal(compactAgentToolResult(value), value);
});

test('large tool results are bounded and explicitly marked', () => {
  const value = { ok: true, data: { rows: Array.from({ length: 500 }, (_, index) => ({ id: index, value: '\\"'.repeat(500) })) } };
  const compacted = compactAgentToolResult(value, 8_000) as Record<string, unknown>;
  assert.equal(compacted.__formflowTruncated, true);
  assert.ok(JSON.stringify(compacted).length <= 8_000);
  assert.ok(Number(compacted.originalChars) > 8_000);
});
