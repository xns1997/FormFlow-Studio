import React, { useMemo } from 'react';
import { Marked } from 'marked';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function safeUrl(value: string) {
  const trimmed = value.trim();
  if (/^(https?:|mailto:|tel:)/i.test(trimmed) || /^(\/|#|\.\/|\.\.\/)/.test(trimmed)) return trimmed;
  return '';
}

const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html({ text }) { return escapeHtml(text); },
    link({ href, title, tokens }) {
      const url = safeUrl(href); const label = this.parser.parseInline(tokens);
      if (!url) return label;
      const external = /^https?:/i.test(url);
      return `<a href="${escapeHtml(url)}"${title ? ` title="${escapeHtml(title)}"` : ''}${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
    },
    image({ href, title, text }) {
      const url = safeUrl(href); if (!url) return escapeHtml(text || '图片');
      return `<img src="${escapeHtml(url)}" alt="${escapeHtml(text || '')}"${title ? ` title="${escapeHtml(title)}"` : ''} loading="lazy" />`;
    },
  },
});

export default function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  const html = useMemo(() => String(markdown.parse(content || '')), [content]);
  return <div className={`markdown-content ${className}`.trim()} dangerouslySetInnerHTML={{ __html: html }} />;
}
