import React from 'react';
import { DesignerIcon } from '../../designer/icons';
import MarkdownRenderer from '../MarkdownRenderer';
import { useMarkdown } from '../../hooks/useMarkdown';
import type {
  BehaviorApiReference,
  BehaviorDocExample,
  BehaviorReferenceField,
  BehaviorReferenceShortcut,
} from '../../services/io/behaviorDocs';
export { computeMatchScore, fuzzyFilter, inferCategory } from '../../services/io/docs/doc-content';

/**
 * 文档内容渲染与过滤共享模块。
 *
 * 三个文档页面（DocModal / SectionPage / BehaviorDocsPage）曾逐字复制
 * 这些渲染、过滤与分类函数，修复必须重复三处且已开始漂移。
 * 这里收敛为单一接口，页面只 import。
 */

export function DocSectionBody({ body, markdownBody }: { body?: string; markdownBody?: string }) {
  const mdContent = useMarkdown(markdownBody);

  if (markdownBody) {
    if (!mdContent) return <div className="docs-empty-inline">加载中...</div>;
    return <MarkdownRenderer content={mdContent} />;
  }

  if (body) return <p className="docs-lead">{body}</p>;
  return null;
}

/** 文档块正文：Markdown 或逐行正文段落。 */
export function CatalogBlockBody({ body, markdownBody }: { body?: string; markdownBody?: string }) {
  const mdContent = useMarkdown(markdownBody);

  if (markdownBody) {
    if (!mdContent) return <div className="docs-empty-inline">加载中...</div>;
    return <MarkdownRenderer content={mdContent} />;
  }

  if (!body) return null;
  return <>{body.split('\n').map((line, indexLine) => <p key={indexLine}>{line}</p>)}</>;
}

/** 行为参考字段表。 */
export function ReferenceFieldTable({ fields }: { fields: BehaviorReferenceField[] }) {
  if (fields.length === 0) return <div className="docs-empty-inline">暂无字段说明。</div>;
  return (
    <div className="docs-table">
      {fields.map((field) => (
        <div key={field.name} className="docs-table-row">
          <div className="docs-table-key">
            <code>{field.name}</code>
            <span>{field.type}</span>
          </div>
          <div className="docs-table-value">{field.description}</div>
        </div>
      ))}
    </div>
  );
}

/** 行为参考 API 列表。 */
export function ApiReferenceList({ apis }: { apis: BehaviorApiReference[] }) {
  if (apis.length === 0) return <div className="docs-empty-inline">当前条目没有 API 说明。</div>;
  return (
    <div className="docs-card-list">
      {apis.map((api) => (
        <article key={api.name} className="docs-card">
          <div className="docs-card-title">
            <strong>{api.name}</strong>
            <code>{api.signature}</code>
          </div>
          <p>{api.description}</p>
        </article>
      ))}
    </div>
  );
}

/** 行为参考快捷 reference 列表。 */
export function ShortcutList({ shortcuts }: { shortcuts: BehaviorReferenceShortcut[] }) {
  if (shortcuts.length === 0) return <div className="docs-empty-inline">当前条目没有快捷 reference。</div>;
  return (
    <div className="docs-card-list">
      {shortcuts.map((shortcut) => (
        <article key={shortcut.path} className="docs-card docs-card-compact">
          <div className="docs-card-title">
            <code>{shortcut.path}</code>
          </div>
          <p>{shortcut.description}</p>
        </article>
      ))}
    </div>
  );
}

/** 行为参考示例列表。 */
export function ExampleList({ examples }: { examples: BehaviorDocExample[] }) {
  if (examples.length === 0) return null;
  return (
    <div className="docs-card-list">
      {examples.map((example) => (
        <article key={example.title} className="docs-card">
          <div className="docs-card-title">
            <strong>{example.title}</strong>
          </div>
          <pre className="docs-code-block"><code>{example.code}</code></pre>
        </article>
      ))}
    </div>
  );
}

/** 标签筛选器。 */
export function TagFilter({
  allTags,
  selectedTags,
  onToggle,
}: {
  allTags: string[];
  selectedTags: Set<string>;
  onToggle: (tag: string) => void;
}) {
  if (allTags.length === 0) return null;
  return (
    <div className="docs-tag-filter">
      {allTags.map((tag) => (
        <button
          key={tag}
          type="button"
          className={`docs-tag-pill ${selectedTags.has(tag) ? 'docs-tag-pill--active' : ''}`}
          onClick={() => onToggle(tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

export function SearchIcon() {
  return (
    <span className="docs-search-icon" aria-hidden="true">
      <DesignerIcon name="search" size={16} />
    </span>
  );
}
