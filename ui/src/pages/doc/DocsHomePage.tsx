import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DesignerIcon } from '../../designer/icons';
import {
  docSections,
  behaviorEventDocs,
  overviewDocs,
  formDesignDocs,
  flowNodeDocs,
  backendDocs,
} from '../../services/io/behaviorDocs';
import { buildDocsSectionPath } from '../../services/io/routes';

interface HotDoc {
  title: string;
  path: string;
  section: string;
}

function getAllDocs(): HotDoc[] {
  const hot: HotDoc[] = [];
  for (const doc of overviewDocs) {
    hot.push({ title: doc.title, path: buildDocsSectionPath('overview', doc.slug), section: '梗概' });
  }
  for (const doc of behaviorEventDocs.slice(0, 5)) {
    hot.push({ title: doc.title, path: buildDocsSectionPath('behavior', doc.slug), section: '行为' });
  }
  for (const doc of formDesignDocs.slice(0, 3)) {
    hot.push({ title: doc.title, path: buildDocsSectionPath('form-design', doc.slug), section: '表单设计' });
  }
  for (const doc of flowNodeDocs.slice(0, 3)) {
    hot.push({ title: doc.title, path: buildDocsSectionPath('flow-nodes', doc.slug), section: '流程节点' });
  }
  for (const doc of backendDocs.slice(0, 3)) {
    hot.push({ title: doc.title, path: buildDocsSectionPath('backend', doc.slug), section: '后端' });
  }
  return hot;
}

export default function DocsHomePage() {
  const [query, setQuery] = useState('');
  const allHotDocs = useMemo(() => getAllDocs(), []);

  const filteredSections = useMemo(() => {
    if (!query.trim()) return docSections;
    const q = query.toLowerCase();
    return docSections.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      s.summary.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [query]);

  const filteredHotDocs = useMemo(() => {
    if (!query.trim()) return allHotDocs;
    const q = query.toLowerCase();
    return allHotDocs.filter((d) =>
      d.title.toLowerCase().includes(q) || d.section.toLowerCase().includes(q)
    );
  }, [query, allHotDocs]);

  return (
    <div className="page-container docs-page">
      <div className="docs-home-header">
        <h1>文档中心</h1>
        <p>了解 FormFlow 的核心概念、使用方法和 API 参考</p>
        <div className="docs-home-search">
          <DesignerIcon name="search" className="docs-search-icon" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文档..."
          />
        </div>
      </div>

      <section className="docs-home-sections">
        {filteredSections.map((section) => (
          <Link
            key={section.id}
            to={section.path}
            className="docs-home-section-card"
            style={{ '--section-color': section.color } as React.CSSProperties}
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
                {section.count > 0 && (
                  <span className="docs-home-count">{section.count} 篇</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </section>

      {filteredHotDocs.length > 0 && (
        <section className="docs-home-hot">
          <h2>热门文档</h2>
          <div className="docs-home-hot-grid">
            {filteredHotDocs.slice(0, 10).map((doc) => (
              <Link key={doc.path} to={doc.path} className="docs-home-hot-item">
                <span className="docs-home-hot-section">{doc.section}</span>
                <span className="docs-home-hot-title">{doc.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
