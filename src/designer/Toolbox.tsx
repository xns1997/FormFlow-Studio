import React, { useState } from 'react';
import { getAllControls, getControlsByCategory, getCategories, CATEGORY_LABELS } from './registry';
import { DesignerIcon } from './icons';

export function Toolbox() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ basic: true, select: true, container: true, display: true });

  const toggle = (cat: string) => setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const filtered = search
    ? getAllControls().filter((c) => c.label.includes(search) || c.type.includes(search))
    : null;

  return (
    <div className="designer-toolbox">
      <div className="toolbox-header">
        <input
          type="text"
          placeholder="搜索控件…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="toolbox-search"
        />
      </div>
      <div className="toolbox-body">
        {filtered ? (
          <div className="toolbox-grid">
            {filtered.map((c) => (
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
                <DesignerIcon name={c.type} fallback={c.icon} className="toolbox-item-icon" />
                <span className="toolbox-item-label">{c.label}</span>
              </div>
            ))}
          </div>
        ) : (
          getCategories().map((cat) => (
            <div key={cat} className="toolbox-category">
              <div className="toolbox-category-header" onClick={() => toggle(cat)}>
                <span>
                  <DesignerIcon name={expanded[cat] ? 'expand' : 'collapse'} size={12} />
                  {CATEGORY_LABELS[cat]}
                </span>
              </div>
              {expanded[cat] && (
                <div className="toolbox-grid">
                  {getControlsByCategory(cat).map((c) => (
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
                      <DesignerIcon name={c.type} fallback={c.icon} className="toolbox-item-icon" />
                      <span className="toolbox-item-label">{c.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
