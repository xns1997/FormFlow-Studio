import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../project/types';
import {
  callContextAt,
  collectDslFoldingRanges,
  collectDslSymbols,
  dslInlineCompletionText,
  dslReferenceFixCandidates,
  normalizeBehaviorDslDocument,
  normalizeBehaviorDslLine,
  scanDslLine,
  type BehaviorDslServicesContext,
} from './behaviorDslLanguageServices';

const component = { id: 'tech-stack', type: 'input', x: 0, y: 0, width: 100, height: 32, props: { label: '技术栈' } } as DesignComponent;
const table = { id: 'city_table', fileName: '城市表.xlsx', sheets: [] } as unknown as SrcTableEntry;
const workflow = { id: 'wf1', name: '审批流程', nodes: [], edges: [] } as unknown as WorkflowFile;
const ctx: BehaviorDslServicesContext = {
  fields: ['部门', '技术栈', '合计'],
  components: [component],
  tables: [table],
  workflows: [workflow],
};

test('scanDslLine classifies fields, components, actions and operators', () => {
  const tokens = scanDslLine('when $部门 == "技术部" -> show(@tech-stack); require($技术栈)');
  assert.ok(tokens.some((token) => token.kind === 'keyword' && token.text === 'when'));
  assert.ok(tokens.some((token) => token.kind === 'field' && token.text === '$部门'));
  assert.ok(tokens.some((token) => token.kind === 'string' && token.text === '"技术部"'));
  assert.ok(tokens.some((token) => token.kind === 'operator' && token.text === '->'));
  assert.ok(tokens.some((token) => token.kind === 'action' && token.text === 'show'));
  assert.ok(tokens.some((token) => token.kind === 'component' && token.text === '@tech-stack'));
  assert.ok(tokens.some((token) => token.kind === 'action' && token.text === 'require'));
});

test('callContextAt reports the enclosing action and argument index', () => {
  const line = 'when $x -> options($城市, "city_table", "省份", $省份)';
  assert.equal(callContextAt(line, line.indexOf('"city_table"') + 2)?.name, 'options');
  assert.equal(callContextAt(line, line.indexOf('"city_table"') + 2)?.index, 1);
  assert.equal(callContextAt(line, line.indexOf('options(') + 9)?.index, 0);
  assert.equal(callContextAt('when $x == "y" -> show(@a)', 10), null);
});

test('normalizeBehaviorDslLine normalizes spacing, quotes and unary minus', () => {
  assert.equal(
    normalizeBehaviorDslLine(`when $部门=="技术部"->show( @技术栈 );require($技术栈)`),
    'when $部门 == "技术部" -> show(@技术栈); require($技术栈)',
  );
  assert.equal(normalizeBehaviorDslLine(`message('a -> b',warning)`), 'message("a -> b", warning)');
  assert.equal(normalizeBehaviorDslLine('set($合计, $数量*-1)'), 'set($合计, $数量 * -1)');
  assert.equal(normalizeBehaviorDslLine('when $x>=5 -> show(@a)'), 'when $x >= 5 -> show(@a)');
  assert.equal(normalizeBehaviorDslLine('#  注释  '), '#  注释');
});

test('normalizeBehaviorDslDocument groups blocks with a single blank line and keeps when/else adjacent', () => {
  const formatted = normalizeBehaviorDslDocument([
    'when $部门 == "技术部" -> show(@tech-stack)',
    'else -> hide(@tech-stack)',
    '',
    '',
    'compute $合计 = $数量 * $单价 watch($数量, $单价)',
    '',
    '# 注释',
    'on change($省份) -> options($城市, "city_table", "省份", $省份)',
  ].join('\n'));
  assert.equal(formatted, [
    'when $部门 == "技术部" -> show(@tech-stack)',
    'else -> hide(@tech-stack)',
    '',
    'compute $合计 = $数量 * $单价 watch($数量, $单价)',
    '',
    '# 注释',
    'on change($省份) -> options($城市, "city_table", "省份", $省份)',
    '',
  ].join('\n'));
  assert.ok(!formatted.includes('\n\n\n'), '连续空行应折叠');
  assert.ok(formatted.includes('else -> hide(@tech-stack)\n\ncompute'), 'when/else 与后续规则块之间一空行');
});

test('dslReferenceFixCandidates lists replacements for unknown references', () => {
  const candidates = dslReferenceFixCandidates(
    'when $未知 == "x" -> show(@nope); run("wf-x"); options($a, "tab-x", "省份", 1)',
    ctx,
  );
  assert.ok(candidates.some((item) => item.kind === 'field' && item.fromText === '$未知' && item.candidates.includes('部门')));
  assert.ok(candidates.some((item) => item.kind === 'component' && item.fromText === '@nope' && item.candidates.includes('tech-stack')));
  assert.ok(candidates.some((item) => item.kind === 'workflow' && item.fromText === 'wf-x' && item.candidates.includes('wf1')));
  assert.ok(candidates.some((item) => item.kind === 'table' && item.fromText === 'tab-x' && item.candidates.includes('city_table')));
});

test('collectDslSymbols lists rules and comment blocks', () => {
  const symbols = collectDslSymbols('when $x == 1 -> show(@a)\nelse -> hide(@a)\n\n# 说明\n# 更多\non change($x) -> require($y)');
  assert.ok(symbols.some((symbol) => symbol.name.startsWith('when')));
  assert.ok(symbols.some((symbol) => symbol.name === 'else'));
  assert.ok(symbols.some((symbol) => symbol.name === '注释' && symbol.startLine === 4 && symbol.endLine === 5));
  assert.ok(symbols.some((symbol) => symbol.name.startsWith('on change')));
});

test('collectDslFoldingRanges folds comment blocks and rule groups', () => {
  const ranges = collectDslFoldingRanges('when $x == 1 -> show(@a)\nelse -> hide(@a)\n\n# 一\n# 二\non change($x) -> require($y)');
  assert.ok(ranges.some((range) => range.start === 1 && range.end === 2));
  assert.ok(ranges.some((range) => range.start === 4 && range.end === 5));
});

test('dslInlineCompletionText follows deterministic rule continuations', () => {
  assert.equal(dslInlineCompletionText('', ctx), 'when $部门 == "值" -> show(@tech-stack)');
  assert.equal(dslInlineCompletionText('when $部门 == "技术部"', ctx), ' -> show(@tech-stack)');
  assert.equal(dslInlineCompletionText('show(@tech-stack)', ctx), '; require($部门)');
  assert.equal(dslInlineCompletionText('set($合计, ', ctx), '$部门)');
  assert.equal(dslInlineCompletionText('compute $合计 = $数量 * $单价 watch($数量, $单价)', ctx), '');
});
