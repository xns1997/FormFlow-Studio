import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { DesignFile } from '../project/types';
import { createDesignFile } from '../project/types';

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
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', handler, { passive: true });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const handleCreate = () => {
    const design = createDesignFile(`设计 ${designs.length + 1}`);
    onCreate(design);
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
    <div
      ref={barRef}
      className="designer-tabbar"
    >
      <div className="designer-tab-list">
        {designs.map((d) => (
          <div
            key={d.id}
            className={`designer-tab ${activeId === d.id ? 'active' : ''}`}
            onClick={() => onSelect(d.id)}
          >
            {editingId === d.id ? (
              <input
                className="tab-rename-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={finishRename}
                onKeyDown={(e) => e.key === 'Enter' && finishRename()}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span onDoubleClick={() => startRename(d.id, d.name)}>{d.name}</span>
            )}
            <button
              className="tab-close"
              onClick={(e) => { e.stopPropagation(); onClose(d.id); }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="designer-tab-add" onClick={handleCreate}>+</button>
    </div>
  );
}
