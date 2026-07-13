import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DesignerIcon } from '../../designer/icons';
import ComponentDocPlayground from '../../components/ComponentDocPlayground';
import { DocSidebar } from '../../components/DocSidebar';
import type {
  BehaviorApiReference,
  BehaviorDocExample,
  BehaviorReferenceField,
  BehaviorReferenceShortcut,
  BehaviorTopicDocEntry,
} from '../../services/io/behaviorDocs';

interface SectionPageProps {
  sectionId: string;
  sectionTitle: string;
  docs: BehaviorTopicDocEntry[];
  categories?: string[];
  basePath: string;
}

function ReferenceFieldTable({ fields }: { fields: BehaviorReferenceField[] }) {
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

function ApiReferenceList({ apis }: { apis: BehaviorApiReference[] }) {
  if (apis.length === 0) return null;
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
  if (shortcuts.length === 0) return null;
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

function ExampleList({ examples }: { examples: BehaviorDocExample[] }) {
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

function inferCategory(doc: BehaviorTopicDocEntry, categories: string[]) {
  if (doc.category) return doc.category;
  for (const category of categories) {
    if (doc.id.includes(category.toLowerCase()) || doc.title.includes(category)) return category;
  }
  return categories[0] || '全部';
}

export default function SectionPage({ sectionId, sectionTitle, docs, categories = [], basePath }: SectionPageProps) {
  const { slug } = useParams<{ slug?: string }>();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('全部');

  const docsWithCategory = useMemo(() => docs.map((doc) => ({
    ...doc,
    _category: inferCategory(doc, categories),
  })), [docs, categories]);

  const categoryOptions = useMemo(() => ['全部', ...new Set(docsWithCategory.map((doc) => doc._category).filter(Boolean))], [docsWithCategory]);

  const filteredDocs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return docsWithCategory.filter((doc) => {
      const categoryMatch = activeCategory === '全部' || doc._category === activeCategory;
      if (!categoryMatch) return false;
      if (!normalizedQuery) return true;
      return doc.title.toLowerCase().includes(normalizedQuery)
        || doc.summary.toLowerCase().includes(normalizedQuery)
        || doc.sections.some((section) =>
          section.title.toLowerCase().includes(normalizedQuery)
          || (section.body || '').toLowerCase().includes(normalizedQuery)
          || (section.fields || []).some((field) => field.name.toLowerCase().includes(normalizedQuery) || field.description.toLowerCase().includes(normalizedQuery))
          || (section.shortcuts || []).some((item) => item.path.toLowerCase().includes(normalizedQuery) || item.description.toLowerCase().includes(normalizedQuery))
        );
    });
  }, [activeCategory, docsWithCategory, query]);

  const currentDoc = slug ? docsWithCategory.find((doc) => doc.slug === slug) : undefined;
  const componentPlaygroundType = currentDoc && sectionId === 'form-design' && currentDoc.id.startsWith('form-design:')
    ? currentDoc.id.slice('form-design:'.length)
    : null;

  const tocSections = useMemo(() => {
    if (!currentDoc) return [];
    const sections = currentDoc.sections.map((section, index) => ({
      id: `section-${index}`,
      title: section.title,
    }));
    if (componentPlaygroundType) {
      return [{ id: 'section-playground', title: 'Playground' }, ...sections];
    }
    return sections;
  }, [componentPlaygroundType, currentDoc]);

  if (!slug) {
    return (
      <div className="page-container docs-page">
        <div className="page-header">
          <div>
            <nav className="docs-breadcrumb" aria-label="面包屑导航">
              <Link to="/docs" className="docs-breadcrumb-link">文档首页</Link>
              <span className="docs-breadcrumb-sep">{'>'}</span>
              <span className="docs-breadcrumb-current">{sectionTitle}</span>
            </nav>
            <h2>{sectionTitle}</h2>
            <p>共 {docs.length} 篇文档，按主题拆分为可快速浏览的大文档入口。</p>
          </div>
          <div className="header-actions">
            <Link to="/docs" className="docs-link-button">返回文档首页</Link>
          </div>
        </div>

        <section className="docs-index-panel">
          <div className="docs-index-toolbar">
            <strong>{sectionTitle}索引</strong>
            <div className="docs-search-wrapper">
              <DesignerIcon name="search" className="docs-search-icon" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`搜索${sectionTitle}文档...`}
                className="docs-search-input"
              />
            </div>
          </div>

          {categoryOptions.length > 2 && (
            <div className="docs-tag-filter">
              {categoryOptions.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`docs-tag-pill ${activeCategory === category ? 'docs-tag-pill--active' : ''}`}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          )}

          <div className="docs-index-columns">
            {filteredDocs.map((doc) => (
              <Link key={doc.id} to={`${basePath}/${doc.slug}`} className="docs-index-item">
                <span className="docs-index-item-title">{doc.title}</span>
                <span className="docs-index-item-meta">{doc._category}</span>
                <small>{doc.summary}</small>
              </Link>
            ))}
            {filteredDocs.length === 0 && (
              <div className="docs-empty-inline">没有匹配的文档。</div>
            )}
          </div>
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
            <p>当前路径没有关联到任何文档。</p>
          </div>
          <div className="header-actions">
            <Link to={basePath} className="docs-link-button">返回{sectionTitle}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container docs-page docs-page--with-sidebar">
      <div className="docs-page-main">
        <div className="page-header">
          <div>
            <nav className="docs-breadcrumb" aria-label="面包屑导航">
              <Link to="/docs" className="docs-breadcrumb-link">文档首页</Link>
              <span className="docs-breadcrumb-sep">{'>'}</span>
              <Link to={basePath} className="docs-breadcrumb-link">{sectionTitle}</Link>
              <span className="docs-breadcrumb-sep">{'>'}</span>
              <span className="docs-breadcrumb-current">{currentDoc.title}</span>
            </nav>
            <h2>{currentDoc.title}</h2>
            <p>{currentDoc.summary}</p>
          </div>
          <div className="header-actions">
            <Link to={basePath} className="docs-link-button">返回{sectionTitle}</Link>
          </div>
        </div>

        {componentPlaygroundType && (
          <ComponentDocPlayground componentType={componentPlaygroundType} title={currentDoc.title} />
        )}

        {currentDoc.sections.map((section, index) => (
          <section key={`${currentDoc.id}:${section.title}`} id={`section-${index}`} className="docs-section">
            <h3>{section.title}</h3>
            {section.body && <p className="docs-lead">{section.body}</p>}
            {section.fields && section.fields.length > 0 && <ReferenceFieldTable fields={section.fields} />}
            {section.apis && section.apis.length > 0 && <ApiReferenceList apis={section.apis} />}
            {section.shortcuts && section.shortcuts.length > 0 && <ShortcutList shortcuts={section.shortcuts} />}
            {section.examples && section.examples.length > 0 && <ExampleList examples={section.examples} />}
          </section>
        ))}
      </div>

      <aside className="docs-page-sidebar">
        <DocSidebar sections={tocSections} />
      </aside>
    </div>
  );
}
