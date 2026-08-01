import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEditorDraft, saveEditorDraft } from './draftStore';

test('editor drafts survive a region remount through the draft store seam', async () => {
  const draft = { id: 'scope:project', projectId: 'project', scopeKey: 'scope', updatedAt: Date.now(), forms: [{ id: 'form-1' }], activeFormId: 'form-1', behaviorDraft: 'rule' };
  await saveEditorDraft(draft);
  assert.deepEqual(await loadEditorDraft(draft.id), draft);
});
