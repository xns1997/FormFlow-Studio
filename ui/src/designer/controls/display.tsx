import React, { useMemo, useState } from 'react';
import { registerControl } from '../registry';
import type { DesignComponent } from '../../project/types';
import { controlText, ios } from './styles';
import ChartWidget, { normalizeChartInput, sanitizeChartSchema } from '../../components/ChartWidget';
import AnimatedNumber from '../../components/AnimatedNumber';
import type { MetricConfig } from '../../components/ChartWidget';
import { resolveRange } from '../../services/data/rangeResolver';
import { useProjectStore } from '../../project/store';
import { DesignerIcon } from '../icons';
import type { PreviewControlRuntime } from '../types';
import { normalizeDataBinding } from '../../services/data/dataBinding';
import EditableTableGrid, { type TableChangeTracking } from '../../components/EditableTableGrid';

function hasDynamicValueSource(component: DesignComponent) {
  return Boolean(component.props.name || component.fieldBinding || normalizeDataBinding(component));
}

registerControl({
  type: 'text', label: '文本', category: 'display', icon: '📄',
  defaultProps: {
    content: '文本内容', contentTemplate: '', name: '',
    fontSize: 15, fontWeight: 'normal', fontFamily: '', color: '#1c1c1e',
    textAlign: 'left', letterSpacing: 0, lineHeight: 1.5, textDecoration: 'none',
    rangeRef: null,
  },
  propSchema: [
    { key: 'content', label: '内容', type: 'string', group: '基础' },
    { key: 'contentTemplate', label: '动态内容模板', type: 'string', editor: 'template', group: '表达式', help: '使用 {{form.字段名}} 插值并实时预览。' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', level: 'advanced', placeholder: 'field_name' },
    { kind: 'composite', key: 'typography', keys: ['fontFamily', 'fontSize', 'fontWeight', 'color', 'lineHeight', 'letterSpacing', 'textAlign'], label: '字体与排版', editor: 'typography', group: '文本样式' },
    { key: 'textDecoration', label: '装饰', type: 'select', group: '文本样式', options: [
      { label: '无', value: 'none' }, { label: '下划线', value: 'underline' },
      { label: '删除线', value: 'line-through' }, { label: '上划线', value: 'overline' },
    ]},
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [],
  defaultSize: { w: 180, h: 36 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const previewValue = mode === 'preview' && hasDynamicValueSource(component) ? runtime?.value : undefined;
    const template = String(component.props.contentTemplate || '').trim();
    const templated = template && mode !== 'design'
      ? template.replace(/{{\s*(?:form\.)?([^}\s]+)\s*}}/g, (_match, field) => String(runtime?.values?.[field] ?? ''))
      : '';
    const content = templated || previewValue || component.props.content || '文本';
    return (
      <div style={{ width: '100%', height: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 2px', boxSizing: 'border-box', overflow: 'hidden' }}>
        {mode === 'design' && template && component.props.content && <small role="status" style={{ color: '#b45309', fontSize: 10 }}>已配置动态模板：预览/运行时优先显示模板内容</small>}
        <span style={controlText({
          fontSize: component.props.fontSize || 15,
          fontWeight: component.props.fontWeight || 'normal',
          fontFamily: component.props.fontFamily || undefined,
          color: component.props.color || '#1c1c1e',
          textAlign: component.props.textAlign || 'left',
          letterSpacing: component.props.letterSpacing || 0,
          lineHeight: component.props.lineHeight || 1.5,
          textDecoration: component.props.textDecoration || 'none',
        })}>
          {String(content)}
        </span>
      </div>
    );
  },
});

registerControl({
  type: 'image', label: '图片', category: 'display', icon: '🖼️',
  defaultProps: {
    src: '', alt: '图片', name: '', fit: 'cover', borderRadius: 0, opacity: 1,
    rangeRef: null,
  },
  propSchema: [
    { key: 'src', label: '图片地址', type: 'string', editor: 'url', group: '基础', placeholder: '粘贴图片链接（https://…）', help: '可使用公开图片链接；加载失败时运行态会保留说明。' },
    { key: 'alt', label: '图片说明（无障碍）', type: 'string', group: '基础', placeholder: '如：2025 年销售趋势图', help: '简短描述图片内容；装饰图片可留空。' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', level: 'advanced', placeholder: 'field_name' },
    { key: 'fit', label: '填充方式', type: 'select', group: '样式', options: [
      { label: '覆盖', value: 'cover' }, { label: '包含', value: 'contain' },
      { label: '拉伸', value: 'fill' }, { label: '适应', value: 'scale-down' },
    ]},
    { key: 'borderRadius', label: '圆角', type: 'number', editor: 'radius', group: '样式', min: 0, max: 100 },
    { key: 'opacity', label: '透明度', type: 'number', editor: 'opacity', group: '样式', min: 0, max: 1, step: 0.1 },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onClick', label: '点击', description: '点击图片时触发' }],
  defaultSize: { w: 240, h: 160 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const previewValue = mode === 'preview' && hasDynamicValueSource(component) ? runtime?.value : undefined;
    const resolvedSrc = typeof previewValue === 'string' && previewValue ? previewValue : component.props.src;
    return (
      <div role={mode === 'preview' ? 'button' : undefined} aria-label={mode === 'preview' ? String(component.props.alt || '图片') : undefined} tabIndex={mode === 'preview' ? 0 : -1} onClick={() => mode === 'preview' && runtime?.emit('onClick', resolvedSrc)} onKeyDown={(event) => { if (mode === 'preview' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); runtime?.emit('onClick', resolvedSrc); } }} style={{ ...ios.glass, cursor: mode === 'preview' ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(118,118,128,0.08)', borderRadius: component.props.borderRadius || 0 }}>
        {resolvedSrc ? (
          <img src={resolvedSrc} alt={component.props.alt || ''} onError={(event) => { event.currentTarget.style.display = 'none'; const parent = event.currentTarget.parentElement; if (parent && !parent.querySelector('[data-image-error]')) { const note = document.createElement('span'); note.dataset.imageError = 'true'; note.textContent = '图片加载失败，请检查链接'; note.setAttribute('role', 'status'); note.style.cssText = 'font-size:12px;color:#d70015;padding:8px;text-align:center'; parent.appendChild(note); } }} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: component.props.fit || 'cover', borderRadius: component.props.borderRadius || 0, opacity: component.props.opacity ?? 1 }} />
        ) : (
          <span style={{ fontSize: 24, opacity: 0.2 }}><DesignerIcon name="image" size={24} /></span>
        )}
      </div>
    );
  },
});

registerControl({
  type: 'animatedNumber', label: '跳动数字', category: 'display', icon: '🔢',
  defaultProps: {
    content: '0', name: '',
    fontSize: 32, fontWeight: 'bold', fontFamily: '', color: '#2563eb',
    textAlign: 'left', letterSpacing: 0, lineHeight: 1.2, textDecoration: 'none',
    duration: 1200, decimals: 0, prefix: '', suffix: '', useGrouping: true,
    rangeRef: null,
  },
  propSchema: [
    { key: 'content', label: '默认值', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', level: 'advanced', placeholder: 'field_name' },
    { key: 'duration', label: '动画时长(ms)', type: 'number', group: '动画', min: 0, max: 6000, step: 100 },
    { key: 'decimals', label: '小数位', type: 'number', group: '动画', min: 0, max: 6 },
    { key: 'prefix', label: '前缀', type: 'string', group: '格式' },
    { key: 'suffix', label: '后缀', type: 'string', group: '格式' },
    { key: 'useGrouping', label: '千分位', type: 'boolean', group: '格式' },
    { key: 'fontSize', label: '字号', type: 'number', group: '文本样式', min: 8, max: 72 },
    { key: 'fontWeight', label: '字重', type: 'select', group: '文本样式', options: [
      { label: '细体', value: '300' }, { label: '常规', value: 'normal' }, { label: '中等', value: '500' },
      { label: '半粗', value: '600' }, { label: '粗体', value: 'bold' },
    ]},
    { key: 'fontFamily', label: '字体', type: 'select', group: '文本样式', options: [
      { label: '系统默认', value: '' }, { label: '等宽字体', value: 'monospace' },
      { label: '衬线体', value: 'Georgia, serif' }, { label: '无衬线', value: 'Helvetica, sans-serif' },
    ]},
    { key: 'color', label: '颜色', type: 'color', group: '文本样式' },
    { key: 'textAlign', label: '对齐', type: 'select', group: '文本样式', options: [
      { label: '左对齐', value: 'left' }, { label: '居中', value: 'center' }, { label: '右对齐', value: 'right' },
    ]},
    { key: 'letterSpacing', label: '字间距', type: 'number', group: '文本样式', min: -2, max: 10, step: 0.5 },
    { key: 'lineHeight', label: '行高', type: 'number', group: '文本样式', min: 1, max: 3, step: 0.1 },
    { key: 'textDecoration', label: '装饰', type: 'select', group: '文本样式', options: [
      { label: '无', value: 'none' }, { label: '下划线', value: 'underline' },
      { label: '删除线', value: 'line-through' }, { label: '上划线', value: 'overline' },
    ]},
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [],
  defaultSize: { w: 200, h: 44 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    const previewValue = mode === 'preview' && hasDynamicValueSource(component) ? runtime?.value : undefined;
    const content = previewValue == null || previewValue === '' ? (component.props.content ?? '0') : previewValue;
    const textStyle = controlText({
      fontSize: component.props.fontSize || 32,
      fontWeight: component.props.fontWeight || 'bold',
      fontFamily: component.props.fontFamily || undefined,
      color: component.props.color || '#2563eb',
      textAlign: component.props.textAlign || 'left',
      letterSpacing: component.props.letterSpacing || 0,
      lineHeight: component.props.lineHeight || 1.2,
      textDecoration: component.props.textDecoration || 'none',
    });
    return (
      <div style={{ width: '100%', height: '100%', minWidth: 0, display: 'flex', alignItems: 'center', padding: '0 2px', boxSizing: 'border-box', overflow: 'hidden' }}>
        <AnimatedNumber
          value={content}
          duration={Number(component.props.duration) || 1200}
          decimals={Number(component.props.decimals) || 0}
          prefix={String(component.props.prefix ?? '')}
          suffix={String(component.props.suffix ?? '')}
          useGrouping={component.props.useGrouping !== false}
          style={textStyle}
        />
      </div>
    );
  },
});

registerControl({
  type: 'table', label: '数据表格', category: 'display', icon: '📊',
  defaultProps: {
    columns: ['名称', '类型', '状态'], rows: 3, name: '',
    editable: false, addable: false, removable: false, rowKey: '', changeTracking: 'fullRows',
    loading: false, emptyText: '暂无记录',
    headerBackground: 'rgba(118,118,128,0.06)', headerColor: '#8e8e93', headerFontWeight: '600',
    cellColor: '#3a3a3c', showGrid: true, striped: true,
    rangeRef: null,
  },
  propSchema: [
    { key: 'columns', label: '表格列', type: 'json', editor: 'table-columns', group: '数据' },
    { key: 'rows', label: '行数', type: 'number', group: '数据', min: 1, max: 50 },
    { key: 'loading', label: '加载中', type: 'boolean', group: '数据', help: '预览加载态时显示明确进度，不用空白占位。' },
    { key: 'emptyText', label: '空表提示', type: 'string', group: '数据', placeholder: '暂无记录' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '数据', level: 'advanced', placeholder: 'field_name' },
    { key: 'editable', label: '允许编辑', type: 'boolean', group: '编辑', help: '开启后需提供可写的行主键，便于保存和冲突定位。' },
    { key: 'addable', label: '允许新增行', type: 'boolean', group: '编辑', visibleWhen: { key: 'editable', operator: 'truthy' }, help: '新增行仍需通过数据源权限检查。' },
    { key: 'removable', label: '允许删除行', type: 'boolean', group: '编辑', visibleWhen: { key: 'editable', operator: 'truthy' }, help: '删除前运行态会要求确认并记录变更。' },
    { key: 'rowKey', label: '行主键字段', type: 'string', editor: 'field-path', group: '编辑', visibleWhen: { key: 'editable', operator: 'truthy' }, help: '没有稳定主键时请关闭编辑，避免无法定位冲突。' },
    { key: 'changeTracking', label: '值输出方式', type: 'select', group: '编辑', visibleWhen: { key: 'editable', operator: 'truthy' }, options: [
      { label: '完整行数据', value: 'fullRows' }, { label: '仅修改行', value: 'dirtyRows' },
    ] },
    { key: 'headerBackground', label: '表头背景', type: 'color', group: '样式' },
    { key: 'headerColor', label: '表头文字颜色', type: 'color', group: '样式' },
    { key: 'headerFontWeight', label: '表头字重', type: 'select', group: '样式', options: [
      { label: '常规', value: '400' }, { label: '中等', value: '500' }, { label: '粗体', value: '600' },
    ]},
    { key: 'cellColor', label: '单元格文字颜色', type: 'color', group: '样式' },
    { key: 'showGrid', label: '显示网格线', type: 'boolean', group: '样式' },
    { key: 'striped', label: '斑马纹', type: 'boolean', group: '样式' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [
    { key: 'onRowClick', label: '行点击', description: '点击表格行时触发' },
    { key: 'onChange', label: '数据变化', description: '可编辑表格的单元格、行新增或删除时触发' },
  ],
  defaultSize: { w: 560, h: 240 },
  render: ({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) => {
    return (
      <div style={{ ...ios.glass, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <EditableTableGrid
          label={String(component.props.label || '')}
          columns={component.props.columns}
          data={component.props.data}
          value={runtime?.value}
          editable={(mode === 'preview' || mode === 'runtime') && component.props.editable === true}
          disabled={!!component.props.disabled}
          addable={component.props.addable === true}
          removable={component.props.removable === true}
          rowKey={String(component.props.rowKey || '') || undefined}
          changeTracking={(component.props.changeTracking as TableChangeTracking) || 'fullRows'}
          placeholderRows={Math.max(1, Number(component.props.rows) || 3)}
          loading={component.props.loading === true}
          emptyText={String(component.props.emptyText || '暂无记录')}
          showGrid={component.props.showGrid !== false}
          striped={component.props.striped !== false}
          headerBackground={component.props.headerBackground}
          headerColor={component.props.headerColor}
          headerFontWeight={component.props.headerFontWeight}
          cellColor={component.props.cellColor}
          onChange={(rows, detail) => runtime?.emit('onChange', rows, detail)}
          onRowClick={(rowIndex, row) => mode === 'preview' && runtime?.emit('onRowClick', rowIndex, { rowIndex, row })}
        />
      </div>
    );
  },
});

// ── 维度/指标自动推断 ─────────────────────────────────────

function inferDimMetrics(headers: string[], data: unknown[][]): { dims: number[]; mets: MetricConfig[] } {
  if (!data.length || !headers.length) return { dims: [], mets: [] };

  const dims: number[] = [];
  const mets: MetricConfig[] = [];

  for (let c = 0; c < headers.length; c++) {
    const values = data.map(row => row[c]).filter(v => v !== null && v !== undefined && v !== '');
    if (values.length === 0) {
      dims.push(c);
      continue;
    }
    const numericCount = values.filter(v => !isNaN(Number(v))).length;
    const ratio = numericCount / values.length;
    if (ratio >= 0.8) {
      mets.push({ col: c, agg: 'sum' });
    } else {
      dims.push(c);
    }
  }

  // 至少保留一个维度
  if (dims.length === 0 && mets.length > 1) {
    const first = mets.shift()!;
    dims.push(first.col);
  }

  return { dims, mets };
}

function detectChartInputKind(value: unknown) {
  if (value == null || value === '') return 'empty';
  if (Array.isArray(value)) {
    if (value.every((row) => Array.isArray(row))) return 'matrix';
    if (value.every((row) => row && typeof row === 'object' && !Array.isArray(row))) return 'object-rows';
    return 'array';
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.labels) && Array.isArray(record.datasets)) return 'chart-data';
    return 'object';
  }
  return typeof value;
}

function toChartDebugPreview(headers: string[] | null, rawData: unknown[][] | null, limit = 4) {
  if (!headers || !rawData) return [];
  return rawData.slice(0, limit).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

function stopScrollPropagation(event: React.UIEvent<HTMLElement> | React.WheelEvent<HTMLElement>) {
  event.stopPropagation();
}

// ── 图表控件注册 ──────────────────────────────────────────

registerControl({
  type: 'chart', label: '图表', category: 'display', icon: '📈',
  defaultProps: {
    chartType: 'bar', title: '图表标题', name: '',
    barColor: '#007aff', lineColor: '#ff9500', showLegend: false, showValues: false,
    chartData: null,
    dimensions: null,
    metrics: null,
    filterField: '', filterValue: '',
    filters: [],
    rangeRef: null,
    _autoInferred: false,
  },
  propSchema: [
    { key: 'chartType', label: '图表类型', type: 'select', group: '基础', options: [
      { label: '柱状图', value: 'bar' }, { label: '折线图', value: 'line' }, { label: '饼图', value: 'pie' },
      { label: '环形图', value: 'doughnut' }, { label: '面积图', value: 'area' },
    ]},
    { key: 'title', label: '标题', type: 'string', group: '基础' },
    { key: 'name', label: '字段名', type: 'string', editor: 'field-path', group: '基础', level: 'advanced', placeholder: 'field_name' },
    { key: 'chartData', label: '自定义数据 (JSON)', type: 'json', group: '数据' },
    { key: '__dimMetric', label: '维度与指标', type: 'dimMetric' as any, group: '维度/指标', help: '选择图表使用的分类字段和数值字段。' },
    { key: 'filterField', label: '筛选字段', type: 'string', editor: 'field-path', group: '维度/指标', placeholder: '可选；如：状态', help: '只显示满足筛选值的记录，留空表示全部。' },
    { key: 'filterValue', label: '筛选值', type: 'string', group: '维度/指标', placeholder: '如：已完成', visibleWhen: { key: 'filterField', operator: 'truthy' } },
    { key: 'filters', label: '多条件筛选', type: 'array', editor: 'filters', group: '维度/指标', help: '可添加多个条件；字段类型不兼容时会在应用前提示。' },
    { key: 'barColor', label: '主色', type: 'color', group: '样式' },
    { key: 'lineColor', label: '辅色', type: 'color', group: '样式' },
    { key: 'showLegend', label: '显示图例', type: 'boolean', group: '样式' },
    { key: 'showValues', label: '显示数值', type: 'boolean', group: '样式' },
    { key: 'dataBinding', label: '数据绑定', type: 'object', editor: 'data-binding', group: '数据源' },
  ],
  eventSchema: [{ key: 'onClick', label: '点击', description: '点击图表时触发' }],
  defaultSize: { w: 360, h: 220 },
  render: ChartRender,
});

function ChartRender({ component, mode, runtime }: { component: DesignComponent; mode?: string; runtime?: PreviewControlRuntime }) {
  const [debugOpen, setDebugOpen] = useState(false);
  const tables = useProjectStore((s) => s.project?.srcTable || []);
  const binding = normalizeDataBinding(component);
  const rangeRef = binding?.source.kind === 'range' ? binding.source.ref : component.props.rangeRef;
  const runtimeChartInput = useMemo(() => normalizeChartInput(runtime?.value), [runtime?.value]);

  // 稳定化 resolved 数据引用
  const resolved = useMemo(
    () => rangeRef ? resolveRange(rangeRef, tables) : null,
    [rangeRef?.tableId, rangeRef?.sheetName, rangeRef?.startRow, rangeRef?.startCol, rangeRef?.endRow, rangeRef?.endCol, rangeRef?.firstRowIsHeader, tables]
  );

  const headers = useMemo(() => runtimeChartInput?.headers ?? resolved?.headers ?? null, [runtimeChartInput, resolved]);
  const rawData = useMemo(() => {
    const source = runtimeChartInput?.rawData ?? resolved?.data ?? null;
    const field = String(component.props.filterField || '').trim();
    const expected = String(component.props.filterValue ?? '');
    const configured = Array.isArray(component.props.filters) ? component.props.filters as Array<Record<string, unknown>> : [];
    const filters = [...(field ? [{ field, operator: 'eq', value: expected }] : []), ...configured].filter((item) => String(item.field || '').trim());
    if (!filters.length || !Array.isArray(source) || !headers) return source;
    const conditions = filters.map((item) => ({ ...item, index: headers.findIndex((header) => String(header) === String(item.field)) })).filter((item) => item.index >= 0) as Array<Record<string, unknown> & { index: number }>;
    if (conditions.length !== filters.length) return [];
    return source.filter((row) => conditions.every((condition) => {
      const actual = String(row[condition.index] ?? ''); const expectedValue = String(condition.value ?? '');
      if (condition.operator === 'contains') return actual.includes(expectedValue);
      if (condition.operator === 'ne') return actual !== expectedValue;
      return actual === expectedValue;
    }));
  }, [runtimeChartInput, resolved, component.props.filterField, component.props.filterValue, component.props.filters, headers]);

  // 稳定化维度/指标引用
  const userDims = component.props.dimensions as number[] | null | undefined;
  const userMets = component.props.metrics as MetricConfig[] | null | undefined;
  const sanitizedSchema = useMemo(() => sanitizeChartSchema(headers ?? undefined, userDims, userMets), [headers, userDims, userMets]);
  const hasManualConfig = sanitizedSchema.valid;
  const chartInputKind = useMemo(() => detectChartInputKind(runtime?.value), [runtime?.value]);
  const debugPreviewRows = useMemo(() => toChartDebugPreview(headers ?? null, rawData ?? null), [headers, rawData]);
  const filterInvalid = useMemo(() => {
    const configured = Array.isArray(component.props.filters) ? component.props.filters as Array<Record<string, unknown>> : [];
    return configured.map((item) => String(item.field || '').trim()).filter(Boolean).filter((field) => !headers?.some((header) => String(header) === field));
  }, [component.props.filters, headers]);
  const chartInputSource = runtimeChartInput
    ? '运行时值'
    : component.props.chartData
      ? '静态 JSON'
      : resolved
        ? '数据范围'
        : '默认示例';

  // 自动推断（仅在无手动配置时）
  const inferred = useMemo(() => {
    if (!headers || !rawData || hasManualConfig) return null;
    return inferDimMetrics(headers, rawData);
  }, [headers, rawData, hasManualConfig]);

  const dimsArr = useMemo(() => {
    if (hasManualConfig && Array.isArray(sanitizedSchema.dimensions)) return sanitizedSchema.dimensions;
    return inferred?.dims ?? [];
  }, [hasManualConfig, sanitizedSchema, inferred]);

  const metsArr: MetricConfig[] = useMemo(() => {
    if (hasManualConfig && Array.isArray(sanitizedSchema.metrics)) return sanitizedSchema.metrics;
    return inferred?.mets ?? [];
  }, [hasManualConfig, sanitizedSchema, inferred]);

  return (
    <div role={mode === 'preview' ? 'button' : undefined} aria-label={mode === 'preview' ? String(component.props.title || '图表') : undefined} tabIndex={mode === 'preview' ? 0 : -1} onClick={() => mode === 'preview' && runtime?.emit('onClick')} onKeyDown={(event) => { if (mode === 'preview' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); runtime?.emit('onClick'); } }} style={{ ...ios.glass, cursor: mode === 'preview' ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <div style={{ padding: '10px 14px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 650, color: '#1c1c1e' }}>{component.props.title || '图表'}</span>
          {mode === 'preview' && (
            <button
              type="button"
              className="ui-btn ui-btn-xs"
              style={{ minWidth: 60 }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDebugOpen((current) => !current);
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {debugOpen ? '收起调试' : '调试数据'}
            </button>
          )}
        </div>
        {headers && dimsArr.length > 0 && metsArr.length > 0 && (
          <span style={{ fontSize: 10, color: '#8e8e93', marginLeft: 8 }}>
            维度:{dimsArr.map(d => headers[d] || `C${d}`).join(', ')}
            {' · '}指标:{metsArr.map(m => `${headers[m.col] || `C${m.col}`}(${m.agg})`).join(', ')}
            {!hasManualConfig && <em style={{ fontStyle: 'normal', color: '#34c759', marginLeft: 4 }}>自动</em>}
          </span>
        )}
        {filterInvalid.length > 0 && <div role="alert" style={{ marginTop: 6, color: '#b42318', fontSize: 11 }}>筛选字段不存在：{filterInvalid.join('、')}。请回到筛选向导重新选择。</div>}
      </div>
      {mode === 'preview' && debugOpen && (
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onWheel={stopScrollPropagation}
          onScroll={stopScrollPropagation}
          onTouchMove={(event) => event.stopPropagation()}
          style={{
            margin: '8px 14px 0',
            padding: 10,
            borderRadius: 12,
            border: '1px solid rgba(37,99,235,0.16)',
            background: 'rgba(248,250,252,0.92)',
            display: 'grid',
            gap: 8,
            fontSize: 11,
            color: '#334155',
            maxHeight: 220,
            overflowY: 'auto',
            overflowX: 'hidden',
            overscrollBehavior: 'contain',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
            <span>来源：{chartInputSource}</span>
            <span>入参类型：{chartInputKind}</span>
            <span>Headers：{headers?.length || 0}</span>
            <span>Rows：{rawData?.length || 0}</span>
            <span>Schema：{hasManualConfig ? '手动配置' : inferred ? '自动推断' : '未启用'}</span>
            <span>手动配置状态：{sanitizedSchema.valid ? '有效' : (userDims?.length || userMets?.length) ? '已失效并回退' : '未配置'}</span>
          </div>
          {headers?.length ? (
            <div>
              <strong style={{ fontSize: 11, color: '#0f172a' }}>字段</strong>
              <div style={{ marginTop: 4, color: '#475569', wordBreak: 'break-all' }}>{headers.join(' · ')}</div>
            </div>
          ) : null}
          {debugPreviewRows.length > 0 ? (
            <div>
              <strong style={{ fontSize: 11, color: '#0f172a' }}>归一化样本</strong>
              <pre style={{ margin: '4px 0 0', padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(148,163,184,0.16)', maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(debugPreviewRows, null, 2)}
              </pre>
            </div>
          ) : null}
          {runtime?.value !== undefined ? (
            <div>
              <strong style={{ fontSize: 11, color: '#0f172a' }}>原始传入值</strong>
              <pre style={{ margin: '4px 0 0', padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(148,163,184,0.16)', maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(runtime.value, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, padding: '6px 10px 10px' }}>
        <ChartWidget
          chartType={component.props.chartType || 'bar'}
          title=""
          data={runtimeChartInput?.data || component.props.chartData || undefined}
          rawData={rawData ?? undefined}
          headers={headers ?? undefined}
          dimensions={dimsArr.length > 0 ? dimsArr : undefined}
          metrics={metsArr.length > 0 ? metsArr : undefined}
          barColor={component.props.barColor || '#007aff'}
          lineColor={component.props.lineColor || '#ff9500'}
          showLegend={component.props.showLegend}
          showValues={component.props.showValues}
        />
      </div>
    </div>
  );
}
