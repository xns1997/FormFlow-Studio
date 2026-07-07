import React, { useMemo, useState, useCallback } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  behaviorEventDocs,
  behaviorTopicDocs,
  getBehaviorDocBySlug,
  getBehaviorDocsByScope,
  type BehaviorApiReference,
  type BehaviorEventDocEntry,
  type BehaviorReferenceField,
  type BehaviorReferenceShortcut,
} from '../../services/io/behaviorDocs';
import {
  buildDocsPath,
  buildDocsSectionPath,
  buildProjectSettingsPath,
  buildWorkspacePath,
  type ProjectSettingsSection,
  type WorkspaceTab,
} from '../../services/io/routes';
import { DocSidebar } from '../../components/DocSidebar';
import { DesignerIcon } from '../../designer/icons';

function ReferenceFieldTable({ fields }: { fields: BehaviorReferenceField[] }) {
  if (fields.length === 0) return <div className="docs-empty-inline">当前条目没有额外字段。</div>;
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

function ApiReferenceList({ apis }: { apis: BehaviorApiReference[] }) {
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

function ShortcutList({ shortcuts }: { shortcuts: BehaviorReferenceShortcut[] }) {
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

function EventLink({
  doc,
  active,
  search = '',
}: {
  doc: BehaviorEventDocEntry;
  active?: boolean;
  search?: string;
}) {
  return (
    <Link
      to={`${buildDocsSectionPath('behavior', doc.slug)}${search}`}
      className={`docs-index-item ${active ? 'active' : ''}`}
    >
      <span className="docs-index-item-title">{doc.title}</span>
      <span className="docs-index-item-meta">{doc.eventName}</span>
      <small>{doc.summary}</small>
    </Link>
  );
}

function computeMatchScore(doc: BehaviorEventDocEntry, keyword: string): number {
  const kw = keyword.toLowerCase();
  let score = 0;
  if (doc.eventName.toLowerCase().includes(kw)) score += 3;
  if (doc.title.toLowerCase().includes(kw)) score += 2;
  if (doc.tags?.some((t) => t.toLowerCase().includes(kw))) score += 2;
  if (doc.category.toLowerCase().includes(kw)) score += 1;
  if (doc.summary.toLowerCase().includes(kw)) score += 1;
  return score;
}

function fuzzyFilter(docs: BehaviorEventDocEntry[], query: string): BehaviorEventDocEntry[] {
  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) return docs;

  const scored: Array<{ doc: BehaviorEventDocEntry; score: number }> = [];
  for (const doc of docs) {
    let totalScore = 0;
    let allMatch = true;
    for (const kw of keywords) {
      const s = computeMatchScore(doc, kw);
      if (s === 0) { allMatch = false; break; }
      totalScore += s;
    }
    if (allMatch) scored.push({ doc, score: totalScore });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.doc);
}

function SearchIcon() {
  return (
    <span className="docs-search-icon" aria-hidden="true">
      <DesignerIcon name="search" size={16} />
    </span>
  );
}

function TagFilter({
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

function Breadcrumb({ title }: { title: string }) {
  return (
    <nav className="docs-breadcrumb" aria-label="面包屑导航">
      <Link to="/docs" className="docs-breadcrumb-link">文档首页</Link>
      <span className="docs-breadcrumb-sep">{'>'}</span>
      <Link to="/docs/behavior" className="docs-breadcrumb-link">行为</Link>
      <span className="docs-breadcrumb-sep">{'>'}</span>
      <span className="docs-breadcrumb-current">{title}</span>
    </nav>
  );
}

function PrevNextNav({
  prev,
  next,
  search,
}: {
  prev: BehaviorEventDocEntry | null;
  next: BehaviorEventDocEntry | null;
  search: string;
}) {
  if (!prev && !next) return null;
  return (
    <nav className="docs-prev-next" aria-label="上/下一篇导航">
      <div className="docs-prev-next-item docs-prev-next-prev">
        {prev && (
          <Link to={`${buildDocsSectionPath('behavior', prev.slug)}${search}`}>
            <span className="docs-prev-next-label">上一篇</span>
            <span className="docs-prev-next-title">{prev.title}</span>
          </Link>
        )}
      </div>
      <div className="docs-prev-next-item docs-prev-next-next">
        {next && (
          <Link to={`${buildDocsSectionPath('behavior', next.slug)}${search}`}>
            <span className="docs-prev-next-label">下一篇</span>
            <span className="docs-prev-next-title">{next.title}</span>
          </Link>
        )}
      </div>
    </nav>
  );
}

function extractTocSections(doc: BehaviorEventDocEntry): Array<{ id: string; title: string }> {
  const sections: Array<{ id: string; title: string }> = [];
  const titles = [
    '触发时机',
    '通用上下文',
    '当前事件 Detail',
    '可用 API',
    '快捷 Reference',
    'Suggestion / 最佳实践',
    '示例代码',
    '相关事件',
    '同类事件',
  ];
  for (const title of titles) {
    const id = `section-${title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, '-').toLowerCase()}`;
    sections.push({ id, title });
  }
  if (!doc.referenceShortcuts || doc.referenceShortcuts.length === 0) {
    const idx = sections.findIndex((s) => s.title === '快捷 Reference');
    if (idx !== -1) sections.splice(idx, 1);
  }
  return sections;
}

export default function BehaviorDocsPage() {
  const { slug } = useParams<{ slug?: string }>();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const currentDoc = getBehaviorDocBySlug(slug);
  const scriptDocs = getBehaviorDocsByScope('script');
  const controlDocs = getBehaviorDocsByScope('control');

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const doc of behaviorEventDocs) {
      for (const tag of doc.tags ?? []) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const searchParams = new URLSearchParams(location.search);
  const categoryFilter = searchParams.get('category') || '';

  const filteredEvents = useMemo(() => {
    const hasQuery = query.trim().length > 0;
    const hasTags = selectedTags.size > 0;
    const hasCategory = categoryFilter.length > 0;

    let docs = behaviorEventDocs;

    if (hasCategory) {
      docs = docs.filter((doc) => doc.category === categoryFilter);
    }

    if (hasQuery && hasTags) {
      const queryFiltered = fuzzyFilter(docs, query);
      const tagFiltered = docs.filter((doc) =>
        doc.tags?.some((t) => selectedTags.has(t))
      );
      const queryIds = new Set(queryFiltered.map((d) => d.id));
      docs = tagFiltered.filter((d) => queryIds.has(d.id));
    } else if (hasQuery) {
      docs = fuzzyFilter(docs, query);
    } else if (hasTags) {
      docs = docs.filter((doc) => doc.tags?.some((t) => selectedTags.has(t)));
    }

    return docs;
  }, [query, selectedTags, categoryFilter]);

  const filteredScriptDocs = filteredEvents.filter((doc) => doc.scope === 'script');
  const filteredControlDocs = filteredEvents.filter((doc) => doc.scope === 'control');
  const returnContext = (() => {
    const search = new URLSearchParams(location.search);
    const fromProject = search.get('fromProject') || '';
    const fromPage = search.get('fromPage') || 'workspace';
    const fromTab = search.get('fromTab') || (fromPage === 'settings' ? 'general' : 'behavior');
    const workspaceTab = ['data', 'canvas', 'designer', 'behavior', 'test'].includes(fromTab) ? fromTab as WorkspaceTab : 'behavior';
    const settingsSection = ['general', 'versions', 'behavior', 'publish'].includes(fromTab) ? fromTab as ProjectSettingsSection : 'general';
    if (!fromProject) return null;
    return {
      label: fromPage === 'settings' ? '返回项目设置' : '返回项目工作区',
      to: fromPage === 'settings'
        ? buildProjectSettingsPath(fromProject, settingsSection)
        : buildWorkspacePath(fromProject, workspaceTab),
    };
  })();

  if (!slug) {
    return (
      <div className="page-container docs-page">
        <div className="page-header">
          <div>
            <nav className="docs-breadcrumb" aria-label="面包屑导航">
              <Link to="/docs" className="docs-breadcrumb-link">文档首页</Link>
              <span className="docs-breadcrumb-sep">{'>'}</span>
              <span className="docs-breadcrumb-current">行为</span>
            </nav>
            <h2>行为文档中心</h2>
            <p>统一查看脚本行为事件、控件运行时事件、上下文和流程参数 reference。</p>
          </div>
          <div className="header-actions">
            {returnContext && <Link to={returnContext.to} className="docs-link-button">{returnContext.label}</Link>}
          </div>
        </div>

        <section className="docs-hero-grid">
          {behaviorTopicDocs.map((topic) => (
            <Link key={topic.slug} to={`${buildDocsSectionPath('behavior', topic.slug)}${location.search}`} className="docs-topic-card">
              <strong>{topic.title}</strong>
              <p>{topic.summary}</p>
            </Link>
          ))}
        </section>

        <section className="docs-index-panel">
          <div className="docs-index-toolbar">
            <strong>事件索引</strong>
            <div className="docs-search-wrapper">
              <SearchIcon />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索事件名、用途或分类（支持多关键词空格分隔）"
                className="docs-search-input"
              />
            </div>
          </div>

          <TagFilter allTags={allTags} selectedTags={selectedTags} onToggle={toggleTag} />

          <div className="docs-index-columns">
            <div className="docs-index-column">
              <h3>行为脚本事件</h3>
              {filteredScriptDocs.length === 0
                ? <div className="docs-empty-inline">没有匹配的脚本事件。</div>
                : filteredScriptDocs.map((doc) => <EventLink key={doc.id} doc={doc} search={location.search} />)}
            </div>
            <div className="docs-index-column">
              <h3>控件运行时事件</h3>
              {filteredControlDocs.length === 0
                ? <div className="docs-empty-inline">没有匹配的控件事件。</div>
                : filteredControlDocs.map((doc) => <EventLink key={doc.id} doc={doc} search={location.search} />)}
            </div>
          </div>
        </section>

        <section className="docs-footer-note">
          <p>脚本事件共 {scriptDocs.length} 个，控件运行时事件共 {controlDocs.length} 个。编辑器内提示、右侧 reference 和文档页共用同一份事件元数据。</p>
        </section>
      </div>
    );
  }

  if (!currentDoc) {
    return (
      <div className="page-container docs-page">
        <div className="page-header">
          <div>
            <h2>未找到文档</h2>
            <p>当前 slug 没有关联到任何行为事件或主题页。</p>
          </div>
          <div className="header-actions">
            <Link to="/docs/behavior" className="docs-link-button">返回行为文档</Link>
            {returnContext && <Link to={returnContext.to} className="docs-link-button">{returnContext.label}</Link>}
          </div>
        </div>
      </div>
    );
  }

  if ('sections' in currentDoc) {
    return (
      <div className="page-container docs-page">
        <div className="page-header">
          <div>
            <Breadcrumb title={currentDoc.title} />
            <h2>{currentDoc.title}</h2>
            <p>{currentDoc.summary}</p>
          </div>
          <div className="header-actions">
            <Link to="/docs/behavior" className="docs-link-button">行为文档</Link>
            {returnContext && <Link to={returnContext.to} className="docs-link-button">{returnContext.label}</Link>}
          </div>
        </div>

        {currentDoc.sections.map((section) => (
          <section key={section.title} className="docs-section">
            <h3>{section.title}</h3>
            {section.body && <p className="docs-lead">{section.body}</p>}
            {section.fields && <ReferenceFieldTable fields={section.fields} />}
            {section.apis && <ApiReferenceList apis={section.apis} />}
            {section.shortcuts && <ShortcutList shortcuts={section.shortcuts} />}
          </section>
        ))}
      </div>
    );
  }

  const relatedDocs = currentDoc.relatedEvents
    .map((eventName) => behaviorEventDocs.find((item) => item.eventName === eventName && item.scope === currentDoc.scope))
    .filter(Boolean) as BehaviorEventDocEntry[];
  const siblingDocs = behaviorEventDocs.filter((item) => item.scope === currentDoc.scope);
  const currentIndex = siblingDocs.findIndex((d) => d.id === currentDoc.id);
  const prevDoc = currentIndex > 0 ? siblingDocs[currentIndex - 1] : null;
  const nextDoc = currentIndex < siblingDocs.length - 1 ? siblingDocs[currentIndex + 1] : null;
  const tocSections = extractTocSections(currentDoc);

  return (
    <div className="page-container docs-page docs-page--with-sidebar">
      <div className="docs-page-main">
        <div className="page-header">
          <div>
            <Breadcrumb title={currentDoc.title} />
            <h2>{currentDoc.title}</h2>
            <p>{currentDoc.summary}</p>
          </div>
          <div className="header-actions">
            <Link to="/docs/behavior" className="docs-link-button">行为文档</Link>
            {returnContext && <Link to={returnContext.to} className="docs-link-button">{returnContext.label}</Link>}
          </div>
        </div>

        <section className="docs-meta-row">
          <div className="docs-meta-card">
            <span>事件名</span>
            <strong>{currentDoc.eventName}</strong>
          </div>
          <div className="docs-meta-card">
            <span>范围</span>
            <strong>{currentDoc.scope === 'control' ? '控件运行时事件' : '行为脚本事件'}</strong>
          </div>
          <div className="docs-meta-card">
            <span>分类</span>
            <strong>{currentDoc.category}</strong>
          </div>
        </section>

        <section className="docs-section" id="section-触发时机">
          <h3>触发时机</h3>
          <p className="docs-lead">{currentDoc.triggerWhen}</p>
        </section>

        <section className="docs-section" id="section-通用上下文">
          <h3>通用上下文</h3>
          <ReferenceFieldTable fields={currentDoc.contextFields} />
        </section>

        <section className="docs-section" id="section-当前事件-detail">
          <h3>当前事件 Detail</h3>
          {currentDoc.detailType && <p className="docs-lead"><code>{currentDoc.detailType}</code></p>}
          <ReferenceFieldTable fields={currentDoc.detailFields} />
        </section>

        <section className="docs-section" id="section-可用-api">
          <h3>可用 API</h3>
          <ApiReferenceList apis={currentDoc.apis} />
        </section>

        {currentDoc.referenceShortcuts && currentDoc.referenceShortcuts.length > 0 && (
          <section className="docs-section" id="section-快捷-reference">
            <h3>快捷 Reference</h3>
            <ShortcutList shortcuts={currentDoc.referenceShortcuts} />
          </section>
        )}

        <section className="docs-section" id="section-suggestion-最佳实践">
          <h3>Suggestion / 最佳实践</h3>
          <div className="docs-card-list">
            {currentDoc.suggestions.map((suggestion) => (
              <article key={suggestion} className="docs-card docs-card-compact">
                <p>{suggestion}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="docs-section" id="section-示例代码">
          <h3>示例代码</h3>
          <div className="docs-card-list">
            {currentDoc.examples.map((example) => (
              <article key={example.title} className="docs-card">
                <div className="docs-card-title">
                  <strong>{example.title}</strong>
                </div>
                <pre className="docs-code-block"><code>{example.code}</code></pre>
              </article>
            ))}
          </div>
        </section>

        <section className="docs-section" id="section-相关事件">
          <h3>相关事件</h3>
          <div className="docs-link-grid">
            {relatedDocs.length === 0
              ? <div className="docs-empty-inline">当前事件暂无同范围的相关事件。</div>
              : relatedDocs.map((doc) => <EventLink key={doc.id} doc={doc} search={location.search} />)}
          </div>
        </section>

        <section className="docs-section" id="section-同类事件">
          <h3>同类事件</h3>
          <div className="docs-link-grid">
            {siblingDocs.slice(0, 8).map((doc) => <EventLink key={doc.id} doc={doc} active={doc.id === currentDoc.id} search={location.search} />)}
          </div>
        </section>

        <PrevNextNav prev={prevDoc} next={nextDoc} search={location.search} />
      </div>

      <aside className="docs-page-sidebar">
        <DocSidebar sections={tocSections} />
      </aside>
    </div>
  );
}
