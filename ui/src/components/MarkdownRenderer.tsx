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
 * 支持 editable 标记：````typescript editable` 渲染为可编辑代码沙盒
 */
function enhanceCodeBlocks(html: string): string {
  return html.replace(
    /<pre><code class="language-(\w+)(\s+editable)?">([\s\S]*?)<\/code><\/pre>/g,
    (_match, lang: string, editable: string | undefined, code: string) => {
      const isEditable = !!editable;
      let highlighted: string;
      try {
        highlighted = hljs.highlight(code, { language: lang }).value;
      } catch {
        highlighted = hljs.highlightAuto(code).value;
      }

      if (isEditable) {
        // 可编辑代码块：渲染为 CodeSandbox 容器
        const id = `sandbox-${Math.random().toString(36).slice(2, 8)}`;
        return `<div class="code-sandbox" id="${id}" data-lang="${lang}" data-code="${encodeURIComponent(code)}"><div class="code-sandbox-editor"><pre><code class="hljs language-${lang}">${highlighted}</code></pre></div><div class="code-sandbox-toolbar"><button type="button" class="code-sandbox-btn code-sandbox-btn--run" onclick="window.__runCodeSandbox && window.__runCodeSandbox('${id}')">▶ 运行</button><button type="button" class="code-sandbox-btn" onclick="window.__resetCodeSandbox && window.__resetCodeSandbox('${id}')">↺ 重置</button></div><div class="code-sandbox-output" id="${id}-output"></div></div>`;
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

  // 初始化可编辑代码块和折叠块
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

    // 将可编辑代码块的 <pre><code> 替换为 <textarea>
    const sandboxes = containerRef.current.querySelectorAll('.code-sandbox');
    sandboxes.forEach((sandbox) => {
      const pre = sandbox.querySelector('pre');
      if (!pre) return;
      const code = decodeURIComponent(sandbox.getAttribute('data-code') || '');
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.className = 'code-sandbox-textarea';
      textarea.spellcheck = false;
      pre.replaceWith(textarea);
    });

    // 注册全局运行/重置函数
    const mockNodes: Record<string, (...args: any[]) => any> = {
      valueInput: (opts: any) => ({
        outputs: { value: opts?.value ?? '', name: opts?.name ?? '', valueType: opts?.valueType ?? 'string' },
      }),
      optionInput: (opts: any) => ({
        outputs: { value: opts?.value ?? '', selected: opts?.selected ?? {} },
      }),
      filter: (opts: any) => {
        const input = opts?.input || [];
        const field = opts?.field || '';
        const op = opts?.operator || '==';
        const val = opts?.value;
        const result = input.filter((row: any) => {
          const v = row[field];
          switch (op) {
            case '==': return v == val;
            case '!=': return v != val;
            case '>': return v > val;
            case '<': return v < val;
            case '>=': return v >= val;
            case '<=': return v <= val;
            case 'contains': return String(v).includes(String(val));
            default: return true;
          }
        });
        return { outputs: { result, count: result.length } };
      },
      multiFilter: (opts: any) => {
        const input = opts?.input || [];
        const conditions = opts?.conditions || [];
        const logic = opts?.logic || 'and';
        const result = input.filter((row: any) => {
          const checks = conditions.map((c: any) => {
            const v = row[c.field];
            switch (c.operator) {
              case '==': return v == c.value;
              case '!=': return v != c.value;
              case '>': return v > c.value;
              case '<': return v < c.value;
              default: return true;
            }
          });
          return logic === 'and' ? checks.every(Boolean) : checks.some(Boolean);
        });
        return { outputs: { result, count: result.length } };
      },
      sort: (opts: any) => {
        const input = [...(opts?.input || [])];
        const field = opts?.field || '';
        const order = opts?.order || 'asc';
        input.sort((a: any, b: any) => {
          const va = a[field], vb = b[field];
          const cmp = va < vb ? -1 : va > vb ? 1 : 0;
          return order === 'desc' ? -cmp : cmp;
        });
        return { outputs: { result: input } };
      },
      recordTransform: (opts: any) => {
        const input = opts?.input || {};
        const mapping = JSON.parse(opts?.mapping || '{}');
        const defaults = JSON.parse(opts?.defaults || '{}');
        const result: Record<string, any> = { ...defaults };
        for (const [newKey, oldKey] of Object.entries(mapping)) {
          if (typeof oldKey === 'string' && oldKey in input) result[newKey] = input[oldKey];
        }
        return { outputs: { result } };
      },
      export: (opts: any) => ({
        outputs: {
          result: opts?.data,
          fileName: `${opts?.fileName || 'export'}.${opts?.format || 'xlsx'}`,
          mimeType: opts?.format === 'csv' ? 'text/csv' : 'application/json',
        },
      }),
      jsonToSheet: (opts: any) => ({
        outputs: { worksheet: { '!ref': `A1:B${(opts?.data?.length || 0) + 1}` } },
      }),
      kmeans: (opts: any) => {
        const data = opts?.data || [];
        const k = opts?.k || 3;
        const result = data.map((row: any, i: number) => ({ ...row, cluster: i % k }));
        return { outputs: { result, centers: [], inertia: 0 } };
      },
    };

    (window as any).__runCodeSandbox = (id: string) => {
      const sandbox = document.getElementById(id);
      if (!sandbox) return;
      const textarea = sandbox.querySelector('textarea');
      const output = document.getElementById(`${id}-output`);
      if (!textarea || !output) return;

      const code = textarea.value;
      output.textContent = '';
      output.className = 'code-sandbox-output';

      try {
        const logs: string[] = [];
        const mockConsole = {
          log: (...args: any[]) => logs.push(args.map(String).join(' ')),
          warn: (...args: any[]) => logs.push('[WARN] ' + args.map(String).join(' ')),
          error: (...args: any[]) => logs.push('[ERROR] ' + args.map(String).join(' ')),
        };

        const fn = new Function('nodes', 'console', code);
        const result = fn(mockNodes, mockConsole);

        if (logs.length > 0) {
          output.textContent = logs.join('\n');
        } else if (result !== undefined) {
          output.textContent = JSON.stringify(result, null, 2);
        } else {
          output.textContent = '(无输出)';
        }
        output.classList.add('code-sandbox-output--success');
      } catch (err: any) {
        output.textContent = `Error: ${err.message}`;
        output.classList.add('code-sandbox-output--error');
      }
    };

    (window as any).__resetCodeSandbox = (id: string) => {
      const sandbox = document.getElementById(id);
      if (!sandbox) return;
      const textarea = sandbox.querySelector('textarea');
      const output = document.getElementById(`${id}-output`);
      if (textarea) textarea.value = decodeURIComponent(sandbox.getAttribute('data-code') || '');
      if (output) {
        output.textContent = '';
        output.className = 'code-sandbox-output';
      }
    };

    return () => {
      delete (window as any).__runCodeSandbox;
      delete (window as any).__resetCodeSandbox;
    };
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={`docs-markdown-content ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
