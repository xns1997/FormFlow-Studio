import React, { useEffect, useState } from 'react';
import { AntdNumberInput, AntdSelectInput, AntdTextInput } from '../../../components/AntdFormControls';
import type { PropertyEditorContext } from '../propertyEditorRegistry';

export function CompositeVisual({ kind, value, context, onChange, onValidity }: { kind: string; value: unknown; context?: PropertyEditorContext; onChange: (value: Record<string, unknown>) => void; onValidity: (valid: boolean) => void }) {
  const record = kind === 'spacing' && (typeof value === 'number' || (typeof value === 'string' && value !== '')) ? { top: Number(value), right: Number(value), bottom: Number(value), left: Number(value) } : value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const schemas: Record<string, Array<{ key: string; label: string; type?: 'number' | 'text' | 'boolean' | 'select' }>> = {
    'number-range': [{ key: 'min', label: '最小值', type: 'number' }, { key: 'max', label: '最大值', type: 'number' }, { key: 'step', label: '步长', type: 'number' }, { key: 'precision', label: '小数位', type: 'number' }, { key: 'integer', label: '仅整数', type: 'boolean' }, { key: 'positive', label: '仅正数', type: 'boolean' }],
    'date-range': [{ key: 'minDate', label: '开始日期' }, { key: 'maxDate', label: '结束日期' }],
    'selection-range': [{ key: 'minSelect', label: '最少选择', type: 'number' }, { key: 'maxSelect', label: '最多选择', type: 'number' }],
    spacing: ['top', 'right', 'bottom', 'left'].map((key) => ({ key, label: ({ top: '上', right: '右', bottom: '下', left: '左' } as Record<string, string>)[key], type: 'number' })),
    typography: [{ key: 'fontFamily', label: '字体' }, { key: 'fontSize', label: '字号', type: 'number' }, { key: 'fontWeight', label: '字重' }, { key: 'color', label: '颜色' }, { key: 'lineHeight', label: '行高', type: 'number' }, { key: 'letterSpacing', label: '字间距', type: 'number' }, { key: 'textAlign', label: '对齐' }],
    border: [{ key: 'borderWidth', label: '宽度', type: 'number' }, { key: 'borderStyle', label: '样式' }, { key: 'borderColor', label: '颜色' }],
    shadow: [{ key: 'shadowX', label: '水平偏移', type: 'number' }, { key: 'shadowY', label: '垂直偏移', type: 'number' }, { key: 'shadowBlur', label: '模糊', type: 'number' }, { key: 'shadowSpread', label: '扩散', type: 'number' }, { key: 'shadowColor', label: '颜色' }],
    'upload-constraints': [{ key: 'accept', label: '文件类型' }, { key: 'maxFileSizeMb', label: '单文件上限（MB，0=不限）', type: 'number' }, { key: 'maxCount', label: '最多数量（0=不限）', type: 'number' }, { key: 'minImageWidth', label: '最小宽度', type: 'number' }, { key: 'maxImageWidth', label: '最大宽度', type: 'number' }, { key: 'minImageHeight', label: '最小高度', type: 'number' }, { key: 'maxImageHeight', label: '最大高度', type: 'number' }],
  };
  const schema = schemas[kind] || Object.keys(record).map((key) => ({ key, label: key }));
  const [spacingLinked, setSpacingLinked] = useState(() => kind !== 'spacing' || typeof value === 'number' || typeof value === 'string' || ['top', 'right', 'bottom', 'left'].every((key) => Number(record[key] || 0) === Number(record.top || 0)));
  const updateField = (key: string, next: unknown) => {
    if (kind === 'spacing' && spacingLinked) return onChange({ top: next, right: next, bottom: next, left: next });
    if (kind !== 'number-range') return onChange({ ...record, [key]: next });
    const patch = { ...record, [key]: next };
    const step = Number(patch.step);
    if (!Number.isFinite(step) || step <= 0) patch.step = 1;
    const precision = Number(patch.precision);
    if (patch.integer === true) patch.precision = 0;
    else if (Number.isFinite(precision) && precision < 0) patch.precision = 0;
    else if (Number.isFinite(step) && step > 0 && Number.isFinite(precision)) {
      const stepDigits = String(step).split('.')[1]?.length || 0;
      if (precision < stepDigits) patch.precision = stepDigits;
    }
    if (patch.positive === true && Number(patch.min) < 0) patch.min = 0;
    onChange(patch);
  };
  const first = kind === 'date-range' ? Date.parse(String(record[schema[0]?.key] || '')) : Number(record[schema[0]?.key] || 0);
  const second = kind === 'date-range' ? Date.parse(String(record[schema[1]?.key] || '')) : Number(record[schema[1]?.key] || 0);
  const rangeInvalid = ['number-range', 'date-range', 'selection-range'].includes(kind) && Number.isFinite(first) && Number.isFinite(second) && first > second;
  useEffect(() => onValidity(!rangeInvalid), [rangeInvalid, onValidity]);
  const previewStyle: React.CSSProperties | undefined = kind === 'typography' ? { fontFamily: String(record.fontFamily || 'inherit'), fontSize: Number(record.fontSize || 16), fontWeight: String(record.fontWeight || 400), color: String(record.color || '#1c1c1e'), lineHeight: Number(record.lineHeight || 1.5), letterSpacing: Number(record.letterSpacing || 0), textAlign: record.textAlign as any } : kind === 'border' ? { borderWidth: Number(record.borderWidth || 1), borderStyle: String(record.borderStyle || 'solid'), borderColor: String(record.borderColor || '#2563eb') } : kind === 'shadow' ? { boxShadow: `${Number(record.shadowX || 0)}px ${Number(record.shadowY || 4)}px ${Number(record.shadowBlur || 12)}px ${Number(record.shadowSpread || 0)}px ${String(record.shadowColor || 'rgba(15,23,42,.2)')}` } : kind === 'spacing' ? { padding: `${Number(record.top || 0)}px ${Number(record.right || 0)}px ${Number(record.bottom || 0)}px ${Number(record.left || 0)}px` } : undefined;
  const acceptOptions = [
    { label: '所有文件', value: '' }, { label: '图片', value: 'image/*' }, { label: '文档（PDF/Word）', value: '.pdf,.doc,.docx' },
    { label: '表格（Excel/CSV）', value: '.xls,.xlsx,.csv' }, { label: '自定义类型', value: String(record.accept || '') },
  ].filter((option, index, list) => list.findIndex((item) => item.value === option.value) === index);
  const binding = context?.values?.dataBinding;
  const bindingRecord = binding && typeof binding === 'object' && !Array.isArray(binding) ? binding as Record<string, unknown> : null;
  const bindingSource = bindingRecord?.source && typeof bindingRecord.source === 'object' ? bindingRecord.source as Record<string, unknown> : bindingRecord;
  const bindingSummary = kind === 'date-range' && bindingSource ? `开始字段：${String(bindingSource.startField || bindingSource.start || bindingSource.startPath || '未绑定')} · 结束字段：${String(bindingSource.endField || bindingSource.end || bindingSource.endPath || '未绑定')}` : '';
  return <div className="property-editor-stack">{kind === 'spacing' && <label className="property-link-toggle"><input type="checkbox" checked={spacingLinked} onChange={(event) => setSpacingLinked(event.target.checked)} /><span>四个方向使用相同数值</span></label>}{bindingSummary && <div className="property-impact"><b>跨字段绑定</b><span>{bindingSummary}</span></div>}<div className="property-composite-grid">{schema.map((field) => <label key={field.key}><span>{field.label}</span>{kind === 'upload-constraints' && field.key === 'accept' ? <AntdSelectInput value={String(record.accept ?? '')} options={acceptOptions} onChange={(next) => updateField(field.key, String(next))} /> : field.type === 'boolean' ? <AntdSelectInput value={record[field.key] === true ? 'true' : 'false'} options={[{ label: '否', value: 'false' }, { label: '是', value: 'true' }]} onChange={(next) => updateField(field.key, next === 'true')} /> : field.type === 'number' ? <AntdNumberInput value={record[field.key] as number ?? ''} min={kind === 'shadow' && ['shadowX', 'shadowY', 'shadowSpread'].includes(field.key) ? -100 : 0} onChange={(next) => updateField(field.key, next === '' ? 0 : Number(next))} /> : <AntdTextInput value={String(record[field.key] ?? '')} onChange={(next) => updateField(field.key, next)} />}</label>)}</div>{kind === 'number-range' && <div className="property-editor-help">步长会自动回退为 1；小数位不能低于步长精度，整数模式会禁用小数。单位沿用数字控件的前缀/后缀（仅显示），示例：步长 0.01、精度 2。</div>}{kind === 'upload-constraints' && <div className="property-editor-help">可直接选择常用类型；自定义类型请填写扩展名或 MIME 类型。</div>}{rangeInvalid && <div className="property-editor-error">下限不能大于上限</div>}<div className="property-style-preview" style={previewStyle}>实时预览 Preview 123</div></div>;
}

export function ScalarStyleVisual({ kind, value, onChange, onValidity }: { kind: 'radius' | 'opacity' | 'dimension'; value: unknown; onChange: (value: unknown) => void; onValidity: (valid: boolean) => void }) {
  const numeric = Number(value ?? (kind === 'opacity' ? 1 : 0));
  const min = 0;
  const max = kind === 'opacity' ? 1 : kind === 'radius' ? 100 : 2000;
  const valid = Number.isFinite(numeric) && numeric >= min && numeric <= max;
  useEffect(() => onValidity(valid), [valid, onValidity]);
  return <div className="property-editor-stack"><label className="property-editor-label"><span>{kind === 'radius' ? '圆角（px）' : kind === 'opacity' ? '透明度' : '尺寸'}</span><AntdNumberInput value={Number.isFinite(numeric) ? numeric : ''} min={min} max={max} step={kind === 'opacity' ? .05 : 1} onChange={(next) => onChange(next === '' ? 0 : Number(next))} /></label><input className="property-style-range" type="range" min={min} max={max} step={kind === 'opacity' ? .05 : 1} value={Number.isFinite(numeric) ? numeric : min} onChange={(event) => onChange(Number(event.target.value))} /><div className="property-style-preview" style={{ borderRadius: kind === 'radius' ? numeric : 10, opacity: kind === 'opacity' ? numeric : 1, width: kind === 'dimension' ? Math.min(numeric, 480) : undefined }}>实时预览 Preview 123</div>{!valid && <div className="property-editor-error">请输入 {min} 到 {max} 之间的数值</div>}</div>;
}
