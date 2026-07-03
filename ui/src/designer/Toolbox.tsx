import React, { useState } from 'react';
import { getAllControls, getControlsByCategory, getCategories, CATEGORY_LABELS } from './registry';
import { DesignerIcon } from './icons';

const CATEGORY_META: Record<string, { hint: string; accent: string }> = {
  basic: { hint: '录入与表单字段', accent: 'rgba(37,99,235,0.12)' },
  select: { hint: '选项、枚举与选择', accent: 'rgba(14,165,233,0.12)' },
  container: { hint: '布局与分组容器', accent: 'rgba(245,158,11,0.14)' },
  display: { hint: '展示与结果输出', accent: 'rgba(16,185,129,0.14)' },
};

export function Toolbox() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ basic: true, select: true, container: true, display: true });

  const toggle = (cat: string) => setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const allControls = getAllControls();
  const filtered = search
    ? allControls.filter((c) => c.label.includes(search) || c.type.includes(search))
    : null;

  const renderItem = (c: ReturnType<typeof getAllControls>[number]) => (
    <div
      key={c.type}
      className="toolbox-item"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('control-type', c.type);
        e.dataTransfer.setData('text/plain', c.type);
      }}
    >
      <div className="toolbox-item-icon-wrap">
        <DesignerIcon name={c.type} fallback={c.icon} className="toolbox-item-icon" />
      </div>
      <span className="toolbox-item-label">{c.label}</span>
      <span className="toolbox-item-meta">{c.type}</span>
    </div>
  );

  return (
    <div className="designer-toolbox">
      <div className="toolbox-header">
        <div className="toolbox-header-row">
          <div className="toolbox-search-shell">
            <span className="toolbox-search-icon">⌕</span>
            <input
              type="text"
              placeholder="搜索控件、类型…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            className="toolbox-search"
          />
          {search && <button type="button" className="toolbox-search-clear" onClick={() => setSearch('')}>×</button>}
        </div>
        </div>
      </div>
      <div className="toolbox-body">
        {filtered ? (
          filtered.length > 0 ? (
            <div className="toolbox-search-results">
              <div className="toolbox-grid">
                {filtered.map((c) => renderItem(c))}
              </div>
            </div>
          ) : (
            <div className="toolbox-empty">
              <strong>没有匹配的控件</strong>
              <p>试试更短的关键词，或者按分类浏览。</p>
            </div>
          )
        ) : (
          getCategories().map((cat) => (
            <div key={cat} className="toolbox-category">
              <div className="toolbox-category-header" onClick={() => toggle(cat)}>
                <span className="toolbox-category-title">
                  <span className="toolbox-category-arrow">
                    <DesignerIcon name={expanded[cat] ? 'expand' : 'collapse'} size={12} />
                  </span>
                  <span className="toolbox-category-copy">
                    <strong>{CATEGORY_LABELS[cat]}</strong>
                    <small>{CATEGORY_META[cat]?.hint || '控件分类'}</small>
                  </span>
                </span>
              </div>
              {expanded[cat] && (
                <div className="toolbox-grid">
                  {getControlsByCategory(cat).map((c) => renderItem(c))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
