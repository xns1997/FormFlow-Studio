import assert from 'node:assert/strict';
import test from 'node:test';
import {
  behaviorEventDocs,
  behaviorTopicDocs,
  getBehaviorDocBySlug,
  getBehaviorEventDoc,
  getEventDetailType,
  getEventReferenceShortcuts,
} from './behaviorDocs';

test('every behavior and topic doc has a unique slug', () => {
  const slugs = [...behaviorEventDocs.map((item) => item.slug), ...behaviorTopicDocs.map((item) => item.slug)];
  assert.equal(new Set(slugs).size, slugs.length);
});

test('script and control event docs can be resolved by event name and slug', () => {
  const scriptSubmit = getBehaviorEventDoc('onSubmit', 'script');
  const controlSubmit = getBehaviorEventDoc('onSubmit', 'control');
  assert.equal(scriptSubmit?.slug, 'submit');
  assert.equal(controlSubmit?.slug, 'control-submit');
  assert.equal(getBehaviorDocBySlug('context-reference')?.title, '上下文 Reference');
  assert.equal(getBehaviorDocBySlug('control-handles-reference')?.title, 'ctx.controls Reference');
});

test('control event detail metadata stays aligned with suggestions', () => {
  assert.equal(getEventDetailType('onDrop', 'control'), '{ files: File[]; types: string[]; text?: string }');
  assert.ok(getEventReferenceShortcuts('onSubmit', 'control').some((item) => item.path === 'ctx.changedFields'));
  assert.ok(getEventReferenceShortcuts('onChange', 'control').some((item) => item.path === 'ctx.detail.previousValue'));
  const controlHandlesDoc = getBehaviorDocBySlug('control-handles-reference');
  assert.ok(controlHandlesDoc && 'sections' in controlHandlesDoc);
  assert.ok(controlHandlesDoc.sections.some((section) =>
    section.shortcuts?.some((item) => item.path === 'ctx.controls.approvalResults.value = rows')));
});
