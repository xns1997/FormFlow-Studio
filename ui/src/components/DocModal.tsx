import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { DesignerIcon } from '../designer/icons';
import {
  backendDocs,
  behaviorEventDocs,
  behaviorTopicDocs,
  docSections,
  flowNodeCategories,
  flowNodeDocs,
  formDesignCategories,
  formDesignDocs,
  getBehaviorDocBySlug,
  getBehaviorDocsByScope,
  getDocSection,
  overviewDocs,
  type BehaviorApiReference,
  type BehaviorDocExample,
  type BehaviorEventDocEntry,
  type BehaviorReferenceField,
  type BehaviorReferenceShortcut,
  type BehaviorTopicDocEntry,
  type DocSection,
} from '../services/io/behaviorDocs';
import { DocSidebar } from './DocSidebar';
import ComponentDocPlayground from './ComponentDocPlayground';

interface DocModalProps {
  open: boolean;
  onClose: () => void;
  initialSlug?: string;
}

type DocSectionId = 'overview' | 'behavior' | 'form-design' | 'flow-nodes' | 'backend';

interface ModalRouteState {
  sectionId?: DocSectionId;
  slug?: string;
}

interface HotDoc {
  title: string;
  section: string;
  sectionId: DocSectionId;
  slug: string;
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

function SearchIcon() {
  return (
    <span className="docs-search-icon" aria-hidden="true">
      <DesignerIcon name="search" size={16} />
    </span>
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
      const score = computeMatchScore(doc, kw);
      if (score === 0) {
        allMatch = false;
        break;
      }
      totalScore += score;
    }
    if (allMatch) scored.push({ doc, score: totalScore });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((item) => item.doc);
}

function inferCategory(doc: BehaviorTopicDocEntry, categories: string[]) {
  if (doc.category) return doc.category;
  for (const category of categories) {
    if (doc.id.includes(category.toLowerCase()) || doc.title.includes(category)) return category;
  }
  return categories[0] || '全部';
}

function extractEventTocSections(doc: BehaviorEventDocEntry): Array<{ id: string; title: string }> {
  const sections = [
    { id: 'section-触发时机', title: '触发时机' },
    { id: 'section-通用上下文', title: '通用上下文' },
    { id: 'section-当前事件-detail', title: '当前事件 Detail' },
    { id: 'section-可用-api', title: '可用 API' },
    { id: 'section-快捷-reference', title: '快捷 Reference' },
    { id: 'section-suggestion-最佳实践', title: 'Suggestion / 最佳实践' },
    { id: 'section-示例代码', title: '示例代码' },
    { id: 'section-相关事件', title: '相关事件' },
    { id: 'section-同类事件', title: '同类事件' },
  ];
  if (!doc.referenceShortcuts?.length) {
    return sections.filter((section) => section.id !== 'section-快捷-reference');
  }
  return sections;
}

function getAllHotDocs(): HotDoc[] {
  const hot: HotDoc[] = [];
  for (const doc of overviewDocs) {
    hot.push({ title: doc.title, slug: doc.slug, section: '梗概', sectionId: 'overview' });
  }
  for (const doc of behaviorEventDocs.slice(0, 5)) {
    hot.push({ title: doc.title, slug: doc.slug, section: '行为', sectionId: 'behavior' });
  }
  for (const doc of formDesignDocs.slice(0, 3)) {
    hot.push({ title: doc.title, slug: doc.slug, section: '表单设计', sectionId: 'form-design' });
  }
  for (const doc of flowNodeDocs.slice(0, 3)) {
    hot.push({ title: doc.title, slug: doc.slug, section: '流程节点', sectionId: 'flow-nodes' });
  }
  for (const doc of backendDocs.slice(0, 3)) {
    hot.push({ title: doc.title, slug: doc.slug, section: '后端', sectionId: 'backend' });
  }
  return hot;
}

function resolveRouteFromSlug(slug?: string): ModalRouteState {
  if (!slug) return {};
  if (getBehaviorDocBySlug(slug)) return { sectionId: 'behavior', slug };
  if (overviewDocs.some((doc) => doc.slug === slug)) return { sectionId: 'overview', slug };
  if (formDesignDocs.some((doc) => doc.slug === slug)) return { sectionId: 'form-design', slug };
  if (flowNodeDocs.some((doc) => doc.slug === slug)) return { sectionId: 'flow-nodes', slug };
  if (backendDocs.some((doc) => doc.slug === slug)) return { sectionId: 'backend', slug };
  return {};
}

function getSectionConfig(sectionId: DocSectionId): {
  section: DocSection | undefined;
  docs: BehaviorTopicDocEntry[];
  categories: string[];
} {
  if (sectionId === 'overview') return { section: getDocSection('overview'), docs: overviewDocs, categories: [] };
  if (sectionId === 'form-design') return { section: getDocSection('form-design'), docs: formDesignDocs, categories: formDesignCategories };
  if (sectionId === 'flow-nodes') return { section: getDocSection('flow-nodes'), docs: flowNodeDocs, categories: flowNodeCategories };
  if (sectionId === 'backend') return { section: getDocSection('backend'), docs: backendDocs, categories: [] };
  return { section: getDocSection('behavior'), docs: behaviorTopicDocs, categories: [] };
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

export default function DocModal({ open, onClose, initialSlug }: DocModalProps) {
  const [route, setRoute] = useState<ModalRouteState>(() => resolveRouteFromSlug(initialSlug));
  const [homeQuery, setHomeQuery] = useState('');
  const [behaviorQuery, setBehaviorQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [genericQuery, setGenericQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('全部');

  useEffect(() => {
    if (!open) return;
    setRoute(resolveRouteFromSlug(initialSlug));
  }, [initialSlug, open]);

  const handleNavigateHome = useCallback(() => {
    setRoute({});
    setGenericQuery('');
    setActiveCategory('全部');
  }, []);

  const handleNavigateSection = useCallback((sectionId: DocSectionId) => {
    setRoute({ sectionId });
    setGenericQuery('');
    setActiveCategory('全部');
  }, []);

  const handleNavigateDoc = useCallback((sectionId: DocSectionId, slug: string) => {
    setRoute({ sectionId, slug });
  }, []);

  const handleClose = useCallback(() => {
    setRoute(resolveRouteFromSlug(initialSlug));
    setHomeQuery('');
    setBehaviorQuery('');
    setSelectedTags(new Set());
    setGenericQuery('');
    setActiveCategory('全部');
    onClose();
  }, [initialSlug, onClose]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const doc of behaviorEventDocs) {
      for (const tag of doc.tags ?? []) tagSet.add(tag);
    }
    return Array.from(tagSet).sort();
  }, []);

  const hotDocs = useMemo(() => getAllHotDocs(), []);
  const scriptDocs = useMemo(() => getBehaviorDocsByScope('script'), []);
  const controlDocs = useMemo(() => getBehaviorDocsByScope('control'), []);

  const filteredSections = useMemo(() => {
    if (!homeQuery.trim()) return docSections;
    const q = homeQuery.toLowerCase();
    return docSections.filter((section) =>
      section.title.toLowerCase().includes(q)
      || section.summary.toLowerCase().includes(q)
      || section.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [homeQuery]);

  const filteredHotDocs = useMemo(() => {
    if (!homeQuery.trim()) return hotDocs;
    const q = homeQuery.toLowerCase();
    return hotDocs.filter((doc) => doc.title.toLowerCase().includes(q) || doc.section.toLowerCase().includes(q));
  }, [homeQuery, hotDocs]);

  const filteredBehaviorEvents = useMemo(() => {
    let docs = behaviorEventDocs;
    if (behaviorQuery.trim()) {
      docs = fuzzyFilter(docs, behaviorQuery);
    }
    if (selectedTags.size > 0) {
      docs = docs.filter((doc) => doc.tags?.some((tag) => selectedTags.has(tag)));
    }
    return docs;
  }, [behaviorQuery, selectedTags]);

  const filteredScriptDocs = filteredBehaviorEvents.filter((doc) => doc.scope === 'script');
  const filteredControlDocs = filteredBehaviorEvents.filter((doc) => doc.scope === 'control');

  const currentSection = route.sectionId ? getSectionConfig(route.sectionId) : null;
  const currentSectionTitle = currentSection?.section?.title || '文档中心';
  const currentEventDoc = route.sectionId === 'behavior' && route.slug
    ? getBehaviorDocBySlug(route.slug)
    : undefined;
  const genericCurrentDoc = route.sectionId && route.sectionId !== 'behavior' && route.slug
    ? currentSection?.docs.find((doc) => doc.slug === route.slug)
    : undefined;

  const currentTitle = useMemo(() => {
    if (genericCurrentDoc) return genericCurrentDoc.title;
    if (currentEventDoc) return currentEventDoc.title;
    if (route.sectionId) return currentSectionTitle;
    return '文档中心';
  }, [currentEventDoc, currentSectionTitle, genericCurrentDoc, route.sectionId]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  function renderHome() {
    return (
      <div className="page-container docs-page">
        <div className="docs-home-header">
          <h1>文档中心</h1>
          <p>了解 FormFlow 的核心概念、使用方法和 API 参考</p>
          <div className="docs-home-search">
            <DesignerIcon name="search" className="docs-search-icon" />
            <input
              type="search"
              value={homeQuery}
              onChange={(event) => setHomeQuery(event.target.value)}
              placeholder="搜索文档..."
            />
          </div>
        </div>

        <section className="docs-home-sections">
          {filteredSections.map((section) => (
            <button
              key={section.id}
              type="button"
              className="docs-home-section-card doc-modal-clickable"
              style={{ '--section-color': section.color } as React.CSSProperties}
              onClick={() => handleNavigateSection(section.id as DocSectionId)}
            >
              <div className="docs-home-section-icon">
                <DesignerIcon name={section.icon} />
              </div>
              <div className="docs-home-section-info">
                <h3>{section.title}</h3>
                <p>{section.summary}</p>
                <div className="docs-home-section-tags">
                  {section.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="docs-home-tag">{tag}</span>
                  ))}
                  {section.count > 0 && <span className="docs-home-count">{section.count} 篇</span>}
                </div>
              </div>
            </button>
          ))}
        </section>

        {filteredHotDocs.length > 0 && (
          <section className="docs-home-hot">
            <h2>热门文档</h2>
            <div className="docs-home-hot-grid">
              {filteredHotDocs.slice(0, 10).map((doc) => (
                <button
                  key={`${doc.sectionId}:${doc.slug}`}
                  type="button"
                  className="docs-home-hot-item doc-modal-clickable"
                  onClick={() => handleNavigateDoc(doc.sectionId, doc.slug)}
                >
                  <span className="docs-home-hot-section">{doc.section}</span>
                  <span className="docs-home-hot-title">{doc.title}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  function renderBehaviorIndex() {
    return (
      <div className="page-container docs-page">
        <div className="page-header">
          <div>
            <nav className="docs-breadcrumb" aria-label="面包屑导航">
              <button type="button" className="docs-breadcrumb-link" onClick={handleNavigateHome}>文档首页</button>
              <span className="docs-breadcrumb-sep">{'>'}</span>
              <span className="docs-breadcrumb-current">行为</span>
            </nav>
            <h2>行为</h2>
            <p>统一查看脚本行为事件、控件运行时事件、上下文和流程参数 reference。</p>
          </div>
          <div className="header-actions">
            <button type="button" className="docs-link-button" onClick={handleNavigateHome}>返回文档首页</button>
          </div>
        </div>

        <section className="docs-hero-grid">
          {behaviorTopicDocs.map((topic) => (
            <button
              key={topic.slug}
              type="button"
              className="docs-topic-card doc-modal-clickable"
              onClick={() => handleNavigateDoc('behavior', topic.slug)}
            >
              <strong>{topic.title}</strong>
              <p>{topic.summary}</p>
            </button>
          ))}
        </section>

        <section className="docs-index-panel">
          <div className="docs-index-toolbar">
            <strong>事件索引</strong>
            <div className="docs-search-wrapper">
              <SearchIcon />
              <input
                type="search"
                value={behaviorQuery}
                onChange={(event) => setBehaviorQuery(event.target.value)}
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
                : filteredScriptDocs.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      className="docs-index-item doc-modal-clickable"
                      onClick={() => handleNavigateDoc('behavior', doc.slug)}
                    >
                      <span className="docs-index-item-title">{doc.title}</span>
                      <span className="docs-index-item-meta">{doc.eventName}</span>
                      <small>{doc.summary}</small>
                    </button>
                  ))}
            </div>
            <div className="docs-index-column">
              <h3>控件运行时事件</h3>
              {filteredControlDocs.length === 0
                ? <div className="docs-empty-inline">没有匹配的控件事件。</div>
                : filteredControlDocs.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      className="docs-index-item doc-modal-clickable"
                      onClick={() => handleNavigateDoc('behavior', doc.slug)}
                    >
                      <span className="docs-index-item-title">{doc.title}</span>
                      <span className="docs-index-item-meta">{doc.eventName}</span>
                      <small>{doc.summary}</small>
                    </button>
                  ))}
            </div>
          </div>
        </section>

        <section className="docs-footer-note">
          <p>脚本事件共 {scriptDocs.length} 个，控件运行时事件共 {controlDocs.length} 个。编辑器内提示、右侧 reference 和文档页共用同一份事件元数据。</p>
        </section>
      </div>
    );
  }

  function renderBehaviorDetail() {
    if (!currentEventDoc) return null;

    if ('sections' in currentEventDoc) {
      return (
        <div className="page-container docs-page">
          <div className="page-header">
            <div>
              <nav className="docs-breadcrumb" aria-label="面包屑导航">
                <button type="button" className="docs-breadcrumb-link" onClick={handleNavigateHome}>文档首页</button>
                <span className="docs-breadcrumb-sep">{'>'}</span>
                <button type="button" className="docs-breadcrumb-link" onClick={() => handleNavigateSection('behavior')}>行为</button>
                <span className="docs-breadcrumb-sep">{'>'}</span>
                <span className="docs-breadcrumb-current">{currentEventDoc.title}</span>
              </nav>
              <h2>{currentEventDoc.title}</h2>
              <p>{currentEventDoc.summary}</p>
            </div>
            <div className="header-actions">
              <button type="button" className="docs-link-button" onClick={() => handleNavigateSection('behavior')}>返回行为文档</button>
            </div>
          </div>

          {currentEventDoc.sections.map((section, index) => (
            <section key={`${currentEventDoc.id}:${section.title}`} id={`section-${index}`} className="docs-section">
              <h3>{section.title}</h3>
              {section.body && <p className="docs-lead">{section.body}</p>}
              {section.fields && section.fields.length > 0 && <ReferenceFieldTable fields={section.fields} />}
              {section.apis && section.apis.length > 0 && <ApiReferenceList apis={section.apis} />}
              {section.shortcuts && section.shortcuts.length > 0 && <ShortcutList shortcuts={section.shortcuts} />}
              {section.examples && section.examples.length > 0 && <ExampleList examples={section.examples} />}
            </section>
          ))}
        </div>
      );
    }

    const relatedDocs = currentEventDoc.relatedEvents
      .map((eventName) => behaviorEventDocs.find((item) => item.eventName === eventName && item.scope === currentEventDoc.scope))
      .filter(Boolean) as BehaviorEventDocEntry[];
    const siblingDocs = behaviorEventDocs.filter((item) => item.scope === currentEventDoc.scope);
    const tocSections = extractEventTocSections(currentEventDoc);

    return (
      <div className="page-container docs-page docs-page--with-sidebar">
        <div className="docs-page-main">
          <div className="page-header">
            <div>
              <nav className="docs-breadcrumb" aria-label="面包屑导航">
                <button type="button" className="docs-breadcrumb-link" onClick={handleNavigateHome}>文档首页</button>
                <span className="docs-breadcrumb-sep">{'>'}</span>
                <button type="button" className="docs-breadcrumb-link" onClick={() => handleNavigateSection('behavior')}>行为</button>
                <span className="docs-breadcrumb-sep">{'>'}</span>
                <span className="docs-breadcrumb-current">{currentEventDoc.title}</span>
              </nav>
              <h2>{currentEventDoc.title}</h2>
              <p>{currentEventDoc.summary}</p>
            </div>
            <div className="header-actions">
              <button type="button" className="docs-link-button" onClick={() => handleNavigateSection('behavior')}>行为文档</button>
            </div>
          </div>

          <section className="docs-meta-row">
            <div className="docs-meta-card">
              <span>事件名</span>
              <strong>{currentEventDoc.eventName}</strong>
            </div>
            <div className="docs-meta-card">
              <span>范围</span>
              <strong>{currentEventDoc.scope === 'control' ? '控件运行时事件' : '行为脚本事件'}</strong>
            </div>
            <div className="docs-meta-card">
              <span>分类</span>
              <strong>{currentEventDoc.category}</strong>
            </div>
          </section>

          <section className="docs-section" id="section-触发时机">
            <h3>触发时机</h3>
            <p className="docs-lead">{currentEventDoc.triggerWhen}</p>
          </section>

          <section className="docs-section" id="section-通用上下文">
            <h3>通用上下文</h3>
            <ReferenceFieldTable fields={currentEventDoc.contextFields} />
          </section>

          <section className="docs-section" id="section-当前事件-detail">
            <h3>当前事件 Detail</h3>
            {currentEventDoc.detailType && <p className="docs-lead"><code>{currentEventDoc.detailType}</code></p>}
            <ReferenceFieldTable fields={currentEventDoc.detailFields} />
          </section>

          <section className="docs-section" id="section-可用-api">
            <h3>可用 API</h3>
            <ApiReferenceList apis={currentEventDoc.apis} />
          </section>

          {currentEventDoc.referenceShortcuts?.length ? (
            <section className="docs-section" id="section-快捷-reference">
              <h3>快捷 Reference</h3>
              <ShortcutList shortcuts={currentEventDoc.referenceShortcuts} />
            </section>
          ) : null}

          <section className="docs-section" id="section-suggestion-最佳实践">
            <h3>Suggestion / 最佳实践</h3>
            <div className="docs-card-list">
              {currentEventDoc.suggestions.map((suggestion) => (
                <article key={suggestion} className="docs-card docs-card-compact">
                  <p>{suggestion}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="docs-section" id="section-示例代码">
            <h3>示例代码</h3>
            <ExampleList examples={currentEventDoc.examples} />
          </section>

          <section className="docs-section" id="section-相关事件">
            <h3>相关事件</h3>
            <div className="docs-link-grid">
              {relatedDocs.length === 0 ? (
                <div className="docs-empty-inline">当前事件暂无同范围的相关事件。</div>
              ) : (
                relatedDocs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className="docs-index-item doc-modal-clickable"
                    onClick={() => handleNavigateDoc('behavior', doc.slug)}
                  >
                    <span className="docs-index-item-title">{doc.title}</span>
                    <span className="docs-index-item-meta">{doc.eventName}</span>
                    <small>{doc.summary}</small>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="docs-section" id="section-同类事件">
            <h3>同类事件</h3>
            <div className="docs-link-grid">
              {siblingDocs.slice(0, 8).map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  className={`docs-index-item doc-modal-clickable ${doc.id === currentEventDoc.id ? 'active' : ''}`}
                  onClick={() => handleNavigateDoc('behavior', doc.slug)}
                >
                  <span className="docs-index-item-title">{doc.title}</span>
                  <span className="docs-index-item-meta">{doc.eventName}</span>
                  <small>{doc.summary}</small>
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="docs-page-sidebar">
          <DocSidebar sections={tocSections} />
        </aside>
      </div>
    );
  }

  function renderGenericSection() {
    if (!route.sectionId || route.sectionId === 'behavior' || !currentSection?.section) return null;
    const docsWithCategory = currentSection.docs.map((doc) => ({
      ...doc,
      _category: inferCategory(doc, currentSection.categories),
    }));
    const categoryOptions = ['全部', ...new Set(docsWithCategory.map((doc) => doc._category).filter(Boolean))];
    const filteredDocs = docsWithCategory.filter((doc) => {
      const normalizedQuery = genericQuery.trim().toLowerCase();
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

    if (!route.slug) {
      return (
        <div className="page-container docs-page">
          <div className="page-header">
            <div>
              <nav className="docs-breadcrumb" aria-label="面包屑导航">
                <button type="button" className="docs-breadcrumb-link" onClick={handleNavigateHome}>文档首页</button>
                <span className="docs-breadcrumb-sep">{'>'}</span>
                <span className="docs-breadcrumb-current">{currentSection.section.title}</span>
              </nav>
              <h2>{currentSection.section.title}</h2>
              <p>共 {currentSection.docs.length} 篇文档，按主题拆分为可快速浏览的大文档入口。</p>
            </div>
            <div className="header-actions">
              <button type="button" className="docs-link-button" onClick={handleNavigateHome}>返回文档首页</button>
            </div>
          </div>

          <section className="docs-index-panel">
            <div className="docs-index-toolbar">
              <strong>{currentSection.section.title}索引</strong>
              <div className="docs-search-wrapper">
                <SearchIcon />
                <input
                  type="search"
                  value={genericQuery}
                  onChange={(event) => setGenericQuery(event.target.value)}
                  placeholder={`搜索${currentSection.section.title}文档...`}
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
                <button
                  key={doc.id}
                  type="button"
                  className="docs-index-item doc-modal-clickable"
                  onClick={() => handleNavigateDoc(route.sectionId as DocSectionId, doc.slug)}
                >
                  <span className="docs-index-item-title">{doc.title}</span>
                  <span className="docs-index-item-meta">{doc._category}</span>
                  <small>{doc.summary}</small>
                </button>
              ))}
              {filteredDocs.length === 0 && <div className="docs-empty-inline">没有匹配的文档。</div>}
            </div>
          </section>
        </div>
      );
    }

    if (!genericCurrentDoc) {
      return (
        <div className="page-container docs-page">
          <div className="page-header">
            <div>
              <h2>未找到文档</h2>
              <p>当前路径没有关联到任何文档。</p>
            </div>
            <div className="header-actions">
              <button type="button" className="docs-link-button" onClick={() => handleNavigateSection(route.sectionId as DocSectionId)}>
                返回{currentSection.section.title}
              </button>
            </div>
          </div>
        </div>
      );
    }

    const tocSections = genericCurrentDoc.sections.map((section, index) => ({
      id: `section-${index}`,
      title: section.title,
    }));
    const componentPlaygroundType = route.sectionId === 'form-design' && genericCurrentDoc.id.startsWith('form-design:')
      ? genericCurrentDoc.id.slice('form-design:'.length)
      : null;
    const sidebarSections = componentPlaygroundType
      ? [{ id: 'section-playground', title: 'Playground' }, ...tocSections]
      : tocSections;

    return (
      <div className="page-container docs-page docs-page--with-sidebar">
        <div className="docs-page-main">
          <div className="page-header">
            <div>
              <nav className="docs-breadcrumb" aria-label="面包屑导航">
                <button type="button" className="docs-breadcrumb-link" onClick={handleNavigateHome}>文档首页</button>
                <span className="docs-breadcrumb-sep">{'>'}</span>
                <button type="button" className="docs-breadcrumb-link" onClick={() => handleNavigateSection(route.sectionId as DocSectionId)}>
                  {currentSection.section.title}
                </button>
                <span className="docs-breadcrumb-sep">{'>'}</span>
                <span className="docs-breadcrumb-current">{genericCurrentDoc.title}</span>
              </nav>
              <h2>{genericCurrentDoc.title}</h2>
              <p>{genericCurrentDoc.summary}</p>
            </div>
            <div className="header-actions">
              <button type="button" className="docs-link-button" onClick={() => handleNavigateSection(route.sectionId as DocSectionId)}>
                返回{currentSection.section.title}
              </button>
            </div>
          </div>

          {componentPlaygroundType && (
            <ComponentDocPlayground componentType={componentPlaygroundType} title={genericCurrentDoc.title} variant="modal" />
          )}

          {genericCurrentDoc.sections.map((section, index) => (
            <section key={`${genericCurrentDoc.id}:${section.title}`} id={`section-${index}`} className="docs-section">
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
          <DocSidebar sections={sidebarSections} />
        </aside>
      </div>
    );
  }

  function renderContent() {
    if (!route.sectionId) return renderHome();
    if (route.sectionId === 'behavior') {
      return route.slug ? renderBehaviorDetail() : renderBehaviorIndex();
    }
    return renderGenericSection();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      width="92vw"
      maxWidth={1200}
      maxHeight="88vh"
      containerClassName="doc-center-modal"
    >
      <div className="doc-modal-header">
        {route.sectionId && (
          <button
            type="button"
            className="doc-modal-back-btn"
            onClick={() => {
              if (route.slug) setRoute({ sectionId: route.sectionId });
              else handleNavigateHome();
            }}
            aria-label="返回"
          >
            <DesignerIcon name="undo" size={16} />
          </button>
        )}
        <h2 className="doc-modal-title">{currentTitle}</h2>
        <button
          type="button"
          className="modal-close"
          onClick={handleClose}
          aria-label="关闭"
        >
          ×
        </button>
      </div>
      <div className="doc-modal-content">
        {renderContent()}
      </div>
    </Modal>
  );
}
