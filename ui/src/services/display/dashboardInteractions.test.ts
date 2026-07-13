import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardInteractions } from './dashboardInteractions';

test('dashboard filters propagate while excluding the source widget', () => {
  dashboardInteractions.clear();
  dashboardInteractions.set({ sourceId: 'a', field: 'region', value: '华东' });
  const rows = [{ region: '华东', value: 1 }, { region: '华北', value: 2 }];
  assert.deepEqual(dashboardInteractions.apply(rows), [rows[0]]);
  assert.deepEqual(dashboardInteractions.apply(rows, 'a'), rows);
  dashboardInteractions.clear();
});
