import React, { useEffect, useState } from 'react';
import { getAllControls, getControlsByCategory, getCategories, CATEGORY_LABELS } from './registry';
import { DesignerIcon } from './icons';
import { AntdTextInput, FormAntdProvider } from '../components/AntdFormControls';
import { useProjectStore } from '../project/store';
import { FIELD_DROP_COMMITTED_EVENT, type DataFieldDragItem } from '../services/formGeneration/fieldControlRecommendation';
import { inferColumnInfo } from '../services/data/tableEditor';

const CATEGORY_META: Record<string, { hint: string }> = {
  basic: { hint: '录入与表单字段' },
  select: { hint: '选项与选择' },
  container: { hint: '布局与分组' },
  display: { hint: '内容与结果' },
};

interface ToolboxProps {
  source?: 'controls' | 'fields';
  onSourceChange?: (source: 'controls' | 'fields') => void;
  showSourceTabs?: boolean;
  onAddControl?: (type: string) => void;
}

export function Toolbox({ source, onSourceChange, showSourceTabs = true, onAddControl }: ToolboxProps = {}) {
  const [internalPanel, setInternalPanel] = useState<'controls' | 'fields'>('controls');
  const panel = source ?? internalPanel;
  const setPanel = (next: 'controls' | 'fields') => { setInternalPanel(next); onSourceChange?.(next); };
  const [search, setSearch] = useState('');
  const [fieldSearch, setFieldSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ basic: true, select: true, container: true, display: true });
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const tables = useProjectStore((state) => state.project?.srcTable || []);
  const normalizedTables = tables.map((table) => ({
    ...table,
    sheets: table.sheets.map((sheet) => ({
      ...sheet,
      columns: sheet.columns?.length
        ? sheet.columns
        : (sheet.headers || []).map((header, index) => inferColumnInfo(header, index, sheet.preview || [])),
    })),
  }));
  const dataFields: DataFieldDragItem[] = normalizedTables.flatMap((table) => table.sheets.flatMap((sheet) => sheet.columns.filter((column) => !column.hidden && column.visible !== false).map((column) => ({ tableId: table.id, tableName: table.fileName, sheetName: sheet.name, column }))));
  const visibleTables = normalizedTables.map((table) => ({ ...table, sheets: table.sheets.map((sheet) => ({ ...sheet, columns: sheet.columns.filter((column) => !column.hidden && column.visible !== false && (!fieldSearch.trim() || `${column.name} ${column.dataType} ${table.fileName} ${sheet.name}`.toLowerCase().includes(fieldSearch.trim().toLowerCase()))) })).filter((sheet) => sheet.columns.length > 0) })).filter((table) => table.sheets.length > 0);

  useEffect(() => {
    const clearCommittedSelection = () => setSelectedFields([]);
    window.addEventListener(FIELD_DROP_COMMITTED_EVENT, clearCommittedSelection);
    return () => window.removeEventListener(FIELD_DROP_COMMITTED_EVENT, clearCommittedSelection);
  }, []);

  const toggle = (cat: string) => setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const allControls = getAllControls();
  const filtered = search
    ? allControls.filter((c) => c.label.includes(search) || c.type.includes(search))
    : null;

  const renderItem = (c: ReturnType<typeof getAllControls>[number]) => (
    <button
      type="button"
      key={c.type}
      className="toolbox-item"
      title={`拖入画布，或双击添加${c.label}`}
      draggable
      onDoubleClick={() => onAddControl?.(c.type)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); onAddControl?.(c.type); }
      }}
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
    </button>
  );

  return (
    <FormAntdProvider>
    <div className="designer-toolbox">
      {showSourceTabs && <div className="toolbox-source-tabs" role="tablist" aria-label="添加内容">
        <button type="button" role="tab" aria-selected={panel === 'controls'} className={panel === 'controls' ? 'active' : ''} onClick={() => setPanel('controls')}>控件库</button>
        <button type="button" role="tab" aria-selected={panel === 'fields'} className={panel === 'fields' ? 'active' : ''} onClick={() => setPanel('fields')}>数据字段 <small>{dataFields.length}</small></button>
      </div>}
      <div className="toolbox-header">
        <div className="toolbox-search-shell">
          <span className="toolbox-search-icon">⌕</span>
          <AntdTextInput
            placeholder={panel === 'controls' ? '搜索控件' : '搜索数据表或字段'}
            value={panel === 'controls' ? search : fieldSearch}
            onChange={panel === 'controls' ? setSearch : setFieldSearch}
            style={{ width: '100%' }}
          />
          {(panel === 'controls' ? search : fieldSearch) && <button type="button" className="toolbox-search-clear" onClick={() => panel === 'controls' ? setSearch('') : setFieldSearch('')}>×</button>}
        </div>
      </div>
      <div className="toolbox-body">
        {panel === 'fields' ? <div className="toolbox-data-browser">
          <div className="toolbox-data-summary"><span>按数据表与工作表分组</span>{selectedFields.length > 0 && <button type="button" onClick={() => setSelectedFields([])}>已选 {selectedFields.length} · 清空</button>}</div>
          {visibleTables.length === 0 ? <div className="toolbox-empty"><strong>{dataFields.length ? '没有匹配字段' : '项目还没有数据字段'}</strong><p>{dataFields.length ? '换个字段名或数据表名试试。' : '先在数据预览中导入或创建数据表。'}</p></div> : visibleTables.map((table, tableIndex) => <details key={table.id} className="toolbox-data-table" open={!!fieldSearch || tableIndex === 0}>
            <summary><span><strong>{table.fileName}</strong><small>{table.sheets.reduce((sum, sheet) => sum + sheet.columns.length, 0)} 个字段</small></span><em>{table.sheets.length} 张工作表</em></summary>
            {table.sheets.map((sheet, sheetIndex) => <details key={`${table.id}:${sheet.name}`} className="toolbox-data-sheet" open={!!fieldSearch || (tableIndex === 0 && sheetIndex === 0)}>
              <summary><span>{sheet.name}</span><small>{sheet.columns.length}</small></summary>
              <div className="toolbox-data-fields">{sheet.columns.map((column) => {
                const item = dataFields.find((candidate) => candidate.tableId === table.id && candidate.sheetName === sheet.name && candidate.column.name === column.name)!;
                const key = `${item.tableId}:${item.sheetName}:${item.column.name}`;
                const selected = selectedFields.includes(key);
                return <div key={key} className={`toolbox-data-field ${selected ? 'selected' : ''}`} draggable title="拖到画布后选择控件类型并确认绑定" onDragStart={(event) => {
                  const keys = selected ? selectedFields : [key];
                  const fields = dataFields.filter((candidate) => keys.includes(`${candidate.tableId}:${candidate.sheetName}:${candidate.column.name}`));
                  event.dataTransfer.effectAllowed = 'copy';
                  event.dataTransfer.setData('application/formflow-fields', JSON.stringify(fields));
                  event.dataTransfer.setData('text/plain', 'formflow-data-fields');
                }}><input type="checkbox" checked={selected} aria-label={`选择字段 ${column.name}`} onChange={(event) => setSelectedFields((current) => event.target.checked ? [...current, key] : current.filter((itemKey) => itemKey !== key))} /><span>{column.name}</span><small>{column.dataType}</small></div>;
              })}</div>
            </details>)}
          </details>)}
        </div> : filtered ? (
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
