import assert from 'node:assert/strict';
import test from 'node:test';
import { getAllControls } from '../registry';
import '../controls';
import { lintControlSchemas } from './schemaUxLint';
import { withReadableHelp } from './PropertySectionList';

test('all registered control schemas have unique, readable property definitions', () => {
  const controls = getAllControls();
  assert.equal(controls.length, 26);
  const issues = lintControlSchemas(controls).filter((issue) => issue.severity === 'error');
  assert.deepEqual(issues, []);
});

test('property basics stay business-facing and internal JSON stays advanced', () => {
  for (const control of getAllControls()) {
    for (const definition of control.propSchema) {
      const primitive = !('keys' in definition);
      const advanced = definition.level === 'advanced' || definition.key === 'name' || definition.group === '表达式' || definition.group === '数据源' || (primitive && (definition.type === 'json' || definition.editor === 'json'));
      if (!advanced) {
        assert.notEqual(definition.key, 'name', `${control.type}.${definition.key} must not expose internal field name in basics`);
        if (primitive) assert.notEqual(definition.type, 'json', `${control.type}.${definition.key} must not expose JSON in basics`);
      }
    }
  }
});

test('every visible property gets readable help or a visual editor fallback', () => {
  const missing = getAllControls().flatMap((control) => control.propSchema.filter((definition) => !String(withReadableHelp(definition).help || '').trim()).map((definition) => `${control.type}.${definition.key}`));
  assert.deepEqual(missing, []);
});
