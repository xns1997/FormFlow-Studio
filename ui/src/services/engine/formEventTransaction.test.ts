import assert from 'node:assert/strict';
import test from 'node:test';
import { createFormEventTransaction } from './formEventTransaction';

test('form event transaction exposes shadow values and commits effects once', async () => {
  const batches: unknown[][] = [];
  const transaction = createFormEventTransaction({
    values: { status: 'draft' },
    apply: async (effects) => { batches.push(effects); },
  });
  transaction.setValue('status', 'validated', 'behavior');
  transaction.setValue('status', 'saved', 'flow');
  transaction.setVisible('result-panel', true, 'flow');
  assert.equal(transaction.getValue('status'), 'saved');
  assert.deepEqual(batches, []);
  await transaction.commit();
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0], [
    { kind: 'value', field: 'status', value: 'saved', source: 'flow' },
    { kind: 'visible', componentId: 'result-panel', value: true, source: 'flow' },
  ]);
});

test('aborted form event transaction never applies its effects', async () => {
  let applied = false;
  const transaction = createFormEventTransaction({ values: {}, apply: async () => { applied = true; } });
  transaction.setValue('name', 'discarded', 'script');
  transaction.abort();
  await transaction.commit();
  assert.equal(applied, false);
});
