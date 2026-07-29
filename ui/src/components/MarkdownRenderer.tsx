import React, { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';

// 注册常用语言
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * 解析 GitHub 风格的提示框语法
 * > [!NOTE] 内容 → <div class="docs-callout docs-callout--note">...</div>
 */
function transformCallouts(html: string): string {
  // 匹配 blockquote 中的 [!TYPE] 语法
  return html.replace(
    /<blockquote>\s*<p>\s*\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*/gi,
    (_match, type: string) => {
      const lower = type.toLowerCase();
      const icons: Record<string, string> = {
        note: '📝',
        tip: '💡',
        warning: '⚠️',
        important: '❗',
        caution: '🔴',
      };
      return `<div class="docs-callout docs-callout--${lower}"><div class="docs-callout-header"><span class="docs-callout-icon">${icons[lower] || '📌'}</span><span class="docs-callout-type">${type}</span></div><div class="docs-callout-body">`;
    },
  ).replace(
    /<\/p>\s*<\/blockquote>/gi,
    '</div></div>',
  );
}

/**
 * 为代码块添加语言标签和复制按钮
 */
function enhanceCodeBlocks(html: string): string {
  return html.replace(
    /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
    (_match, lang: string, code: string) => {
      let highlighted: string;
      try {
        highlighted = hljs.highlight(code, { language: lang }).value;
      } catch {
        highlighted = hljs.highlightAuto(code).value;
      }
      return `<div class="doc-code-block-enhanced"><div class="doc-code-header"><span class="doc-code-lang">${lang}</span><button type="button" class="doc-code-copy" data-code="${encodeURIComponent(code)}" onclick="navigator.clipboard.writeText(decodeURIComponent(this.dataset.code));this.textContent='已复制';setTimeout(()=>this.textContent='复制',1500)">复制</button></div><pre><code class="hljs language-${lang}">${highlighted}</code></pre></div>`;
    },
  );
}

/**
 * 处理折叠块 <details>/<summary>
 * 保持原生行为，添加自定义样式类
 */
function enhanceDetails(html: string): string {
  return html.replace(
    /<details>/g,
    '<details class="docs-collapse">',
  ).replace(
    /<summary>(.*?)<\/summary>/g,
    '<summary class="docs-collapse-header"><span class="docs-collapse-arrow">▶</span>$1</summary>',
  );
}

/**
 * 为表格添加样式类
 */
function enhanceTables(html: string): string {
  return html.replace(
    /<table>/g,
    '<div class="docs-table-wrapper"><table class="docs-markdown-table">',
  ).replace(
    /<\/table>/g,
    '</table></div>',
  );
}

// 配置 marked
const renderer = new marked.Renderer();

// 链接在新标签页打开
renderer.link = ({ href, title, text }) => {
  const titleAttr = title ? ` title="${title}"` : '';
  return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

marked.setOptions({
  renderer,
  breaks: true,
  gfm: true,
});

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    const raw = marked.parse(content) as string;
    let result = transformCallouts(raw);
    result = enhanceCodeBlocks(result);
    result = enhanceDetails(result);
    result = enhanceTables(result);
    return result;
  }, [content]);

  // 处理代码块内的 HTML 实体
  useEffect(() => {
    if (!containerRef.current) return;
    // 折叠块箭头动画
    const details = containerRef.current.querySelectorAll('details');
    details.forEach((detail) => {
      const arrow = detail.querySelector('.docs-collapse-arrow');
      if (!arrow) return;
      const updateArrow = () => {
        arrow.textContent = detail.open ? '▼' : '▶';
      };
      detail.addEventListener('toggle', updateArrow);
      updateArrow();
    });
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={`docs-markdown-content ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
