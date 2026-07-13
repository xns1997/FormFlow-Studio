import React, { useState } from 'react';
import { getAllControls, getControlsByCategory, getCategories, CATEGORY_LABELS } from './registry';
import { DesignerIcon } from './icons';
import { AntdTextInput, FormAntdProvider } from '../components/AntdFormControls';

const CATEGORY_META: Record<string, { hint: string }> = {
  basic: { hint: '录入与表单字段' },
  select: { hint: '选项与选择' },
  container: { hint: '布局与分组' },
  display: { hint: '内容与结果' },
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
      title={`拖入画布添加${c.label}`}
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
    </div>
  );

  return (
    <FormAntdProvider>
    <div className="designer-toolbox">
      <div className="toolbox-header">
        <div className="toolbox-search-shell">
          <span className="toolbox-search-icon">⌕</span>
          <AntdTextInput
            placeholder="搜索控件"
            value={search}
            onChange={(next) => setSearch(next)}
            style={{ width: '100%' }}
          />
          {search && <button type="button" className="toolbox-search-clear" onClick={() => setSearch('')}>×</button>}
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
            <section key={cat} className="toolbox-category">
              <button type="button" className="toolbox-category-header" aria-expanded={expanded[cat]} onClick={() => toggle(cat)}>
                <span className="toolbox-category-title">
                  <span className="toolbox-category-arrow">
                    <DesignerIcon name={expanded[cat] ? 'expand' : 'collapse'} size={12} />
                  </span>
                  <span className="toolbox-category-copy">
                    <strong>{CATEGORY_LABELS[cat]}</strong>
                    <small>{CATEGORY_META[cat]?.hint || '控件分类'}</small>
                  </span>
                </span>
              </button>
              {expanded[cat] && (
                <div className="toolbox-grid">
                  {getControlsByCategory(cat).map((c) => renderItem(c))}
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </div>
    </FormAntdProvider>
  );
}
