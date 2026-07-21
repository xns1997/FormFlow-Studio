import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkdownContent from './MarkdownContent';

test('renders GFM markdown and safe external links', () => {
  const html = renderToStaticMarkup(createElement(MarkdownContent, { content: '**完成**\n\n| 项目 | 状态 |\n| --- | --- |\n| FormFlow | 通过 |\n\n[文档](https://example.com)' }));
  assert.match(html, /<strong>完成<\/strong>/); assert.match(html, /<table>/); assert.match(html, /noopener noreferrer/);
});

test('escapes raw HTML and drops dangerous URL protocols', () => {
  const html = renderToStaticMarkup(createElement(MarkdownContent, { content: '<script>alert(1)</script>\n\n[危险](javascript:alert(1))\n\n![危险图片](data:text/html,x)' }));
  assert.doesNotMatch(html, /<script>/); assert.doesNotMatch(html, /href="javascript:/); assert.doesNotMatch(html, /src="data:/); assert.match(html, /&lt;script&gt;/);
});
