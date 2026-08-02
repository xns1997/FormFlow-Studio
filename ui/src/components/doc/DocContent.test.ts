import assert from 'node:assert/strict';
import test from 'node:test';
import { computeMatchScore, fuzzyFilter, inferCategory } from '../../services/io/docs/doc-content';
import type { BehaviorEventDocEntry, BehaviorTopicDocEntry } from '../../services/io/docs/types';

function eventDoc(partial: Partial<BehaviorEventDocEntry>): BehaviorEventDocEntry {
  return {
    id: 'event:test', eventName: 'onChange', slug: 'on-change', title: '字段变化',
    category: '字段', scope: 'control', summary: '字段值变化时触发', triggerWhen: '',
    contextFields: [], detailFields: [], apis: [], suggestions: [], examples: [], relatedEvents: [],
    ...partial,
  } as BehaviorEventDocEntry;
}

function topicDoc(partial: Partial<BehaviorTopicDocEntry>): BehaviorTopicDocEntry {
  return {
    id: 'topic:test', slug: 'test', title: '测试主题', summary: '', category: undefined,
    sections: [],
    ...partial,
  } as BehaviorTopicDocEntry;
}

test('fuzzyFilter matches event name and title with multi-keyword ranking', () => {
  const docs = [
    eventDoc({ eventName: 'onFieldChange', title: '字段变化', category: '字段', tags: ['联动'] }),
    eventDoc({ eventName: 'onSubmit', title: '提交', category: '提交', tags: [] }),
    eventDoc({ eventName: 'onFieldBlur', title: '失焦', category: '字段', tags: ['联动'] }),
  ];
  const result = fuzzyFilter(docs, '字段 联动');
  assert.deepEqual(result.map((doc) => doc.eventName), ['onFieldChange', 'onFieldBlur']);
  assert.equal(fuzzyFilter(docs, '').length, docs.length);
  assert.equal(fuzzyFilter(docs, '不存在的词').length, 0);
});

test('computeMatchScore ranks event name above title and summary', () => {
  const doc = eventDoc({ eventName: 'onChange', title: '字段变化', category: '联动', summary: '变化时触发', tags: [] });
  assert.ok(computeMatchScore(doc, 'onchange') > computeMatchScore(doc, '字段'));
  assert.equal(computeMatchScore(doc, '不存在的词'), 0);
});

test('inferCategory prefers declared category then falls back to title/id match', () => {
  assert.equal(inferCategory(topicDoc({ category: '表单', title: '任意' }), ['行为', '表单']), '表单');
  assert.equal(inferCategory(topicDoc({ id: 'topic:flow-nodes', title: '流程节点' }), ['节点', '行为']), '节点');
  assert.equal(inferCategory(topicDoc({ title: '无匹配' }), ['行为', '节点']), '行为');
  assert.equal(inferCategory(topicDoc({ title: '无匹配' }), []), '全部');
});
