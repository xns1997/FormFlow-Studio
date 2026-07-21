import assert from 'node:assert/strict';
import test from 'node:test';
import { createMethodDefaults, METHOD_LIBRARY } from './methodLibrary';

test('visible method library covers all productized shortcuts with preview, code and sample run', () => {
  assert.deepEqual(METHOD_LIBRARY.map((item) => item.id), ['setValues', 'clearValues', 'setFieldState', 'requireFields', 'findRow', 'fillForm', 'nextSequence', 'resetForm']);
  for (const entry of METHOD_LIBRARY) {
    const params = createMethodDefaults(entry);
    assert.ok(entry.preview(params));
    assert.ok(entry.code(params));
    assert.notEqual(entry.sample(params), undefined);
  }
});
