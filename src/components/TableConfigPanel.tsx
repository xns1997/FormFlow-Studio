import React, { useState, useCallback } from 'react';
import { useProjectStore } from '../project/store';
import { createDefaultTableConfig, type TableConfig } from '../project/types';

interface Props {
  tableId: string;
  sheetName: string;
  config: TableConfig;
  onUpdate: (patch: Partial<TableConfig>) => void;
}

export default function TableConfigPanel({ tableId, sheetName, config, onUpdate }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>数据表配置</h4>

      <label className="schema-field">
        <span>表头高度</span>
        <input type="number" value={config.headerHeight} min={20} max={80}
          onChange={(e) => onUpdate({ headerHeight: Number(e.target.value) })} />
      </label>

      <label className="schema-field">
        <span>行高</span>
        <input type="number" value={config.rowHeight} min={20} max={60}
          onChange={(e) => onUpdate({ rowHeight: Number(e.target.value) })} />
      </label>

      <label className="schema-field boolean">
        <input type="checkbox" checked={config.alternateRowColor}
          onChange={(e) => onUpdate({ alternateRowColor: e.target.checked })} />
        <span>交替行颜色</span>
      </label>

      <label className="schema-field boolean">
        <input type="checkbox" checked={config.showGridLines}
          onChange={(e) => onUpdate({ showGridLines: e.target.checked })} />
        <span>显示网格线</span>
      </label>

      <label className="schema-field boolean">
        <input type="checkbox" checked={config.autoFitColumns}
          onChange={(e) => onUpdate({ autoFitColumns: e.target.checked })} />
        <span>自动列宽</span>
      </label>

      <label className="schema-field boolean">
        <input type="checkbox" checked={config.filterEnabled}
          onChange={(e) => onUpdate({ filterEnabled: e.target.checked })} />
        <span>启用筛选</span>
      </label>

      <label className="schema-field boolean">
        <input type="checkbox" checked={config.sortEnabled}
          onChange={(e) => onUpdate({ sortEnabled: e.target.checked })} />
        <span>启用排序</span>
      </label>

      <label className="schema-field">
        <span>冻结列数</span>
        <input type="number" value={config.frozenColumns} min={0} max={10}
          onChange={(e) => onUpdate({ frozenColumns: Number(e.target.value) })} />
      </label>

      <label className="schema-field">
        <span>冻结行数</span>
        <input type="number" value={config.frozenRows} min={0} max={10}
          onChange={(e) => onUpdate({ frozenRows: Number(e.target.value) })} />
      </label>
    </div>
  );
}
