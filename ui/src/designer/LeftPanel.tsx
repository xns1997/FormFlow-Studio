import React, { useState } from 'react';
import { Toolbox } from './Toolbox';
import { ComponentTree } from './ComponentTree';
import type { DesignComponent } from '../project/types';
import { DesignerIcon } from './icons';

interface Props {
  components: DesignComponent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReparent: (id: string, parentId?: string) => void;
}

const TABS = [
  { key: 'toolbox', label: '控件', icon: 'toolbox' },
  { key: 'tree', label: '结构', icon: 'tree' },
] as const;

export function LeftPanel({ components, selectedId, onSelect, onRemove, onReparent }: Props) {
  const [activeTab, setActiveTab] = useState<'toolbox' | 'tree'>('toolbox');

  return (
    <div className="designer-left-panel">
      <div className="left-panel-tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`left-panel-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <DesignerIcon name={tab.icon} />
            <span>{tab.label}</span>
            {tab.key === 'tree' && components.length > 0 && (
              <span className="tab-count">{components.length}</span>
            )}
          </button>
        ))}
      </div>
      <div className="left-panel-body">
        {activeTab === 'toolbox' ? (
          <Toolbox />
        ) : (
          <ComponentTree
            components={components}
            selectedId={selectedId}
            onSelect={onSelect}
            onRemove={onRemove}
            onReparent={onReparent}
          />
        )}
      </div>
    </div>
  );
}
