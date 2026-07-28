import assert from 'node:assert/strict';
import test from 'node:test';
import { createFormInteractionMetrics, persistFormInteractionMetrics, recordFormMetric, restoreFormInteractionMetrics, summarizeFormMetrics } from './formMetrics.ts';

test('form metrics capture submit success, repair, retry and undo rates', () => {
  let metrics = createFormInteractionMetrics(1000);
  metrics = recordFormMetric(metrics, 'configure', 1100);
  metrics = recordFormMetric(metrics, 'change', 1200, 'input');
  metrics = recordFormMetric(metrics, 'submit-failure', 1300, 'input');
  metrics = recordFormMetric(metrics, 'repair-success', 1400);
  metrics = recordFormMetric(metrics, 'retry', 1450);
  metrics = recordFormMetric(metrics, 'submit-success', 1500, 'input');
  metrics = recordFormMetric(metrics, 'undo', 1600);
  assert.deepEqual(summarizeFormMetrics(metrics), { timeToFirstSubmitMs: 300, firstSubmitSuccessRate: 0.5, averageFieldChangesPerSubmit: 0.5, repairSuccessRate: 1, retries: 1, undos: 1, byControlType: { input: { changes: 1, submitSuccesses: 1, submitFailures: 1, repairSuccesses: 0, retries: 0, undos: 0 } } });
});

test('form metrics persist and restore by form id', () => {
  const values = new Map<string, string>();
  const storage = { setItem: (key: string, value: string) => values.set(key, value), getItem: (key: string) => values.get(key) || null };
  const metrics = recordFormMetric(createFormInteractionMetrics(10), 'change', 20, 'select');
  persistFormInteractionMetrics('demo', metrics, storage);
  assert.deepEqual(restoreFormInteractionMetrics('demo', storage), metrics);
});
