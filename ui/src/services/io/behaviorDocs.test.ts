import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.equal(getBehaviorDocBySlug('control-handles-reference')?.title, 'controls Reference');
});

test('control event detail metadata stays aligned with suggestions', () => {
  assert.equal(getEventDetailType('onDrop', 'control'), '{ files: File[]; types: string[]; text?: string }');
  assert.ok(getEventReferenceShortcuts('onSubmit', 'control').some((item) => item.path === 'ctx.changedFields'));
  assert.ok(getEventReferenceShortcuts('onChange', 'control').some((item) => item.path === 'ctx.detail.previousValue'));
  const controlHandlesDoc = getBehaviorDocBySlug('control-handles-reference');
  assert.ok(controlHandlesDoc && 'sections' in controlHandlesDoc);
  assert.ok(controlHandlesDoc.sections.some((section) =>
    section.shortcuts?.some((item) => item.path === "controls['状态'].value = '已批准'")));
});

test('behavior rule syntax topic doc exposes markdown reference sections for grammar and execution', () => {
  const syntaxDoc = getBehaviorDocBySlug('behavior-rule-syntax');
  assert.ok(syntaxDoc && 'sections' in syntaxDoc);
  assert.equal(syntaxDoc.sections[0]?.markdownBody, 'behavior-rule-syntax-overview.md');
  assert.equal(syntaxDoc.sections[1]?.markdownBody, 'behavior-rule-syntax-grammar.md');
  assert.equal(syntaxDoc.sections[2]?.markdownBody, 'behavior-rule-syntax-execution.md');
  assert.equal(syntaxDoc.sections[3]?.markdownBody, 'behavior-rule-syntax-examples.md');
  assert.ok(syntaxDoc.sections[1]?.shortcuts?.some((item) => item.path === 'before click("按钮名") -> 守卫动作(...)'));
  assert.ok(
    syntaxDoc.sections[3]?.examples?.some((item) => item.code.includes('compare($结束日期, ">=", $开始日期)')),
  );
});

function getMermaidBlocks(content: string) {
  return [...content.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)].map((match) => match[1].trim());
}

function normalizeBlock(block: string) {
  return block.replace(/\s+/g, ' ').trim();
}

test('behavior rule syntax split pages stay aligned with the main reference doc', () => {
  const mainDoc = readFileSync('docs/behavior-rule-syntax.md', 'utf8');
  const overviewDoc = readFileSync('ui/src/services/io/docs/markdown/behavior-rule-syntax-overview.md', 'utf8');
  const executionDoc = readFileSync('ui/src/services/io/docs/markdown/behavior-rule-syntax-execution.md', 'utf8');
  const examplesDoc = readFileSync('ui/src/services/io/docs/markdown/behavior-rule-syntax-examples.md', 'utf8');

  const mainMermaid = getMermaidBlocks(mainDoc);
  const overviewMermaid = getMermaidBlocks(overviewDoc);
  const executionMermaid = getMermaidBlocks(executionDoc);

  assert.equal(normalizeBlock(overviewMermaid[0] || ''), normalizeBlock(mainMermaid[0] || ''));
  assert.equal(normalizeBlock(executionMermaid[1] || ''), normalizeBlock(mainMermaid[2] || ''));
  assert.equal(normalizeBlock(executionMermaid[2] || ''), normalizeBlock(mainMermaid[3] || ''));

  for (const phrase of [
    '这门 DSL 能写什么',
    '每种语句怎么写',
    '写完以后什么时候执行',
    '遇到错误时为什么会被拦住',
  ]) {
    assert.match(overviewDoc, new RegExp(phrase));
  }

  for (const snippet of [
    'when $部门 == "技术部" -> show(@tech-stack); require($技术栈)',
    'compute $合计 = $数量 * $单价 watch($数量, $单价)',
    'on change($省份) -> options($城市, "city_table", "省份", $省份)',
    'on load -> set($状态, "草稿"); set($创建方式, "手动录入")',
    'before click("lookup") -> requireAny($教师ID, $姓名)',
    'before submit -> compare($结束日期, ">=", $开始日期)',
    'on submit -> run("save_employee"); message("提交完成", success)',
  ]) {
    assert.match(examplesDoc, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(mainDoc, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const phrase of [
    '把 `else` 写远了',
    '动作之间用逗号分隔',
    'otherwise -> hide 技术栈',
    'compute 合计 = ... on change(数量)',
    'FFR000–099',
    'FFR300–399',
  ]) {
    assert.match(`${examplesDoc}\n${executionDoc}`, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(mainDoc, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
