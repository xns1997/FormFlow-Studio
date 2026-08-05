import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AntdSelectInput, AntdSwitchInput, AntdTextAreaInput, AntdTextInput } from '../../../components/AntdFormControls';
import type { PropertyEditorContext } from '../propertyEditorRegistry';
import type { DataBindingConfig, DataBindingSource, RangeRef } from '../../../models';
import type {
  DateBusinessDayConfig,
  DateConstraintBoundaryConfig,
  DateConstraintConfig,
  DateDefaultValueConfig,
  DateOffsetUnit,
} from '../../../project/types';
import { useProjectStore } from '../../../project/store';
import RangeSelector from '../../../components/RangeSelector';
import { rangeToAddress } from '../../../services/data/rangeResolver';
import { normalizeOptionSource, resolveOptionSource, type TableOptionSourceConfig } from '../../../services/data/optionSource';
import { describeDateConstraints, describeDateDefaultSource, resolveDateConstraintState } from '../../../services/data/dateConvenience';

interface OptionRow { label: string; value: string }
const DATE_OFFSET_UNIT_OPTIONS: Array<{ label: string; value: DateOffsetUnit }> = [
  { label: '分钟', value: 'minute' },
  { label: '小时', value: 'hour' },
  { label: '天', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
];

function isDateComponentType(type?: string) {
  return type === 'datePicker' || type === 'timePicker' || type === 'dateRange';
}

function summarizeOptionSourceCard(source: ReturnType<typeof normalizeOptionSource>, tables: Array<Record<string, unknown>>) {
  if (source.mode === 'table') {
    const table = tables.find((item) => item.id === source.tableId);
    return `数据表 · ${table?.fileName || '未选择数据表'} / ${source.sheetName || '未选工作表'} / ${source.labelField || '未选字段'}`;
  }
  if (source.mode === 'range') {
    return `范围 · ${source.rangeRef ? rangeToAddress(source.rangeRef) : '未选择范围'}`;
  }
  return '静态 · 手动维护选项';
}

function summarizeOptionContent(source: ReturnType<typeof normalizeOptionSource>, options: unknown, resolvedOptions: Array<{ label: string; value: unknown }>, diagnostic?: string | null) {
  if (source.mode === 'table') {
    return diagnostic ? `数据表来源 · ${diagnostic}` : `数据表来源 · ${resolvedOptions.length} 项`;
  }
  if (source.mode === 'range') {
    return diagnostic ? `范围来源 · ${diagnostic}` : `范围来源 · ${resolvedOptions.length} 项`;
  }
  const rows = Array.isArray(options) ? options : [];
  return diagnostic ? `静态选项 · ${diagnostic}` : `静态选项 · ${rows.length} 项`;
}

export function OptionsVisual({ value, onChange, onValidity }: { value: unknown; onChange: (value: OptionRow[]) => void; onValidity: (valid: boolean) => void }) {
  const rows: OptionRow[] = Array.isArray(value) ? value.map((item) => typeof item === 'object' && item ? { label: String((item as any).label ?? ''), value: String((item as any).value ?? '') } : { label: String(item), value: String(item) }) : [];
  const [paste, setPaste] = useState('');
  const duplicates = rows.filter((row, index) => !row.value || rows.findIndex((other) => other.value === row.value) !== index);
  useEffect(() => onValidity(duplicates.length === 0), [duplicates.length, onValidity]);
  const update = (index: number, patch: Partial<OptionRow>) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const move = (index: number, offset: number) => { const next = [...rows]; const target = index + offset; if (target < 0 || target >= rows.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  const importRows = () => { const next = paste.split(/\r?\n/).filter(Boolean).map((line) => { const [label, nextValue = label] = line.split(/,|\t/); return { label: label.trim(), value: nextValue.trim() }; }); onChange([...rows, ...next]); setPaste(''); };
  const importCsvFile = async (file: File) => { const text = await file.text(); const imported = text.split(/\r?\n/).filter(Boolean).map((line) => { const [label, nextValue = label] = line.split(/,|\t/); return { label: label.replace(/^"|"$/g, '').trim(), value: nextValue.replace(/^"|"$/g, '').trim() }; }); onChange([...rows, ...imported]); };
  return <div className="property-editor-stack">
    <div className="property-table-head"><span>标签</span><span>值</span><i>排序</i></div>
    {rows.map((row, index) => <div className="property-table-row" key={index} draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) move(from, index - from); }}>
      <AntdTextInput value={row.label} placeholder="显示文字" onChange={(label) => update(index, { label })} />
      <AntdTextInput value={row.value} placeholder="唯一值" onChange={(nextValue) => update(index, { value: nextValue })} />
      <div><button type="button" onClick={() => move(index, -1)}>↑</button><button type="button" onClick={() => move(index, 1)}>↓</button><button type="button" onClick={() => onChange([...rows.slice(0, index + 1), { ...row, value: `${row.value}_copy` }, ...rows.slice(index + 1)])}>复制</button><button type="button" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}>×</button></div>
    </div>)}
    <button className="toolbar-btn" type="button" onClick={() => onChange([...rows, { label: '', value: '' }])}>添加选项</button>
    {duplicates.length > 0 && <div className="property-editor-error">选项值不能为空或重复</div>}
    <label className="property-editor-label"><span>批量粘贴（每行“标签,值”，也支持 Tab/CSV）</span><AntdTextAreaInput value={paste} rows={4} onChange={setPaste} /></label>
    <button className="toolbar-btn" type="button" disabled={!paste.trim()} onClick={importRows}>导入到列表</button>
    <label className="property-csv-import"><span>或导入 CSV 文件</span><input type="file" accept=".csv,text/csv,text/tab-separated-values" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsvFile(file); event.currentTarget.value = ''; }} /></label>
  </div>;
}

export function OptionSourceVisual({ value, onChange, onValidity }: { value: unknown; onChange: (value: Record<string, unknown>) => void; onValidity: (valid: boolean) => void }) {
  const tables = useProjectStore((state) => state.project?.srcTable || []);
  const source = normalizeOptionSource(value);
  const [wizardStep, setWizardStep] = useState(0);
  const [rangeOpen, setRangeOpen] = useState(false);
  const table = tables.find((item) => item.id === source.tableId);
  const sheet = table?.sheets.find((item) => item.name === source.sheetName);
  const resolved = resolveOptionSource([], source, tables);
  const invalid = (source.mode === 'table' || source.mode === 'range') && !!resolved.diagnostic;
  const permissionDenied = /权限|禁止|forbidden|denied/i.test(String(resolved.diagnostic || ''));
  useEffect(() => onValidity(!invalid), [invalid, onValidity]);

  const emit = (patch: Partial<TableOptionSourceConfig>) => onChange({ ...source, ...patch });
  const defaultsForTable = (tableId: string) => {
    const nextTable = tables.find((item) => item.id === tableId);
    const nextSheet = nextTable?.sheets[0];
    const firstField = nextSheet?.headers[0] || '';
    onChange({ ...source, mode: 'table', tableId, sheetName: nextSheet?.name || '', labelField: firstField, valueField: firstField });
  };
  const defaultsForSheet = (sheetName: string) => {
    const nextSheet = table?.sheets.find((item) => item.name === sheetName);
    const firstField = nextSheet?.headers[0] || '';
    emit({ sheetName, labelField: firstField, valueField: firstField });
  };
  const defaultsForRange = (ref: RangeRef) => {
    onChange({ ...source, mode: 'range', rangeRef: ref, labelColumn: 0, valueColumn: 0 });
  };
  const rangeColumns = source.rangeRef
    ? (() => {
        const currentTable = tables.find((item) => item.id === source.rangeRef?.tableId);
        const currentSheet = currentTable?.sheets.find((item) => item.name === source.rangeRef?.sheetName);
        const startCol = source.rangeRef.startCol;
        const endCol = source.rangeRef.endCol;
        return Array.from({ length: Math.max(0, endCol - startCol + 1) }, (_, index) => {
          const actualIndex = startCol + index;
          const header = currentSheet?.headers[actualIndex] || `第 ${index + 1} 列`;
          return { label: header, value: String(index) };
        });
      })()
    : [];

  const sourceSummary = summarizeOptionSourceCard(source, tables as any);
  return <div className="property-editor-stack">
    <nav className="property-wizard-steps" aria-label="选项配置步骤">{['选项来源', '字段映射', '联动检查'].map((label, index) => <button key={label} type="button" aria-current={wizardStep === index ? 'step' : undefined} className={wizardStep === index ? 'active' : ''} onClick={() => setWizardStep(index)}>{index + 1}. {label}</button>)}</nav>
    <div className="property-editor-help">第 {wizardStep + 1} 步：{wizardStep === 0 ? '先选择静态选项、项目数据源或数据范围。' : wizardStep === 1 ? '确认显示字段、值字段或范围列。' : '检查加载中、无匹配和权限失败时的下一步。'}</div>
    <div className="property-impact"><b>当前来源</b><span>{sourceSummary}</span></div>
    <label className="property-editor-label"><span>选项来源</span><AntdSelectInput value={source.mode || 'static'} options={[{ label: '静态选项', value: 'static' }, { label: '项目数据源', value: 'table' }, { label: '数据范围', value: 'range' }]} onChange={(mode) => {
      if (String(mode) === 'table') defaultsForTable(source.tableId && tables.some((item) => item.id === source.tableId) ? source.tableId : tables[0]?.id || '');
      else if (String(mode) === 'range') {
        if (source.rangeRef?.tableId) emit({ mode: 'range' });
        else setRangeOpen(true);
      }
      else emit({ mode: 'static' });
    }} /></label>
    {source.mode === 'table' && <>
      <div className="property-composite-grid">
        <label><span>数据源</span><AntdSelectInput value={source.tableId || ''} options={tables.map((item) => ({ label: item.fileName, value: item.id }))} onChange={(tableId) => defaultsForTable(String(tableId))} /></label>
        <label><span>工作表</span><AntdSelectInput value={source.sheetName || ''} options={(table?.sheets || []).map((item) => ({ label: item.name, value: item.name }))} onChange={(sheetName) => defaultsForSheet(String(sheetName))} /></label>
        <label><span>显示字段</span><AntdSelectInput value={source.labelField || ''} options={(sheet?.headers || []).map((field) => ({ label: field, value: field }))} onChange={(labelField) => emit({ labelField: String(labelField), valueField: source.valueField || String(labelField) })} /></label>
        <label><span>值字段</span><AntdSelectInput value={source.valueField || source.labelField || ''} options={(sheet?.headers || []).map((field) => ({ label: field, value: field }))} onChange={(valueField) => emit({ valueField: String(valueField) })} /></label>
        <label><span>排序</span><AntdSelectInput value={source.sortOrder || 'none'} options={[{ label: '保持数据顺序', value: 'none' }, { label: '显示文字升序', value: 'asc' }, { label: '显示文字降序', value: 'desc' }]} onChange={(sortOrder) => emit({ sortOrder: String(sortOrder) as TableOptionSourceConfig['sortOrder'] })} /></label>
        <label><span>值去重</span><AntdSwitchInput checked={source.unique !== false} onChange={(unique) => emit({ unique })} /></label>
      </div>
      {!tables.length && <div className="property-editor-warning">项目中还没有可用数据源，请先导入数据表。</div>}
      {invalid && tables.length > 0 && <div className="property-editor-warning">{permissionDenied ? '当前数据源没有访问权限，请申请权限或重新选择可用数据源。' : `${resolved.diagnostic}，请重新选择对应字段。`}</div>}
      {!invalid && <div className="property-impact"><b>选项预览 · {resolved.options.length} 项</b><span>{resolved.options.slice(0, 5).map((item) => item.label).join('、') || '当前工作表没有非空选项'}{resolved.options.length > 5 ? '…' : ''}</span></div>}
    </>}
    {source.mode === 'range' && <>
      <button type="button" className="toolbar-btn" onClick={() => setRangeOpen(true)}>
        {source.rangeRef?.tableId ? `重新选择 · ${rangeToAddress(source.rangeRef)}` : '选择数据范围'}
      </button>
      {!!source.rangeRef && (
        <div className="property-composite-grid">
          <label><span>显示列</span><AntdSelectInput value={String(source.labelColumn ?? 0)} options={rangeColumns} onChange={(labelColumn) => emit({ labelColumn: Number(labelColumn), valueColumn: source.valueColumn ?? Number(labelColumn) })} /></label>
          <label><span>值列</span><AntdSelectInput value={String(source.valueColumn ?? source.labelColumn ?? 0)} options={rangeColumns} onChange={(valueColumn) => emit({ valueColumn: Number(valueColumn) })} /></label>
          <label><span>排序</span><AntdSelectInput value={source.sortOrder || 'none'} options={[{ label: '保持数据顺序', value: 'none' }, { label: '显示文字升序', value: 'asc' }, { label: '显示文字降序', value: 'desc' }]} onChange={(sortOrder) => emit({ sortOrder: String(sortOrder) as TableOptionSourceConfig['sortOrder'] })} /></label>
          <label><span>值去重</span><AntdSwitchInput checked={source.unique !== false} onChange={(unique) => emit({ unique })} /></label>
        </div>
      )}
      {source.rangeRef && resolved.diagnostic && <div className="property-editor-warning">{permissionDenied ? '当前范围没有访问权限，请申请权限或重新选择范围。' : `${resolved.diagnostic}，请重新选择范围或列。`}</div>}
      {source.rangeRef && !resolved.diagnostic && <div className="property-impact"><b>选项预览 · {resolved.options.length} 项</b><span>{resolved.options.slice(0, 5).map((item) => item.label).join('、') || '当前范围没有非空选项'}{resolved.options.length > 5 ? '…' : ''}</span></div>}
      {rangeOpen && <RangeSelector tables={tables} value={source.rangeRef || null} onConfirm={(ref) => { defaultsForRange(ref); setRangeOpen(false); }} onCancel={() => setRangeOpen(false)} />}
    </>}
    {source.mode === 'static' && <div className="property-editor-help">当前使用下方“静态选项”列表；切换为项目数据源或数据范围后，将自动生成选项。</div>}
  </div>;
}

export function OptionContentVisual({ value, context, onChange, onValidity }: { value: unknown; context: PropertyEditorContext; onChange: (value: OptionRow[]) => void; onValidity: (valid: boolean) => void }) {
  const tables = useProjectStore((state) => state.project?.srcTable || []);
  const [inferenceUndo, setInferenceUndo] = useState<OptionRow[] | null>(null);
  const source = normalizeOptionSource(context.values.optionSource);
  const resolved = useMemo(() => resolveOptionSource(value, source, tables), [value, source, tables]);
  const contentSummary = summarizeOptionContent(source, value, resolved.options, resolved.diagnostic || null);

  useEffect(() => {
    if (source.mode === 'static') {
      const rows: OptionRow[] = Array.isArray(value)
        ? value.map((item) => typeof item === 'object' && item ? { label: String((item as any).label ?? ''), value: String((item as any).value ?? '') } : { label: String(item), value: String(item) })
        : [];
      const invalid = rows.some((row, index) => !row.value || rows.findIndex((other) => other.value === row.value) !== index);
      onValidity(!invalid);
      return;
    }
    onValidity(true);
  }, [onValidity, source.mode, value]);

  if (source.mode !== 'static') {
    return (
      <div className="property-editor-stack">
        <div className="property-impact"><b>选项内容</b><span>{contentSummary}</span></div>
        <div className="property-editor-help">
          当前选项由{source.mode === 'table' ? '数据表' : '数据范围'}自动生成，无需单独维护静态列表。请在“选项来源”里修改来源、字段、范围和排序去重。
        </div>
        {resolved.diagnostic
          ? <div className="property-editor-warning">{resolved.diagnostic}</div>
          : <div className="property-impact"><b>预览</b><span>{resolved.options.slice(0, 5).map((item) => item.label).join('、') || '暂无选项'}{resolved.options.length > 5 ? '…' : ''}</span></div>}
      </div>
    );
  }

  return (
    <div className="property-editor-stack">
      <div className="property-impact"><b>选项内容</b><span>{contentSummary}</span></div>
      {tables[0]?.sheets[0]?.headers?.length && <button type="button" className="toolbar-btn" onClick={() => { const sheet = tables[0].sheets[0]; const field = sheet.headers[0]; const inferred = sheet.preview.slice(0, 100).map((row) => String(row[field] ?? '')).filter(Boolean).filter((item, index, list) => list.indexOf(item) === index).map((item) => ({ label: item, value: item })); if (inferred.length) { setInferenceUndo(Array.isArray(value) ? value as OptionRow[] : []); onChange(inferred); } }}>从当前数据表推断选项</button>}
      {inferenceUndo && <button type="button" className="toolbar-btn" onClick={() => { onChange(inferenceUndo); setInferenceUndo(null); }}>撤销本次推断</button>}
      <OptionsVisual value={value} onChange={onChange} onValidity={onValidity} />
    </div>
  );
}

export function OptionAdvancedVisual({ value, onChange, onValidity }: { value: unknown; onChange: (value: Record<string, unknown>) => void; onValidity: (valid: boolean) => void }) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  useEffect(() => onValidity(true), [onValidity]);
  const patch = (next: Partial<Record<'optionUpdatePolicy' | 'emptyOptionsBehavior' | 'optionEmptyText' | 'optionLoadingText' | 'optionLoading', unknown>>) => onChange({ ...record, ...next });
  return (
    <div className="property-editor-stack">
      <div className="property-impact">
        <b>当前策略</b>
        <span>{`联动后：${record.optionUpdatePolicy === 'clearInvalid' || !record.optionUpdatePolicy ? '清理失效值' : String(record.optionUpdatePolicy)} · 无候选时：${record.emptyOptionsBehavior === 'keepEnabled' || !record.emptyOptionsBehavior ? '保持可用' : String(record.emptyOptionsBehavior)}`}</span>
      </div>
      <label className="property-editor-label"><span>联动后</span><AntdSelectInput value={String(record.optionUpdatePolicy || 'clearInvalid')} options={[{ label: '清理失效值', value: 'clearInvalid' }]} onChange={(next) => patch({ optionUpdatePolicy: next })} /></label>
      <label className="property-editor-label"><span>无候选时</span><AntdSelectInput value={String(record.emptyOptionsBehavior || 'keepEnabled')} options={[{ label: '允许继续并显示提示', value: 'keepEnabled' }, { label: '禁止继续填写', value: 'disable' }]} onChange={(next) => patch({ emptyOptionsBehavior: next })} /></label>
      <label className="property-editor-label"><span>无选项提示</span><AntdTextInput value={String(record.optionEmptyText || '暂无可选项')} onChange={(next) => patch({ optionEmptyText: next })} /></label>
      <label className="property-editor-label"><span>加载中提示</span><AntdTextInput value={String(record.optionLoadingText || '加载选项中…')} onChange={(next) => patch({ optionLoadingText: next })} /></label>
      <label className="property-editor-label"><span>当前正在加载</span><AntdSwitchInput checked={record.optionLoading === true} onChange={(next) => patch({ optionLoading: next })} /></label>
    </div>
  );
}

function DateBoundaryEditor({
  label,
  value,
  fields,
  componentType,
  onChange,
}: {
  label: string;
  value: DateConstraintBoundaryConfig | undefined;
  fields: string[];
  componentType?: string;
  onChange: (value: DateConstraintBoundaryConfig) => void;
}) {
  const mode = value?.mode || 'none';
  const dateFieldOptions = fields.map((field) => ({ label: field, value: field }));
  const boundaryValueType = componentType === 'timePicker' ? 'time' : componentType === 'datePicker' ? 'datetime' : 'date';
  return (
    <div className="property-array-card">
      <div className="property-array-card-head"><strong>{label}</strong></div>
      <div className="property-array-grid">
        <label>
          <span>来源</span>
          <AntdSelectInput
            value={mode}
            options={[
              { label: '不限制', value: 'none' },
              { label: '固定值', value: 'fixed' },
              { label: '今天', value: 'today' },
              { label: '当前时间', value: 'now' },
              { label: '另一字段', value: 'field' },
              { label: '另一字段 ± 偏移', value: 'fieldOffset' },
            ]}
            onChange={(next) => onChange({ mode: next as DateConstraintBoundaryConfig['mode'] })}
          />
        </label>
        {mode === 'fixed' && (
          <label>
            <span>固定值</span>
            {boundaryValueType === 'time' ? (
              <AntdTextInput value={String((value as any)?.value || '')} placeholder="HH:mm" onChange={(next) => onChange({ mode: 'fixed', value: next })} />
            ) : (
              <AntdTextInput value={String((value as any)?.value || '')} placeholder={componentType === 'datePicker' ? '2026-07-22 09:00' : '2026-07-22'} onChange={(next) => onChange({ mode: 'fixed', value: next })} />
            )}
          </label>
        )}
        {(mode === 'field' || mode === 'fieldOffset') && (
          <label>
            <span>来源字段</span>
            <AntdSelectInput value={String((value as any)?.field || '')} options={dateFieldOptions} onChange={(next) => onChange({ ...(value as any), mode: mode as any, field: String(next) })} />
          </label>
        )}
        {mode === 'fieldOffset' && (
          <>
            <label>
              <span>偏移量</span>
              <AntdTextInput value={String((value as any)?.offset ?? 0)} onChange={(next) => onChange({ ...(value as any), mode: 'fieldOffset', offset: Number(next) || 0 })} />
            </label>
            <label>
              <span>单位</span>
              <AntdSelectInput value={String((value as any)?.unit || 'day')} options={DATE_OFFSET_UNIT_OPTIONS} onChange={(next) => onChange({ ...(value as any), mode: 'fieldOffset', unit: next as DateOffsetUnit })} />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

export function DateDefaultConfigVisual({ value, context, onChange, onValidity }: { value: unknown; context: PropertyEditorContext; onChange: (value: DateDefaultValueConfig) => void; onValidity: (valid: boolean) => void }) {
  const current = (value && typeof value === 'object' ? value : { mode: 'none' }) as DateDefaultValueConfig;
  const componentType = context.component?.type;
  const fieldOptions = context.fields.map((field) => ({ label: field, value: field }));
  useEffect(() => onValidity(true), [onValidity]);
  return (
    <div className="property-editor-stack">
      <label className="property-editor-label">
        <span>默认值模式</span>
        <AntdSelectInput
          value={current.mode}
          options={[
            { label: '不设置', value: 'none' },
            ...(componentType === 'dateRange'
              ? [{ label: '本周起止', value: 'rangePreset:week' }, { label: '本月起止', value: 'rangePreset:month' }]
              : [
                  { label: '今天', value: 'today' },
                  { label: '当前时间', value: 'now' },
                  { label: '当前时间偏移', value: 'offsetFromNow' },
                  { label: '本周开始', value: 'startOfWeek' },
                  { label: '本周结束', value: 'endOfWeek' },
                  { label: '本月开始', value: 'startOfMonth' },
                  { label: '本月结束', value: 'endOfMonth' },
                  { label: '跟随另一字段', value: 'fromField' },
                ]),
          ]}
          onChange={(next) => {
            const mode = String(next);
            if (mode === 'rangePreset:week') onChange({ mode: 'rangePreset', preset: 'thisWeek' });
            else if (mode === 'rangePreset:month') onChange({ mode: 'rangePreset', preset: 'thisMonth' });
            else onChange(mode === 'fromField'
              ? { mode: 'fromField', field: '', offset: 0, unit: 'day' }
              : mode === 'offsetFromNow'
                ? { mode: 'offsetFromNow', offset: 0, unit: 'day' }
                : { mode: mode as Exclude<DateDefaultValueConfig['mode'], 'fromField' | 'offsetFromNow' | 'rangePreset'> });
          }}
        />
      </label>
      {(current.mode === 'offsetFromNow' || current.mode === 'fromField') && (
        <div className="property-composite-grid">
          {current.mode === 'fromField' && (
            <label>
              <span>来源字段</span>
              <AntdSelectInput value={String(current.field || '')} options={fieldOptions} onChange={(next) => onChange({ ...current, field: String(next) })} />
            </label>
          )}
          <label>
            <span>偏移量</span>
            <AntdTextInput value={String(current.offset ?? 0)} onChange={(next) => onChange({ ...current, offset: Number(next) || 0 } as DateDefaultValueConfig)} />
          </label>
          <label>
            <span>单位</span>
            <AntdSelectInput value={String(current.unit || 'day')} options={DATE_OFFSET_UNIT_OPTIONS} onChange={(next) => onChange({ ...current, unit: next as DateOffsetUnit } as DateDefaultValueConfig)} />
          </label>
        </div>
      )}
      <div className="property-impact"><b>默认来源</b><span>{describeDateDefaultSource(current)}</span></div>
    </div>
  );
}

export function DateConstraintConfigVisual({ value, context, onChange, onValidity }: { value: unknown; context: PropertyEditorContext; onChange: (value: DateConstraintConfig) => void; onValidity: (valid: boolean) => void }) {
  const current = (value && typeof value === 'object' ? value : {}) as DateConstraintConfig;
  const [presetUndo, setPresetUndo] = useState<DateConstraintConfig | null>(null);
  const applyPreset = (next: DateConstraintConfig) => { setPresetUndo(current); onChange(next); };
  const componentType = context.component?.type;
  const state = resolveDateConstraintState(current, context.values, componentType === 'timePicker' ? 'time' : context.values.showTime ? 'datetime' : 'date');
  useEffect(() => onValidity(!state.conflict), [onValidity, state.conflict]);
  return (
    <div className="property-editor-stack">
      <div className="property-editor-examples" aria-label="常用日期限制预设">
        <button type="button" onClick={() => applyPreset({ ...current, min: { mode: 'today' } })}>今天起</button>
        <button type="button" onClick={() => applyPreset({ ...current, min: { mode: 'fixed', value: dayjs().subtract(29, 'day').format('YYYY-MM-DD') }, max: { mode: 'today' } })}>最近 30 天</button>
        {presetUndo && <button type="button" onClick={() => { onChange(presetUndo); setPresetUndo(null); }}>撤销预设</button>}
        <span className="property-editor-help">也可在下方选择“另一字段 ± 偏移”</span>
      </div>
      <DateBoundaryEditor label="最小值限制" value={current.min} fields={context.fields.filter(Boolean)} componentType={componentType} onChange={(next) => onChange({ ...current, min: next })} />
      <DateBoundaryEditor label="最大值限制" value={current.max} fields={context.fields.filter(Boolean)} componentType={componentType} onChange={(next) => onChange({ ...current, max: next })} />
      <div className="property-impact"><b>当前限制</b><span>{describeDateConstraints(state).join('；') || '未设置'}</span></div>
      {state.conflict && <div className="property-editor-error">{state.conflict}</div>}
    </div>
  );
}

export function DateBusinessDayConfigVisual({ value, onChange, onValidity }: { value: unknown; onChange: (value: DateBusinessDayConfig) => void; onValidity: (valid: boolean) => void }) {
  const current = (value && typeof value === 'object' ? value : { mode: 'allDays' }) as DateBusinessDayConfig;
  useEffect(() => onValidity(true), [onValidity]);
  return (
    <div className="property-editor-stack">
      <label className="property-editor-label">
        <span>可选日期</span>
        <AntdSelectInput value={current.mode || 'allDays'} options={[{ label: '全部日期', value: 'allDays' }, { label: '仅工作日', value: 'weekdaysOnly' }]} onChange={(next) => onChange({ mode: next as DateBusinessDayConfig['mode'] })} />
      </label>
      <div className="property-editor-help">仅工作日模式会禁用周六和周日；本轮不接入法定节假日。</div>
    </div>
  );
}

export function StringListVisual({ value, onChange, onValidity }: { value: unknown; onChange: (value: string[]) => void; onValidity: (valid: boolean) => void }) {
  const rows = Array.isArray(value) ? value.map((item) => String(item)) : [];
  const [paste, setPaste] = useState('');
  const invalid = rows.some((item) => !item.trim());
  useEffect(() => onValidity(!invalid), [invalid, onValidity]);
  const move = (index: number, offset: number) => { const next = [...rows]; const target = index + offset; if (target < 0 || target >= rows.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  return <div className="property-editor-stack">
    {rows.map((row, index) => <div className="property-string-row" key={index}><AntdTextInput value={row} placeholder="名称" onChange={(next) => onChange(rows.map((item, rowIndex) => rowIndex === index ? next : item))} /><div><button type="button" disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === rows.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}>删除</button></div></div>)}
    <button className="toolbar-btn" type="button" onClick={() => onChange([...rows, ''])}>添加一项</button>
    {invalid && <div className="property-editor-error">名称不能为空</div>}
    <label className="property-editor-label"><span>批量添加（每行一项）</span><AntdTextAreaInput value={paste} rows={4} onChange={setPaste} /></label>
    <button className="toolbar-btn" type="button" disabled={!paste.trim()} onClick={() => { onChange([...rows, ...paste.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)]); setPaste(''); }}>导入列表</button>
  </div>;
}

const ARRAY_EDITOR_COLUMNS: Record<string, Array<{ key: string; label: string; placeholder?: string; options?: Array<{ label: string; value: string }> }>> = {
  'table-columns': [
    { key: 'title', label: '列名' },
    { key: 'dataIndex', label: '字段' },
    { key: 'type', label: '数据类型', options: ['text', 'number', 'date', 'boolean', 'enum'].map((value) => ({ label: value, value })) },
    { key: 'editor', label: '编辑器', options: ['text', 'number', 'date', 'boolean', 'select'].map((value) => ({ label: value, value })) },
    { key: 'editable', label: '可编辑', options: [{ label: '是', value: 'true' }, { label: '否', value: 'false' }] },
    { key: 'required', label: '必填', options: [{ label: '是', value: 'true' }, { label: '否', value: 'false' }] },
    { key: 'options', label: '下拉选项', placeholder: '逗号分隔' },
    { key: 'min', label: '最小值' },
    { key: 'max', label: '最大值' },
    { key: 'width', label: '宽度' },
    { key: 'format', label: '格式' },
    { key: 'visible', label: '显示', options: [{ label: '显示', value: 'show' }, { label: '隐藏', value: 'hide' }] },
  ],
  tabs: [{ key: 'label', label: '标签' }, { key: 'key', label: '标识' }],
  steps: [{ key: 'title', label: '步骤' }, { key: 'description', label: '说明' }],
  filters: [{ key: 'field', label: '字段' }, { key: 'operator', label: '条件' }, { key: 'value', label: '值' }],
  sorting: [{ key: 'field', label: '字段' }, { key: 'direction', label: '方向', options: [{ label: '升序', value: 'asc' }, { label: '降序', value: 'desc' }] }],
};

export function ArrayRowsVisual({ kind, value, fields, onChange, onValidity }: { kind: string; value: unknown; fields: string[]; onChange: (value: unknown[]) => void; onValidity: (valid: boolean) => void }) {
  const columns = ARRAY_EDITOR_COLUMNS[kind] || [{ key: 'value', label: '内容' }];
  const rows: Record<string, unknown>[] = Array.isArray(value) ? value.map((item) => typeof item === 'object' && item ? item as Record<string, unknown> : kind === 'table-columns' ? { title: String(item), dataIndex: String(item), visible: 'show' } : { value: item }) : [];
  const identityKey = kind === 'table-columns' ? 'dataIndex' : kind === 'filters' || kind === 'sorting' ? 'field' : columns[0]?.key;
  const invalid = rows.some((row, index) => !String(row[identityKey] || '').trim() || (kind !== 'filters' && rows.findIndex((other) => String(other[identityKey] || '') === String(row[identityKey] || '')) !== index));
  const [paste, setPaste] = useState('');
  useEffect(() => onValidity(!invalid), [invalid, onValidity]);
  const move = (index: number, offset: number) => { const target = index + offset; if (target < 0 || target >= rows.length) return; const next = [...rows]; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  return <div className="property-editor-stack">
    {rows.map((row, index) => <div className="property-array-card" key={index}><div className="property-array-card-head"><strong>{index + 1}</strong><div><button type="button" disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === rows.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}>删除</button></div></div><div className="property-array-grid">{columns.map((column) => <label key={column.key}><span>{column.label}</span>{kind === 'table-columns' && column.key === 'visible' ? <AntdSelectInput value={String(row[column.key] ?? 'show')} options={[{ label: '显示', value: 'show' }, { label: '隐藏', value: 'hide' }]} onChange={(next) => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, visible: next } : item))} /> : column.options || (column.key === 'field' || column.key === 'dataIndex') && fields.length ? <AntdSelectInput value={String(row[column.key] ?? '')} options={column.options || fields.map((field) => ({ label: field, value: field }))} onChange={(next) => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, [column.key]: next } : item))} /> : <AntdTextInput value={String(row[column.key] ?? '')} placeholder={column.placeholder} onChange={(next) => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, [column.key]: next } : item))} />}</label>)}</div></div>)}
    <button className="toolbar-btn" type="button" onClick={() => onChange([...rows, Object.fromEntries(columns.map((column) => [column.key, '']))])}>添加一项</button>
    {kind === 'table-columns' && <><label className="property-editor-label"><span>批量添加列（每行“列名,字段”）</span><AntdTextAreaInput value={paste} rows={3} onChange={setPaste} /></label><button className="toolbar-btn" type="button" disabled={!paste.trim()} onClick={() => { const imported = paste.split(/\r?\n/).map((line) => line.split(/[,\t]/).map((item) => item.trim())).filter(([title, dataIndex]) => title && dataIndex).map(([title, dataIndex]) => ({ title, dataIndex, visible: 'show' })); onChange([...rows, ...imported]); setPaste(''); }}>导入列</button>{fields.length > 0 && <button className="toolbar-btn" type="button" onClick={() => onChange([...rows, ...fields.filter((field) => !rows.some((row) => String(row.dataIndex || '') === field)).map((field) => ({ title: field, dataIndex: field, visible: 'show' }))])}>从当前数据表导入字段</button>}</>}
    {invalid && <div className="property-editor-error">字段不能为空或重复</div>}
  </div>;
}

export function KeyValueVisual({ value, fields, onChange, onValidity }: { value: unknown; fields: string[]; onChange: (value: Record<string, unknown>) => void; onValidity: (valid: boolean) => void }) {
  const rows = value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : [];
  const invalid = rows.some(([key], index) => !key || rows.findIndex(([other]) => other === key) !== index);
  useEffect(() => onValidity(!invalid), [invalid, onValidity]);
  return <div className="property-editor-stack">{rows.map(([key, rowValue], index) => <div className="property-table-row" key={index}><AntdTextInput value={key} placeholder="键 / 参数" onChange={(nextKey) => onChange(Object.fromEntries(rows.map(([currentKey, currentValue], rowIndex) => [rowIndex === index ? nextKey : currentKey, currentValue])))} /><AntdTextInput value={String(rowValue ?? '')} placeholder="值 / 字段路径" onChange={(nextValue) => onChange(Object.fromEntries(rows.map(([currentKey, currentValue], rowIndex) => [currentKey, rowIndex === index ? nextValue : currentValue])))} /><div><button type="button" onClick={() => onChange(Object.fromEntries(rows.filter((_, rowIndex) => rowIndex !== index)))}>×</button></div></div>)}<button className="toolbar-btn" type="button" onClick={() => onChange({ ...(value as object || {}), [`key${rows.length + 1}`]: fields[0] || '' })}>添加映射</button>{invalid && <div className="property-editor-error">键不能为空或重复</div>}</div>;
}

export function DataBindingVisual({ value, context, onChange, onValidity }: { value: unknown; context: PropertyEditorContext; onChange: (value: Record<string, unknown>) => void; onValidity: (valid: boolean) => void }) {
  const tables = useProjectStore((state) => state.project?.srcTable || []);
  const initial = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<DataBindingConfig> : {};
  const source = initial.source as DataBindingSource | undefined;
  const sourceKind = source?.kind || 'none';
  const [rangeOpen, setRangeOpen] = useState(false);
  const binding: DataBindingConfig = { version: 1, direction: initial.direction || 'dataToUi', valueMode: initial.valueMode || 'auto', source: source || { kind: 'none' }, defaultValue: initial.defaultValue };
  const emit = (patch: Partial<DataBindingConfig>) => onChange({ ...binding, ...patch });
  const setSource = (next: DataBindingSource) => emit({ source: next });
  const componentFields = (context.fieldCatalog || []).filter((item) => item.source === 'component');
  const field = sourceKind === 'formField' ? componentFields.find((item) => item.path === (source as any)?.path) : undefined;
  const table = sourceKind === 'tableCell' ? tables.find((item) => item.id === (source as any).tableId) : undefined;
  const sheet = sourceKind === 'tableCell' ? table?.sheets.find((item) => item.name === (source as any).sheetName) : undefined;
  const writeMismatch = binding.direction !== 'dataToUi' && sourceKind !== 'tableCell';
  const invalid = writeMismatch || (sourceKind === 'none' ? false : sourceKind === 'formField' ? !(source as any)?.path || !field
    : sourceKind === 'range' ? !(source as any)?.ref?.tableId
      : !(source as any)?.tableId || !(source as any)?.sheetName || !(source as any)?.column);
  useEffect(() => onValidity(!invalid), [invalid, onValidity]);
  const changeKind = (value: string | string[]) => { const kind = String(value); setSource(kind === 'range' ? { kind: 'range', ref: null as unknown as RangeRef } : kind === 'tableCell' ? { kind: 'tableCell', tableId: tables[0]?.id || '', sheetName: tables[0]?.sheets[0]?.name || '', column: '' } : kind === 'formField' ? { kind: 'formField', path: '' } : { kind: 'none' }); };
  return <div className="property-editor-stack">
    <div className="property-composite-grid"><label><span>来源类型</span><AntdSelectInput value={sourceKind} options={[{ label: '不绑定', value: 'none' }, { label: '表单字段', value: 'formField' }, { label: '数据范围', value: 'range' }, { label: '表格单元格', value: 'tableCell' }]} onChange={changeKind} /></label><label><span>绑定方向</span><AntdSelectInput value={binding.direction} options={[{ label: '数据 → 控件', value: 'dataToUi' }, { label: '控件 → 数据', value: 'uiToData' }, { label: '双向', value: 'twoWay' }]} onChange={(next) => emit({ direction: next as DataBindingConfig['direction'] })} /></label></div>
    {sourceKind === 'formField' && <label className="property-editor-label"><span>来源字段</span><AntdSelectInput value={String((source as any)?.path || '')} options={componentFields.map((item) => ({ label: `${item.label} · ${item.type} · ${item.sourceLabel || '当前表单'}`, value: item.path }))} onChange={(path) => setSource({ kind: 'formField', path: String(path) })} /></label>}
    {sourceKind === 'range' && <><button type="button" className="toolbar-btn" onClick={() => setRangeOpen(true)}>{(source as any)?.ref?.tableId ? `重新选择 · ${rangeToAddress((source as any).ref)}` : '选择数据范围'}</button>{rangeOpen && <RangeSelector tables={tables} value={(source as any)?.ref || null} onConfirm={(ref) => { setSource({ kind: 'range', ref }); setRangeOpen(false); }} onCancel={() => setRangeOpen(false)} />}</>}
    {sourceKind === 'tableCell' && <div className="property-composite-grid"><label><span>数据表</span><AntdSelectInput value={String((source as any)?.tableId || '')} options={tables.map((item) => ({ label: item.fileName, value: item.id }))} onChange={(tableId) => { const nextTable = tables.find((item) => item.id === tableId); setSource({ kind: 'tableCell', tableId: String(tableId), sheetName: nextTable?.sheets[0]?.name || '', column: '' }); }} /></label><label><span>工作表</span><AntdSelectInput value={String((source as any)?.sheetName || '')} options={(table?.sheets || []).map((item) => ({ label: item.name, value: item.name }))} onChange={(sheetName) => setSource({ ...(source as any), kind: 'tableCell', sheetName: String(sheetName), column: '' })} /></label><label><span>目标列</span><AntdSelectInput value={String((source as any)?.column || '')} options={(sheet?.headers || []).map((item) => ({ label: item, value: item }))} onChange={(column) => setSource({ ...(source as any), kind: 'tableCell', column: String(column) })} /></label><label><span>键字段</span><AntdSelectInput value={String((source as any)?.keyField || '')} options={(sheet?.headers || []).map((item) => ({ label: item, value: item }))} onChange={(keyField) => setSource({ ...(source as any), kind: 'tableCell', keyField: String(keyField) })} /></label><label><span>键值</span><AntdTextInput value={String((source as any)?.keyValue ?? '')} onChange={(keyValue) => setSource({ ...(source as any), kind: 'tableCell', keyValue })} /></label></div>}
    <div className="property-composite-grid"><label><span>取值方式</span><AntdSelectInput value={binding.valueMode || 'auto'} options={['auto', 'firstCell', 'firstRow', 'column', 'table'].map((mode) => ({ label: mode, value: mode }))} onChange={(valueMode) => emit({ valueMode: valueMode as DataBindingConfig['valueMode'] })} /></label><label><span>空值回退</span><AntdTextInput value={String(binding.defaultValue ?? '')} onChange={(defaultValue) => emit({ defaultValue })} /></label></div>
    {field && <div className="property-impact"><b>数据来源</b><span>{field.sourceLabel || '当前表单'} · {field.type}{field.sample !== undefined ? ` · 示例 ${String(field.sample)}` : ''}</span></div>}{writeMismatch && <div className="property-editor-warning">只有按键定位的表格单元格支持写回，请改为“数据 → 控件”或更换来源。</div>}{invalid && !writeMismatch && <div className="property-editor-warning">绑定不完整或来源已失效。旧配置不会被自动清除。</div>}
  </div>;
}
