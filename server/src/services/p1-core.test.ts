import assert from 'node:assert/strict';
import test from 'node:test';
import { beginTransaction, commitTransaction, rollbackTransaction, runTransaction } from './transaction-manager';

test('transaction commits successful work and rolls back failures', async () => {
  let state = { value: 1 };
  const result = await runTransaction('state', () => state, (snapshot) => { state = snapshot; }, async () => { state = { value: 2 }; return 'ok'; });
  assert.equal(result, 'ok'); assert.equal(state.value, 2);
  await assert.rejects(() => runTransaction('state', () => state, (snapshot) => { state = snapshot; }, async () => { state = { value: 9 }; throw new Error('fail'); }));
  assert.equal(state.value, 2);
});

test('manual transaction validates lifecycle', () => {
  const committed = beginTransaction('a', { x: 1 }); commitTransaction(committed.id); assert.throws(() => rollbackTransaction(committed.id, () => {}));
  const rolled = beginTransaction('b', { x: 2 }); let restored = 0; rollbackTransaction(rolled.id, (snapshot) => { restored = snapshot.x; }); assert.equal(restored, 2);
});
