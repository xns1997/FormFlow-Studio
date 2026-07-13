import React, { useMemo, useState } from 'react';
import type { ComponentNode } from '../models';
import FormRenderer from './FormRenderer';
import type { DesignComponent } from '../project/types';
import { exportToComponentNodes } from '../designer/export';

interface PlaygroundSeed {
  component: DesignComponent;
  values: Record<string, unknown>;
}

const SAMPLE_IMAGE = "data:image/svg+xml;utf8," + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#dbeafe"/>
        <stop offset="100%" stop-color="#bfdbfe"/>
      </linearGradient>
    </defs>
    <rect width="640" height="320" rx="24" fill="url(#g)"/>
    <circle cx="132" cy="108" r="42" fill="#60a5fa" opacity="0.7"/>
    <path d="M0 260 C120 200 180 300 300 250 C430 198 486 260 640 210 L640 320 L0 320 Z" fill="#2563eb" opacity="0.28"/>
    <text x="52" y="86" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#0f172a">FormFlow Playground</text>
    <text x="52" y="126" font-family="Arial, sans-serif" font-size="18" fill="#334155">文档里的实时组件实验区</text>
  </svg>
`);

function buildSeed(type: string): PlaygroundSeed {
  const base: DesignComponent = {
    id: `doc_playground_${type}`,
    type,
    x: 0,
    y: 0,
    width: 420,
    height: 72,
    fieldBinding: `${type}_value`,
    props: {
      name: `${type}_value`,
      label: '示例字段',
      placeholder: '在这里体验组件',
    },
  };

  switch (type) {
    case 'input':
      return { component: base, values: { input_value: '上海餐饮示例' } };
    case 'textarea':
      return { component: { ...base, height: 132, props: { ...base.props, rows: 4, placeholder: '支持多行输入的说明文本' } }, values: { textarea_value: '这是一段可直接编辑的多行示例内容。' } };
    case 'number':
      return { component: { ...base, props: { ...base.props, min: 0, max: 10000, step: 10 } }, values: { number_value: 256 } };
    case 'datePicker':
      return { component: { ...base, props: { ...base.props, format: 'YYYY-MM-DD' } }, values: { datePicker_value: '2026-07-09' } };
    case 'timePicker':
      return { component: { ...base, props: { ...base.props, showSeconds: true } }, values: { timePicker_value: '14:30:15' } };
    case 'dateRange':
      return { component: { ...base, height: 72, props: { ...base.props, startPlaceholder: '开始日期', endPlaceholder: '结束日期' } }, values: { dateRange_value: { start: '2026-07-01', end: '2026-07-09' } } };
    case 'switch':
      return { component: { ...base, props: { ...base.props, label: '是否启用示例' } }, values: { switch_value: true } };
    case 'rating':
      return { component: { ...base, props: { ...base.props, max: 5 } }, values: { rating_value: 4 } };
    case 'tagInput':
      return { component: base, values: { tagInput_value: ['上海', '餐饮', '分析'] } };
    case 'upload':
      return { component: base, values: { upload_value: [{ name: '需求说明.pdf', size: 18240, type: 'application/pdf' }] } };
    case 'imageUpload':
      return { component: base, values: { imageUpload_value: [{ name: 'cover.png', size: 9812, type: 'image/png', url: SAMPLE_IMAGE }] } };
    case 'button':
      return {
        component: {
          ...base,
          fieldBinding: undefined,
          props: { ...base.props, name: 'doc_button', label: '点击体验', variant: 'primary' },
        },
        values: {},
      };
    case 'select':
      return {
        component: {
          ...base,
          props: {
            ...base.props,
            options: [
              { label: '黄浦区', value: '黄浦区' },
              { label: '徐汇区', value: '徐汇区' },
              { label: '浦东新区', value: '浦东新区' },
            ],
          },
        },
        values: { select_value: '黄浦区' },
      };
    case 'segmented':
      return {
        component: {
          ...base,
          props: {
            ...base.props,
            options: [
              { label: '日报', value: 'day' },
              { label: '周报', value: 'week' },
              { label: '月报', value: 'month' },
            ],
          },
        },
        values: { segmented_value: 'week' },
      };
    case 'radio':
      return {
        component: {
          ...base,
          height: 96,
          props: { ...base.props, direction: 'horizontal', options: [{ label: '堂食', value: 'eat-in' }, { label: '外卖', value: 'delivery' }] },
        },
        values: { radio_value: 'delivery' },
      };
    case 'checkbox':
      return {
        component: {
          ...base,
          height: 104,
          props: { ...base.props, options: [{ label: '甜品', value: 'dessert' }, { label: '咖啡', value: 'coffee' }, { label: '简餐', value: 'meal' }] },
        },
        values: { checkbox_value: ['dessert', 'coffee'] },
      };
    case 'form':
      return {
        component: {
          ...base,
          type: 'form',
          fieldBinding: undefined,
          height: 120,
          props: { title: '订单录入', subtitle: '这是一个顶层表单容器的示意预览' },
        },
        values: {},
      };
    case 'container':
    case 'card':
      return {
        component: {
          ...base,
          type,
          fieldBinding: undefined,
          height: 120,
          props: { title: type === 'card' ? '营业表现卡片' : '信息分组容器', subtitle: '用于组织相关控件或展示块' },
        },
        values: {},
      };
    case 'tabs':
      return {
        component: {
          ...base,
          fieldBinding: 'tabs_value',
          props: { ...base.props, tabs: ['基础信息', '经营分析', '附件'] },
        },
        values: { tabs_value: 1 },
      };
    case 'steps':
      return {
        component: {
          ...base,
          fieldBinding: 'steps_value',
          props: { ...base.props, steps: ['选择数据', '配置流程', '运行验证'] },
        },
        values: { steps_value: 2 },
      };
    case 'divider':
      return {
        component: {
          ...base,
          type: 'divider',
          fieldBinding: undefined,
          height: 20,
          props: { orientation: 'horizontal', color: '#cbd5e1', thickness: 1, margin: 8 },
        },
        values: {},
      };
    case 'text':
      return {
        component: {
          ...base,
          fieldBinding: undefined,
          height: 48,
          props: { content: '静态文本示例', fontSize: 28, fontWeight: 'bold', color: '#0f172a' },
        },
        values: {},
      };
    case 'image':
      return {
        component: {
          ...base,
          fieldBinding: undefined,
          height: 220,
          props: { src: SAMPLE_IMAGE, alt: '示例图片', fit: 'cover', borderRadius: 20 },
        },
        values: {},
      };
    case 'table':
      return {
        component: {
          ...base,
          fieldBinding: 'table_value',
          height: 220,
          props: {
            columns: ['门店', '营收', '状态'],
            rows: 3,
          },
        },
        values: {
          table_value: [
            { 门店: '南京东路店', 营收: 128000, 状态: '营业中' },
            { 门店: '徐家汇店', 营收: 98000, 状态: '备货中' },
            { 门店: '陆家嘴店', 营收: 143000, 状态: '营业中' },
          ],
        },
      };
    case 'chart':
      return {
        component: {
          ...base,
          type: 'chart',
          fieldBinding: undefined,
          height: 280,
          props: {
            title: '月度营收趋势',
            chartType: 'bar',
            chartData: {
              labels: ['1月', '2月', '3月', '4月'],
              datasets: [
                {
                  label: '营收',
                  data: [82, 96, 91, 118],
                  backgroundColor: '#2563eb',
                  borderColor: '#1d4ed8',
                },
              ],
            },
            showLegend: true,
            showValues: false,
          },
        },
        values: {},
      };
    default:
      return { component: base, values: { [`${type}_value`]: '' } };
  }
}

function safeParseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function getParseError(text: string): string | null {
  try {
    JSON.parse(text);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'JSON 解析失败';
  }
}

export default function ComponentDocPlayground({
  componentType,
  title,
  variant = 'page',
}: {
  componentType: string;
  title: string;
  variant?: 'page' | 'modal';
}) {
  const seed = useMemo(() => buildSeed(componentType), [componentType]);
  const [propsText, setPropsText] = useState(() => JSON.stringify(seed.component.props, null, 2));
  const [valuesText, setValuesText] = useState(() => JSON.stringify(seed.values, null, 2));
  const propsError = useMemo(() => getParseError(propsText), [propsText]);
  const valuesError = useMemo(() => getParseError(valuesText), [valuesText]);
  const isModal = variant === 'modal';

  const component = useMemo<DesignComponent>(() => ({
    ...seed.component,
    props: safeParseJson<Record<string, unknown>>(propsText, seed.component.props),
  }), [propsText, seed.component]);

  const [values, setValues] = useState<Record<string, unknown>>(seed.values);
  const parsedValues = useMemo(() => safeParseJson<Record<string, unknown>>(valuesText, values), [valuesText, values]);
  const componentNode = useMemo<ComponentNode>(() => exportToComponentNodes([component])[0], [component]);

  const syncValuesFromEditor = () => setValues(parsedValues);
  const resetAll = () => {
    setPropsText(JSON.stringify(seed.component.props, null, 2));
    setValuesText(JSON.stringify(seed.values, null, 2));
    setValues(seed.values);
  };

  return (
    <section id="section-playground" className={`docs-section docs-playground ${isModal ? 'docs-playground--modal' : ''}`}>
      <div className="docs-playground-hero">
        <div>
          <div className="docs-playground-kicker">在线试玩</div>
          <h3>{title} Playground</h3>
          <p className="docs-lead">左侧直接操作组件，右侧可修改 props / values JSON，快速验证控件行为、默认值和展示效果。</p>
        </div>
        <div className="docs-playground-badges">
          <span className="docs-playground-badge">实时预览</span>
          <span className="docs-playground-badge">JSON 可编辑</span>
          <span className="docs-playground-badge">支持 Modal</span>
        </div>
      </div>

      <div className={`docs-playground-grid ${isModal ? 'docs-playground-grid--modal' : ''}`}>
        <div className="docs-playground-preview">
          <div className="docs-playground-preview-toolbar">
            <strong>组件预览</strong>
            <span>{componentType}</span>
          </div>
          <FormRenderer
            components={[componentNode]}
            values={values}
            originalValues={seed.values}
            componentStates={{}}
            errors={{}}
            onChange={(field, value) => {
              setValues((current) => ({ ...current, [field]: value }));
              setValuesText((currentText) => {
                const currentValues = safeParseJson<Record<string, unknown>>(currentText, values);
                return JSON.stringify({ ...currentValues, [field]: value }, null, 2);
              });
            }}
            onButtonClick={(buttonName) => {
              setValues((current) => ({ ...current, __lastButtonClick: buttonName }));
              setValuesText((currentText) => {
                const currentValues = safeParseJson<Record<string, unknown>>(currentText, values);
                return JSON.stringify({ ...currentValues, __lastButtonClick: buttonName }, null, 2);
              });
            }}
            layout="card"
          />
        </div>

        <div className="docs-playground-panels">
          <div className="docs-card docs-playground-card">
            <div className="docs-card-title docs-playground-card-title">
              <strong>Props JSON</strong>
              {propsError ? <span className="docs-playground-error-badge">JSON 有误</span> : <span className="docs-playground-ok-badge">已生效</span>}
            </div>
            <textarea
              value={propsText}
              onChange={(event) => setPropsText(event.target.value)}
              spellCheck={false}
              className="docs-playground-editor"
              style={{ minHeight: isModal ? 180 : 220 }}
            />
            {propsError && <div className="docs-playground-error-text">{propsError}</div>}
          </div>

          <div className="docs-card docs-playground-card">
            <div className="docs-card-title docs-playground-card-title">
              <strong>Values JSON</strong>
              {valuesError ? <span className="docs-playground-error-badge">JSON 有误</span> : <span className="docs-playground-ok-badge">已同步</span>}
            </div>
            <textarea
              value={valuesText}
              onChange={(event) => setValuesText(event.target.value)}
              spellCheck={false}
              className="docs-playground-editor"
              style={{ minHeight: isModal ? 136 : 160 }}
            />
            {valuesError && <div className="docs-playground-error-text">{valuesError}</div>}
            <div className="docs-playground-actions">
              <button type="button" className="ui-btn ui-btn-xs ui-btn-primary" onClick={syncValuesFromEditor} disabled={!!valuesError}>应用 Values</button>
              <button type="button" className="ui-btn ui-btn-xs" onClick={resetAll}>重置</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
