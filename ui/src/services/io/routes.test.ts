import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDocsPath, resolveDocCanonicalPath, resolveLegacyDocPath } from './routes';
import { behaviorTopicDocs, behaviorEventDocs } from './behaviorDocs';

test('buildDocsPath resolves known slugs to canonical reference paths', () => {
  assert.equal(buildDocsPath('behavior-rule-syntax'), '/docs/reference/behavior/behavior-rule-syntax');
  assert.equal(buildDocsPath('context-reference'), '/docs/reference/behavior/context-reference');
  assert.equal(buildDocsPath('field-change'), '/docs/reference/events/field-change');
  assert.equal(buildDocsPath(), '/docs');
});

test('unknown doc slugs fall back to search instead of a missing /docs/:slug route', () => {
  assert.equal(resolveDocCanonicalPath('not-a-real-doc'), '/docs?q=not-a-real-doc');
});

test('legacy behavior paths distinguish topics from events', () => {
  assert.equal(resolveLegacyDocPath('behavior', 'behavior-rule-syntax'), '/docs/reference/behavior/behavior-rule-syntax');
  assert.equal(resolveLegacyDocPath('behavior', 'field-change'), '/docs/reference/events/field-change');
});

test('all behavior topics and events have resolvable canonical doc paths', () => {
  for (const topic of behaviorTopicDocs) {
    assert.match(resolveDocCanonicalPath(topic.slug), /^\/docs\/reference\/behavior\//);
  }
  for (const event of behaviorEventDocs) {
    assert.match(resolveDocCanonicalPath(event.slug), /^\/docs\/reference\/events\//);
  }
});
