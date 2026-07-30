import assert from 'node:assert/strict';
import test from 'node:test';
import { isImeKeyboardEvent } from './ime';

test('IME keyboard detection accepts standards and legacy browser signals', () => {
  assert.equal(isImeKeyboardEvent({ isComposing: true }), true);
  assert.equal(isImeKeyboardEvent({ isComposing: false, keyCode: 229 }), true);
  assert.equal(isImeKeyboardEvent({ isComposing: false, keyCode: 13 }), false);
});
