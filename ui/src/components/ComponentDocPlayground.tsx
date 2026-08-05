import React from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { ComponentNode } from '../models';
import FormRenderer from './FormRenderer';
import type { DesignComponent } from '../project/types';
import { exportToComponentNodes } from '../designer/export';

interface PlaygroundSeed {
  component: DesignComponent;
  values: Record<string, unknown>;
}

interface PlaygroundScenario {
  label: string;
  description?: string;
  seed: PlaygroundSeed;
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

function base(type: string): DesignComponent {
  return {
    id: `doc_playground_${type}`,
    type,
    x: 0, y: 0,
    width: 420,
    height: 72,
    fieldBinding: `${type}_value`,
    props: { name: `${type}_value`, label: '示例字段', placeholder: '在这里体验组件' },
  };
}

function buildScenarios(type: string): PlaygroundScenario[] {
  const b = base(type);

  switch (type) {
    // ── 基础控件 ──────────────────────────────────────────
    case 'input':
      return [
        { label: '基础文本', description: '最常用的标准输入框', seed: { component: b, values: { input_value: '上海餐饮示例' } } },
        { label: '密码输入', description: 'type=password，内容不可见', seed: { component: { ...b, props: { ...b.props, label: '密码', placeholder: '请输入密码', type: 'password' } }, values: { input_value: 'secret123' } } },
        { label: '带前后缀', description: 'prefix / suffix 辅助输入', seed: { component: { ...b, props: { ...b.props, label: '网址', placeholder: '请输入域名', prefix: 'https://', suffix: '.com' } }, values: { input_value: 'example' } } },
        { label: '搜索框', description: '带清除按钮的搜索场景', seed: { component: { ...b, props: { ...b.props, label: '搜索', placeholder: '输入关键词搜索…', allowClear: true } }, values: { input_value: '' } } },
      ];
    case 'textarea':
      return [
        { label: '基础多行', description: '标准多行文本输入', seed: { component: { ...b, height: 132, props: { ...b.props, rows: 4, placeholder: '支持多行输入的说明文本' } }, values: { textarea_value: '这是一段可直接编辑的多行示例内容。' } } },
        { label: '字数统计', description: '开启 showCount 限制', seed: { component: { ...b, height: 132, props: { ...b.props, rows: 4, showCount: true, maxLength: 200, placeholder: '最多 200 字' } }, values: { textarea_value: '已输入的示例文本' } } },
        { label: '自适应高度', description: 'autoResize 随内容撑高', seed: { component: { ...b, height: 100, props: { ...b.props, rows: 2, autoResize: true, placeholder: '输入内容后自动变高…' } }, values: { textarea_value: '第一行\n第二行\n第三行' } } },
      ];
    case 'number':
      return [
        { label: '基础数字', description: '带步进器的数字输入', seed: { component: { ...b, props: { ...b.props, min: 0, max: 10000, step: 10 } }, values: { number_value: 256 } } },
        { label: '金额格式', description: '带千分位和前缀', seed: { component: { ...b, props: { ...b.props, label: '金额', min: 0, precision: 2, prefix: '¥', formatter: 'thousands' } }, values: { number_value: 12800.5 } } },
        { label: '百分比', description: '0-100 范围，带后缀', seed: { component: { ...b, props: { ...b.props, label: '完成率', min: 0, max: 100, step: 1, suffix: '%' } }, values: { number_value: 75 } } },
      ];
    case 'datePicker':
      return [
        { label: '日期选择', description: '标准日期格式', seed: { component: { ...b, props: { ...b.props, format: 'YYYY-MM-DD' } }, values: { datePicker_value: '2026-07-09' } } },
        { label: '日期时间', description: '精确到时分秒', seed: { component: { ...b, props: { ...b.props, label: '会议时间', format: 'YYYY-MM-DD HH:mm', showTime: true } }, values: { datePicker_value: '2026-07-09 14:30' } } },
        { label: '禁用过往日期', description: '不可选择今天之前', seed: { component: { ...b, props: { ...b.props, label: '预约日期', disabledDate: 'beforeToday' } }, values: { datePicker_value: '' } } },
      ];
    case 'timePicker':
      return [
        { label: '时分秒', description: '精确到秒', seed: { component: { ...b, props: { ...b.props, showSeconds: true } }, values: { timePicker_value: '14:30:15' } } },
        { label: '仅时分', description: '不显示秒', seed: { component: { ...b, props: { ...b.props, label: '会议时间', showSeconds: false, format: 'HH:mm' } }, values: { timePicker_value: '09:00' } } },
      ];
    case 'dateRange':
      return [
        { label: '日期区间', description: '选择开始和结束日期', seed: { component: { ...b, height: 72, props: { ...b.props, startPlaceholder: '开始日期', endPlaceholder: '结束日期' } }, values: { dateRange_value: { start: '2026-07-01', end: '2026-07-09' } } } },
        { label: '带时间范围', description: '精确到时分', seed: { component: { ...b, height: 72, props: { ...b.props, label: '活动时段', startPlaceholder: '开始', endPlaceholder: '结束', showTime: true } }, values: { dateRange_value: { start: '2026-07-01 09:00', end: '2026-07-01 18:00' } } } },
      ];
    case 'switch':
      return [
        { label: '基础开关', description: '布尔值切换', seed: { component: { ...b, props: { ...b.props, label: '是否启用示例' } }, values: { switch_value: true } } },
        { label: '带确认提示', description: '切换时弹出确认', seed: { component: { ...b, props: { ...b.props, label: '发布上线', checkedChildren: 'ON', unCheckedChildren: 'OFF' } }, values: { switch_value: false } } },
      ];
    case 'rating':
      return [
        { label: '五星评分', description: '标准评分控件', seed: { component: { ...b, props: { ...b.props, max: 5 } }, values: { rating_value: 4 } } },
        { label: '十分制', description: 'max=10 细粒度评分', seed: { component: { ...b, props: { ...b.props, label: '综合评分', max: 10, allowHalf: true } }, values: { rating_value: 7.5 } } },
      ];
    case 'tagInput':
      return [
        { label: '基础标签', description: '输入后回车添加标签', seed: { component: b, values: { tagInput_value: ['上海', '餐饮', '分析'] } } },
        { label: '限制数量', description: '最多 3 个标签', seed: { component: { ...b, props: { ...b.props, label: '技能标签', maxCount: 3 } }, values: { tagInput_value: ['Excel', 'SQL'] } } },
      ];
    case 'upload':
      return [
        { label: '文件上传', description: '标准文件上传', seed: { component: b, values: { upload_value: [{ name: '需求说明.pdf', size: 18240, type: 'application/pdf' }] } } },
        { label: '限制类型', description: '仅允许图片和 PDF', seed: { component: { ...b, props: { ...b.props, label: '附件上传', accept: '.pdf,.jpg,.png', maxSize: 5 } }, values: { upload_value: [] } } },
      ];
    case 'imageUpload':
      return [
        { label: '图片上传', description: '支持预览的图片上传', seed: { component: b, values: { imageUpload_value: [{ name: 'cover.png', size: 9812, type: 'image/png', url: SAMPLE_IMAGE }] } } },
        { label: '头像裁剪', description: '正方形头像上传', seed: { component: { ...b, props: { ...b.props, label: '头像', aspectRatio: 1, cropShape: 'round' } }, values: { imageUpload_value: [] } } },
      ];
    case 'button':
      return [
        { label: '主按钮', description: 'primary 主操作', seed: { component: { ...b, fieldBinding: undefined, props: { ...b.props, name: 'doc_button', label: '点击体验', variant: 'primary' } }, values: {} } },
        { label: '危险按钮', description: 'danger 破坏性操作', seed: { component: { ...b, fieldBinding: undefined, props: { ...b.props, name: 'doc_button', label: '删除', variant: 'danger' } }, values: {} } },
        { label: '幽灵按钮', description: 'ghost 次要操作', seed: { component: { ...b, fieldBinding: undefined, props: { ...b.props, name: 'doc_button', label: '取消', variant: 'ghost' } }, values: {} } },
      ];
    // ── 选择控件 ──────────────────────────────────────────
    case 'select':
      return [
        { label: '单选下拉', description: '标准单选', seed: { component: { ...b, props: { ...b.props, options: [{ label: '黄浦区', value: '黄浦区' }, { label: '徐汇区', value: '徐汇区' }, { label: '浦东新区', value: '浦东新区' }] } }, values: { select_value: '黄浦区' } } },
        { label: '多选模式', description: 'multiple 多选', seed: { component: { ...b, props: { ...b.props, label: '服务区域', mode: 'multiple', options: [{ label: '黄浦区', value: '黄浦区' }, { label: '徐汇区', value: '徐汇区' }, { label: '浦东新区', value: '浦东新区' }, { label: '静安区', value: '静安区' }] } }, values: { select_value: ['黄浦区', '浦东新区'] } } },
        { label: '可搜索', description: '输入关键词过滤选项', seed: { component: { ...b, props: { ...b.props, label: '选择城市', showSearch: true, options: [{ label: '北京', value: '北京' }, { label: '上海', value: '上海' }, { label: '广州', value: '广州' }, { label: '深圳', value: '深圳' }] } }, values: { select_value: '' } } },
      ];
    case 'segmented':
      return [
        { label: '时间维度', description: '日报/周报/月报', seed: { component: { ...b, props: { ...b.props, options: [{ label: '日报', value: 'day' }, { label: '周报', value: 'week' }, { label: '月报', value: 'month' }] } }, values: { segmented_value: 'week' } } },
        { label: '视图切换', description: '列表/网格/地图', seed: { component: { ...b, props: { ...b.props, label: '视图模式', options: [{ label: '列表', value: 'list' }, { label: '网格', value: 'grid' }, { label: '地图', value: 'map' }] } }, values: { segmented_value: 'list' } } },
      ];
    case 'radio':
      return [
        { label: '水平排列', description: 'direction=horizontal', seed: { component: { ...b, height: 96, props: { ...b.props, direction: 'horizontal', options: [{ label: '堂食', value: 'eat-in' }, { label: '外卖', value: 'delivery' }] } }, values: { radio_value: 'delivery' } } },
        { label: '垂直排列', description: 'direction=vertical', seed: { component: { ...b, height: 120, props: { ...b.props, label: '配送方式', direction: 'vertical', options: [{ label: '即时配送', value: 'instant' }, { label: '预约配送', value: 'scheduled' }, { label: '自提', value: 'pickup' }] } }, values: { radio_value: 'instant' } } },
      ];
    case 'checkbox':
      return [
        { label: '多选', description: '标准多选控件', seed: { component: { ...b, height: 104, props: { ...b.props, options: [{ label: '甜品', value: 'dessert' }, { label: '咖啡', value: 'coffee' }, { label: '简餐', value: 'meal' }] } }, values: { checkbox_value: ['dessert', 'coffee'] } } },
        { label: '全选/半选', description: '带全选功能', seed: { component: { ...b, height: 140, props: { ...b.props, label: '权限设置', options: [{ label: '查看', value: 'view' }, { label: '编辑', value: 'edit' }, { label: '删除', value: 'delete' }, { label: '导出', value: 'export' }], showSelectAll: true } }, values: { checkbox_value: ['view', 'edit'] } } },
      ];
    // ── 容器控件 ──────────────────────────────────────────
    case 'container':
      return [
        { label: '基础容器', description: '信息分组', seed: { component: { ...b, fieldBinding: undefined, height: 120, props: { title: '信息分组容器', subtitle: '用于组织相关控件或展示块' } }, values: {} } },
      ];
    case 'card':
      return [
        { label: '信息卡片', description: '带标题和副标题', seed: { component: { ...b, fieldBinding: undefined, height: 120, props: { title: '营业表现卡片', subtitle: '用于组织相关控件或展示块' } }, values: {} } },
        { label: '统计卡片', description: '展示关键指标', seed: { component: { ...b, fieldBinding: undefined, height: 100, props: { title: '今日营收', subtitle: '¥128,000', extra: '+12.5%' } }, values: {} } },
      ];
    case 'tabs':
      return [
        { label: '基础标签页', description: '多标签切换', seed: { component: { ...b, fieldBinding: 'tabs_value', props: { ...b.props, tabs: ['基础信息', '经营分析', '附件'] } }, values: { tabs_value: 1 } } },
        { label: '卡片式标签', description: 'type=card 样式', seed: { component: { ...b, fieldBinding: 'tabs_value', props: { ...b.props, label: '数据视图', type: 'card', tabs: ['表格', '图表', '详情'] } }, values: { tabs_value: 0 } } },
      ];
    case 'steps':
      return [
        { label: '基础步骤', description: '线性流程引导', seed: { component: { ...b, fieldBinding: 'steps_value', props: { ...b.props, steps: ['选择数据', '配置流程', '运行验证'] } }, values: { steps_value: 2 } } },
        { label: '多步骤', description: '5 步复杂流程', seed: { component: { ...b, fieldBinding: 'steps_value', props: { ...b.props, label: '审批流程', steps: ['提交申请', '部门审核', '财务复核', '主管审批', '完成'] } }, values: { steps_value: 3 } } },
      ];
    // ── 展示控件 ──────────────────────────────────────────
    case 'divider':
      return [
        { label: '水平分割线', description: '基础分割', seed: { component: { ...b, fieldBinding: undefined, height: 20, props: { orientation: 'horizontal', color: '#cbd5e1', thickness: 1, margin: 8 } }, values: {} } },
        { label: '带文字', description: '中间带文字说明', seed: { component: { ...b, fieldBinding: undefined, height: 20, props: { orientation: 'horizontal', text: '以下为高级选项', margin: 12 } }, values: {} } },
      ];
    case 'text':
      return [
        { label: '标题文本', description: '大号加粗', seed: { component: { ...b, fieldBinding: undefined, height: 48, props: { content: '静态文本示例', fontSize: 28, fontWeight: 'bold', color: '#0f172a' } }, values: {} } },
        { label: '说明文本', description: '小号灰色', seed: { component: { ...b, fieldBinding: undefined, height: 32, props: { content: '这是一段辅助说明文字', fontSize: 14, color: '#64748b' } }, values: {} } },
        { label: '动态内容', description: '绑定字段值', seed: { component: { ...b, fieldBinding: 'text_value', height: 40, props: { content: '动态文本', fontSize: 18, fontWeight: '600' } }, values: { text_value: '绑定字段后的动态内容' } } },
      ];
    case 'image':
      return [
        { label: '基础图片', description: '圆角封面图', seed: { component: { ...b, fieldBinding: undefined, height: 220, props: { src: SAMPLE_IMAGE, alt: '示例图片', fit: 'cover', borderRadius: 20 } }, values: {} } },
        { label: '头像模式', description: '圆形小图', seed: { component: { ...b, fieldBinding: undefined, height: 120, width: 120, props: { src: SAMPLE_IMAGE, alt: '头像', fit: 'cover', borderRadius: 60 } }, values: {} } },
      ];
    case 'table':
      return [
        { label: '基础表格', description: '只读数据展示', seed: { component: { ...b, fieldBinding: 'table_value', height: 220, props: { columns: ['门店', '营收', '状态'], rows: 3 } }, values: { table_value: [{ 门店: '南京东路店', 营收: 128000, 状态: '营业中' }, { 门店: '徐家汇店', 营收: 98000, 状态: '备货中' }, { 门店: '陆家嘴店', 营收: 143000, 状态: '营业中' }] } } },
        { label: '可编辑表格', description: 'editable 允许修改', seed: { component: { ...b, fieldBinding: 'table_value', height: 220, props: { columns: ['项目', '数量', '单价'], rows: 3, editable: true } }, values: { table_value: [{ 项目: '拿铁', 数量: 2, 单价: 28 }, { 项目: '美式', 数量: 1, 单价: 22 }, { 项目: '蛋糕', 数量: 1, 单价: 35 }] } } },
      ];
    case 'chart':
      return [
        { label: '柱状图', description: 'chartType=bar', seed: { component: { ...b, type: 'chart', fieldBinding: undefined, height: 280, props: { title: '月度营收趋势', chartType: 'bar', chartData: { labels: ['1月', '2月', '3月', '4月'], datasets: [{ label: '营收', data: [82, 96, 91, 118], backgroundColor: '#2563eb', borderColor: '#1d4ed8' }] }, showLegend: true, showValues: false } }, values: {} } },
        { label: '折线图', description: 'chartType=line', seed: { component: { ...b, type: 'chart', fieldBinding: undefined, height: 280, props: { title: '用户增长趋势', chartType: 'line', chartData: { labels: ['1月', '2月', '3月', '4月', '5月', '6月'], datasets: [{ label: '新增用户', data: [120, 190, 170, 250, 310, 280], borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4 }] }, showLegend: true } }, values: {} } },
        { label: '饼图', description: 'chartType=doughnut', seed: { component: { ...b, type: 'chart', fieldBinding: undefined, height: 280, props: { title: '渠道占比', chartType: 'doughnut', chartData: { labels: ['堂食', '外卖', '自提'], datasets: [{ label: '订单', data: [45, 35, 20], backgroundColor: ['#2563eb', '#f59e0b', '#10b981'] }] }, showLegend: true } }, values: {} } },
      ];
    default:
      return [{ label: '默认', seed: { component: b, values: { [`${type}_value`]: '' } } }];
  }
}

function safeParseJson<T>(text: string, fallback: T): T {
  try { return JSON.parse(text) as T; } catch { return fallback; }
}

function getParseError(text: string): string | null {
  try { JSON.parse(text); return null; } catch (error) { return error instanceof Error ? error.message : 'JSON 解析失败'; }
}

export default function ComponentDocPlayground({
  componentType,
  title,
  variant = 'page',
  relatedEventLinks,
}: {
  componentType: string;
  title: string;
  variant?: 'page' | 'modal';
  relatedEventLinks?: Array<{ label: string; href: string }>;
}) {
  const scenarios = useMemo(() => buildScenarios(componentType), [componentType]);
  const [activeIndex, setActiveIndex] = useState(0);
  const active = scenarios[activeIndex] || scenarios[0];

  const [propsText, setPropsText] = useState(() => JSON.stringify(active.seed.component.props, null, 2));
  const [valuesText, setValuesText] = useState(() => JSON.stringify(active.seed.values, null, 2));
  const [values, setValues] = useState<Record<string, unknown>>(active.seed.values);
  const propsError = useMemo(() => getParseError(propsText), [propsText]);
  const valuesError = useMemo(() => getParseError(valuesText), [valuesText]);
  const isModal = variant === 'modal';

  const switchScenario = useCallback((index: number) => {
    const s = scenarios[index];
    if (!s) return;
    setActiveIndex(index);
    setPropsText(JSON.stringify(s.seed.component.props, null, 2));
    setValuesText(JSON.stringify(s.seed.values, null, 2));
    setValues(s.seed.values);
  }, [scenarios]);

  const component = useMemo<DesignComponent>(() => ({
    ...active.seed.component,
    props: safeParseJson<Record<string, unknown>>(propsText, active.seed.component.props),
  }), [propsText, active.seed.component]);

  const parsedValues = useMemo(() => safeParseJson<Record<string, unknown>>(valuesText, values), [valuesText, values]);
  const componentNode = useMemo<ComponentNode>(() => exportToComponentNodes([component])[0], [component]);

  const syncValuesFromEditor = () => setValues(parsedValues);
  const resetAll = () => switchScenario(activeIndex);

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
          {scenarios.length > 1 && <span className="docs-playground-badge">{scenarios.length} 个场景</span>}
        </div>
      </div>

      {/* 场景切换 tabs */}
      {scenarios.length > 1 && (
        <div className="docs-playground-scenarios">
          {scenarios.map((s, i) => (
            <button
              key={s.label}
              type="button"
              className={`docs-playground-scenario-tab ${i === activeIndex ? 'active' : ''}`}
              onClick={() => switchScenario(i)}
              title={s.description}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* 相关事件跳转 */}
      {relatedEventLinks && relatedEventLinks.length > 0 && (
        <div className="docs-playground-events">
          <span className="docs-playground-events-label">相关事件：</span>
          {relatedEventLinks.map((link) => (
            <a key={link.href} href={link.href} className="docs-playground-event-link">{link.label}</a>
          ))}
        </div>
      )}

      <div className={`docs-playground-grid ${isModal ? 'docs-playground-grid--modal' : ''}`}>
        <div className="docs-playground-preview">
          <div className="docs-playground-preview-toolbar">
            <strong>组件预览</strong>
            <span>{componentType}{active.description ? ` · ${active.description}` : ''}</span>
          </div>
          <FormRenderer
            components={[componentNode]}
            values={values}
            originalValues={active.seed.values}
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
