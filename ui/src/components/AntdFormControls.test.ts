import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePopupContainer } from './AntdFormControls';

test('date and time popups mount outside overflow-clipped form controls', () => {
  const body = {} as HTMLElement;
  const trigger = { ownerDocument: { body } } as HTMLElement;

  assert.equal(resolvePopupContainer(trigger), body);
});
