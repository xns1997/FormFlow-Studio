import React, { useMemo, useState } from 'react';
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
} from '../services/behaviorDocs';
import {
  buildDocsPath,
  buildProjectSettingsPath,
  buildWorkspacePath,
  type ProjectSettingsSection,
  type WorkspaceTab,
} from '../services/routes';

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
      to={`${buildDocsPath(doc.slug)}${search}`}
      className={`docs-index-item ${active ? 'active' : ''}`}
    >
      <span className="docs-index-item-title">{doc.title}</span>
      <span className="docs-index-item-meta">{doc.eventName}</span>
      <small>{doc.summary}</small>
    </Link>
  );
}

export default function BehaviorDocsPage() {
  const { slug } = useParams<{ slug?: string }>();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const currentDoc = getBehaviorDocBySlug(slug);
  const scriptDocs = getBehaviorDocsByScope('script');
  const controlDocs = getBehaviorDocsByScope('control');
  const filteredEvents = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return behaviorEventDocs;
    return behaviorEventDocs.filter((doc) => {
      const text = `${doc.title} ${doc.eventName} ${doc.summary} ${doc.category}`.toLowerCase();
      return text.includes(keyword);
    });
  }, [query]);

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
            <h2>行为文档中心</h2>
            <p>统一查看脚本行为事件、控件运行时事件、上下文和流程参数 reference。</p>
          </div>
          <div className="header-actions">
            {returnContext && <Link to={returnContext.to} className="docs-link-button">{returnContext.label}</Link>}
          </div>
        </div>

        <section className="docs-hero-grid">
          {behaviorTopicDocs.map((topic) => (
            <Link key={topic.slug} to={`${buildDocsPath(topic.slug)}${location.search}`} className="docs-topic-card">
              <strong>{topic.title}</strong>
              <p>{topic.summary}</p>
            </Link>
          ))}
        </section>

        <section className="docs-index-panel">
          <div className="docs-index-toolbar">
            <strong>事件索引</strong>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索事件名、用途或分类"
            />
          </div>

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
            <Link to={buildDocsPath()} className="docs-link-button">返回文档首页</Link>
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
            <h2>{currentDoc.title}</h2>
            <p>{currentDoc.summary}</p>
          </div>
          <div className="header-actions">
            <Link to={buildDocsPath()} className="docs-link-button">文档首页</Link>
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

  return (
    <div className="page-container docs-page">
      <div className="page-header">
          <div>
            <h2>{currentDoc.title}</h2>
            <p>{currentDoc.summary}</p>
          </div>
          <div className="header-actions">
          <Link to={buildDocsPath()} className="docs-link-button">文档首页</Link>
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

      <section className="docs-section">
        <h3>触发时机</h3>
        <p className="docs-lead">{currentDoc.triggerWhen}</p>
      </section>

      <section className="docs-section">
        <h3>通用上下文</h3>
        <ReferenceFieldTable fields={currentDoc.contextFields} />
      </section>

      <section className="docs-section">
        <h3>当前事件 Detail</h3>
        {currentDoc.detailType && <p className="docs-lead"><code>{currentDoc.detailType}</code></p>}
        <ReferenceFieldTable fields={currentDoc.detailFields} />
      </section>

      <section className="docs-section">
        <h3>可用 API</h3>
        <ApiReferenceList apis={currentDoc.apis} />
      </section>

      {currentDoc.referenceShortcuts && currentDoc.referenceShortcuts.length > 0 && (
        <section className="docs-section">
          <h3>快捷 Reference</h3>
          <ShortcutList shortcuts={currentDoc.referenceShortcuts} />
        </section>
      )}

      <section className="docs-section">
        <h3>Suggestion / 最佳实践</h3>
        <div className="docs-card-list">
          {currentDoc.suggestions.map((suggestion) => (
            <article key={suggestion} className="docs-card docs-card-compact">
              <p>{suggestion}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="docs-section">
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

      <section className="docs-section">
        <h3>相关事件</h3>
        <div className="docs-link-grid">
          {relatedDocs.length === 0
            ? <div className="docs-empty-inline">当前事件暂无同范围的相关事件。</div>
            : relatedDocs.map((doc) => <EventLink key={doc.id} doc={doc} search={location.search} />)}
        </div>
      </section>

      <section className="docs-section">
        <h3>同类事件</h3>
        <div className="docs-link-grid">
          {siblingDocs.slice(0, 8).map((doc) => <EventLink key={doc.id} doc={doc} active={doc.id === currentDoc.id} search={location.search} />)}
        </div>
      </section>
    </div>
  );
}
