import React from 'react';
import { useDocRecommendations } from '../hooks/useDocRecommendations';

type DocSectionId = 'overview' | 'behavior' | 'form-design' | 'flow-nodes' | 'backend';

interface DocRecommendationsProps {
  onNavigate: (sectionId: DocSectionId, slug: string) => void;
}

export default function DocRecommendations({ onNavigate }: DocRecommendationsProps) {
  const recommendations = useDocRecommendations();

  if (recommendations.length === 0) return null;

  return (
    <section className="docs-recommendations">
      <h2>推荐文档</h2>
      <div className="docs-recommendations-grid">
        {recommendations.map((doc) => (
          <button
            key={`${doc.sectionId}:${doc.slug}`}
            type="button"
            className="docs-recommendation-card doc-modal-clickable"
            onClick={() => onNavigate(doc.sectionId as any, doc.slug)}
          >
            <div className="docs-recommendation-header">
              <span className="docs-recommendation-section">{doc.section}</span>
              <span className="docs-recommendation-reason">{doc.reason}</span>
            </div>
            <span className="docs-recommendation-title">{doc.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
