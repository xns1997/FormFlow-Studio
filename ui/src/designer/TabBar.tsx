import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { DesignFile } from '../project/types';
import { createDesignFile } from '../project/types';
import { DESIGN_TEMPLATES, createDesignFromTemplate } from './designTemplates';
import { AntdTextInput, FormAntdProvider } from '../components/AntdFormControls';

interface Props {
  designs: DesignFile[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: (design: DesignFile) => void;
  onRename: (id: string, name: string) => void;
}

export function TabBar({ designs, activeId, onSelect, onClose, onCreate, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', handler, { passive: true });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const handleCreate = (templateKey = 'blank') => {
    const design = templateKey === 'blank'
      ? createDesignFile(`设计 ${designs.length + 1}`)
      : createDesignFromTemplate(templateKey, designs.length + 1);
    onCreate(design);
    setMenuOpen(false);
  };

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const finishRename = () => {
    if (editingId && editName.trim()) onRename(editingId, editName.trim());
    setEditingId(null);
  };

  return (
    <FormAntdProvider>
    <div
      className="designer-tabbar"
    >
      <div ref={listRef} className="designer-tab-list">
        {designs.map((d) => (
          <div
            key={d.id}
            className={`designer-tab ${activeId === d.id ? 'active' : ''}`}
            onClick={() => onSelect(d.id)}
          >
            {editingId === d.id ? (
              <AntdTextInput
                value={editName}
                onChange={(next) => setEditName(next)}
                onBlur={finishRename}
                onKeyDown={(e) => e.key === 'Enter' && finishRename()}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                style={{ width: 140 }}
              />
            ) : (
              <span onDoubleClick={() => startRename(d.id, d.name)}>{d.name}</span>
            )}
            <button type="button"
              className="tab-close"
              onClick={(e) => { e.stopPropagation(); onClose(d.id); }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="designer-tab-actions">
        <button type="button" className="designer-tab-add" onClick={() => setMenuOpen((value) => !value)}>+</button>
        {menuOpen && (
          <div className="designer-template-menu">
            {DESIGN_TEMPLATES.map((template) => (
              <button
                key={template.key}
                type="button"
                className="designer-template-item"
                onClick={() => handleCreate(template.key)}
              >
                <strong>{template.label}</strong>
                <span>{template.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
    </FormAntdProvider>
  );
}
