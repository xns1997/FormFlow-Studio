import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Select, Spin } from 'antd';
import { useNavigate } from 'react-router-dom';
import Modal, { ModalFooter, ModalHeader } from '../../components/Modal';
import { PreviewCanvas } from '../../designer/PreviewCanvas';
import { useProjectStore } from '../../project/store';
import {
  operationTemplateClient,
  type FeasibilityReport,
  type TemplateRecommendation,
} from '../../services/templates/operationTemplateClient';

type RecommendationGroup = 'ready' | 'warning' | 'needs-configuration' | 'blocked';

const groupOrder: RecommendationGroup[] = ['ready', 'warning', 'needs-configuration', 'blocked'];
const groupLabels: Record<RecommendationGroup, string> = {
  ready: '可直接创建',
  warning: '有风险但可创建',
  'needs-configuration': '需补充配置',
  blocked: '暂不适用',
};
const parameterLabels: Record<string, string> = {
  name: '表单名称',
  title: '标题',
  subtitle: '副标题',
  selectedFields: '表单字段',
  queryFields: '查询字段',
  editableFields: '可编辑字段',
  metrics: '指标字段',
  dimensions: '维度字段',
  rowDimension: '行维度',
  columnDimension: '列维度',
  timeField: '时间字段',
  metric: '指标',
  fields: '分析字段',
  target: '目标字段',
  features: '特征字段',
  validationRatio: '验证集比例',
  horizon: '预测期数',
  grain: '时间粒度',
  relationId: '数据关系',
  joinType: '关联方式',
  pageSize: '每页展示数',
  exportFormat: '导出格式',
  columns: '列数',
  includeReset: '显示重置按钮',
  resetLabel: '重置按钮文案',
  saveLabel: '保存按钮文案',
  submitLabel: '提交按钮文案',
  lookupLabel: '查询按钮文案',
  layoutMode: '布局模式',
  sectionMode: '分组模式',
  denseLayout: '紧凑布局',
  successMessage: '成功提示文案',
  previewRows: '预览样本行数',
  detailRows: '结果展示行数',
  sampleRows: '输入样本行数',
  chartLimit: '图表系列上限',
  maxChanges: '最大变更数',
  aggregation: '聚合方式',
  contamination: '异常比例',
  atomic: '原子提交',
  existingPolicy: '已存在记录策略',
  allowEmptyDetails: '允许空明细',
};
const fieldParameterNames = new Set([
  'selectedFields',
  'queryFields',
  'editableFields',
  'metrics',
  'dimensions',
  'rowDimension',
  'columnDimension',
  'timeField',
  'metric',
  'fields',
  'target',
  'features',
]);

function normalizedGroup(status: FeasibilityReport['status']): RecommendationGroup {
  return status === 'not-applicable' ? 'blocked' : status;
}

function recommendationBadge(index: number) {
  return index === 0 ? '最适合' : index === 1 ? '适合' : index === 2 ? '可选' : '';
}

function resolveTemplatePopupContainer(triggerNode: HTMLElement) {
  return triggerNode.closest<HTMLElement>('[data-app-modal="true"]') || triggerNode.ownerDocument.body;
}

interface DataTemplateRecommendationModalProps {
  open: boolean;
  onClose: () => void;
  tableId: string;
  tableName: string;
  sheetName: string;
  fields: string[];
  hasUnsavedChanges: boolean;
  onSaveData: () => Promise<void>;
  onOpenAdvanced: (view?: 'library' | 'results') => void;
}

export default function DataTemplateRecommendationModal({
  open,
  onClose,
  tableId,
  tableName,
  sheetName,
  fields,
  hasUnsavedChanges,
  onSaveData,
  onOpenAdvanced,
}: DataTemplateRecommendationModalProps) {
  const navigate = useNavigate();
  const project = useProjectStore((state) => state.project);
  const refreshProject = useProjectStore((state) => state.refreshProject);
  const [recommendations, setRecommendations] = useState<TemplateRecommendation[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [report, setReport] = useState<FeasibilityReport>();
  const [planned, setPlanned] = useState<{ plan: Record<string, any>; revision: string }>();
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<'wide' | 'narrow'>('wide');
  const [compactView, setCompactView] = useState<'templates' | 'preview'>('templates');
  const [installedAnalysis, setInstalledAnalysis] = useState<{ instanceId: string; revision: string; message: string }>();
  const recommendationRequestSequence = useRef(0);
  const previewRequestSequence = useRef(0);

  const selection = useMemo(() => ({
    tableId,
    tableIds: [tableId],
    sheetName,
    fields,
  }), [fields, sheetName, tableId]);
  const selected = recommendations.find((item) => item.template.id === selectedId);
  const parameterEntries = Object.entries(selected?.template.parameterSchema.properties || {});
  const requiredParameters = new Set(selected?.template.parameterSchema.required || []);
  const missingRequired = [...requiredParameters].filter((name) => {
    const value = parameters[name];
    return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  });
  const previewForm = planned?.plan?.artifacts?.forms?.[0];
  const previewWorkflows = planned?.plan?.artifacts?.workflows || [];
  const previewDetails = planned?.plan?.preview as Record<string, any> | undefined;
  const visibleRecommendations = showAll ? recommendations : recommendations.slice(0, 3);
  const grouped = groupOrder.map((group) => ({
    group,
    items: visibleRecommendations.filter((item) => normalizedGroup(item.report.status) === group),
  })).filter((entry) => entry.items.length);

  useEffect(() => {
    if (!open || !project?.config.id || !fields.length) return;
    const sequence = ++recommendationRequestSequence.current;
    setLoadingRecommendations(true);
    setError('');
    setRecommendations([]);
    setSelectedId('');
    setPlanned(undefined);
    setInstalledAnalysis(undefined);
    operationTemplateClient.recommend(project.config.id, selection)
      .then((items) => {
        if (sequence !== recommendationRequestSequence.current) return;
        setRecommendations(items);
        const first = items.find((item) => item.report.status !== 'blocked' && item.report.status !== 'not-applicable') || items[0];
        if (first) {
          setSelectedId(first.template.id);
          setParameters(first.suggestedParameters);
          setReport(first.report);
        }
      })
      .catch((cause) => {
        if (sequence === recommendationRequestSequence.current) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (sequence === recommendationRequestSequence.current) setLoadingRecommendations(false);
      });
    return () => {
      if (recommendationRequestSequence.current === sequence) recommendationRequestSequence.current += 1;
    };
  }, [open, project?.config.id, selection]);

  useEffect(() => {
    const sequence = ++previewRequestSequence.current;
    if (!open || !project?.config.id || !selected || missingRequired.length || normalizedGroup(selected.report.status) === 'blocked') {
      setPlanned(undefined);
      setLoadingPreview(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoadingPreview(true);
      setError('');
      try {
        const nextReport = await operationTemplateClient.analyze(project.config.id, selected.template.id, selection, parameters);
        if (sequence !== previewRequestSequence.current) return;
        setReport(nextReport);
        if (nextReport.status === 'blocked' || nextReport.status === 'not-applicable' || nextReport.status === 'needs-configuration') {
          setPlanned(undefined);
          return;
        }
        const nextPlan = await operationTemplateClient.plan(project.config.id, selected.template.id, selection, parameters);
        if (sequence !== previewRequestSequence.current) return;
        setPlanned(nextPlan);
        setCompactView('preview');
      } catch (cause) {
        if (sequence === previewRequestSequence.current) {
          setPlanned(undefined);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (sequence === previewRequestSequence.current) setLoadingPreview(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      if (previewRequestSequence.current === sequence) previewRequestSequence.current += 1;
    };
  }, [hasUnsavedChanges, missingRequired.join('|'), open, parameters, project?.config.id, selected?.template.id, selection]);

  const selectRecommendation = (item: TemplateRecommendation) => {
    setSelectedId(item.template.id);
    setParameters(item.suggestedParameters);
    setReport(item.report);
    setPlanned(undefined);
    setError('');
    setInstalledAnalysis(undefined);
  };

  const updateParameter = (name: string, value: unknown) => {
    setParameters((current) => ({ ...current, [name]: value }));
    setPlanned(undefined);
  };

  const renderParameter = (name: string, schema: Record<string, any>) => {
    if (name === 'relationId') {
      return (
        <Select
          value={parameters[name] as string | undefined}
          onChange={(value) => updateParameter(name, value)}
          placeholder="选择数据关系"
          options={(project?.relations || []).map((relation) => ({ value: relation.id, label: relation.name }))}
          getPopupContainer={resolveTemplatePopupContainer}
        />
      );
    }
    if (fieldParameterNames.has(name)) {
      const multiple = schema.type === 'array';
      return (
        <Select
          mode={multiple ? 'multiple' : undefined}
          value={parameters[name] as any}
          onChange={(value) => updateParameter(name, value)}
          placeholder={`选择${parameterLabels[name] || name}`}
          options={fields.map((field) => ({ value: field, label: field }))}
          getPopupContainer={resolveTemplatePopupContainer}
        />
      );
    }
    if (schema.enum) {
      return (
        <Select
          value={parameters[name]}
          onChange={(value) => updateParameter(name, value)}
          options={schema.enum.map((value: string) => ({ value, label: value }))}
          getPopupContainer={resolveTemplatePopupContainer}
        />
      );
    }
    if (schema.type === 'boolean') {
      return (
        <Select
          value={parameters[name]}
          onChange={(value) => updateParameter(name, value)}
          options={[{ value: true, label: '是' }, { value: false, label: '否' }]}
          getPopupContainer={resolveTemplatePopupContainer}
        />
      );
    }
    return (
      <Input
        type={schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'}
        value={String(parameters[name] ?? '')}
        placeholder={schema.default !== undefined ? `默认：${schema.default}` : `填写${parameterLabels[name] || name}`}
        onChange={(event) => updateParameter(
          name,
          schema.type === 'number' || schema.type === 'integer'
            ? event.target.value === '' ? undefined : Number(event.target.value)
            : event.target.value,
        )}
      />
    );
  };

  const apply = async () => {
    if (!project || !selected || !planned || hasUnsavedChanges) return;
    setCreating(true);
    setError('');
    try {
      const applied = await operationTemplateClient.apply(project.config.id, planned.revision, planned.plan);
      const formId = String((applied.resources as any)?.forms?.[0]?.id || '');
      if (selected.template.category === 'analysis' || selected.template.category === 'prediction') {
        try {
          await operationTemplateClient.runAnalysis(project.config.id, applied.revision, selected.template.id, selection, parameters);
        } catch (cause) {
          await refreshProject();
          setPlanned(undefined);
          setInstalledAnalysis({
            instanceId: applied.instanceId,
            revision: applied.revision,
            message: cause instanceof Error ? cause.message : String(cause),
          });
          setError(`模板已创建，但首次运行失败：${cause instanceof Error ? cause.message : String(cause)}`);
          return;
        }
        await refreshProject();
        onClose();
        onOpenAdvanced('results');
        return;
      }
      await refreshProject();
      onClose();
      navigate(`/projects/${encodeURIComponent(project.config.id)}/editor?mode=design${formId ? `&form=${encodeURIComponent(formId)}` : ''}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  };

  const retryInstalledAnalysis = async () => {
    if (!project || !selected || !installedAnalysis) return;
    setCreating(true);
    setError('');
    try {
      await operationTemplateClient.runAnalysis(project.config.id, installedAnalysis.revision, selected.template.id, selection, parameters);
      await refreshProject();
      setInstalledAnalysis(undefined);
      onClose();
      onOpenAdvanced('results');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setInstalledAnalysis((current) => current ? { ...current, message } : current);
      setError(`再次运行失败：${message}`);
    } finally {
      setCreating(false);
    }
  };

  const requiredParameterEntries = parameterEntries.filter(([name]) => requiredParameters.has(name));
  const optionalParameterEntries = parameterEntries.filter(([name]) => !requiredParameters.has(name));
  const renderParameterFields = (entries: Array<[string, Record<string, any>]>) => entries.map(([name, schema]) => (
    <label key={name}>
      <span>{parameterLabels[name] || name}{requiredParameters.has(name) && <em>必填</em>}</span>
      {renderParameter(name, schema)}
    </label>
  ));

  const saveFirst = async () => {
    setCreating(true);
    setError('');
    try {
      await onSaveData();
      setPlanned(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="min(1240px, 96vw)"
      maxWidth="96vw"
      maxHeight="92vh"
      containerClassName="data-template-modal"
      closeOnBackdrop={false}
    >
      <ModalHeader
        title="选择模板生成表单"
        description={`${tableName} / ${sheetName} · 已选 ${fields.length} 个字段`}
        onClose={onClose}
      />
      <div className="data-template-compact-tabs" role="tablist" aria-label="模板推荐步骤">
        <button type="button" role="tab" aria-selected={compactView === 'templates'} onClick={() => setCompactView('templates')}>模板</button>
        <button type="button" role="tab" aria-selected={compactView === 'preview'} onClick={() => setCompactView('preview')}>预览</button>
      </div>
      <div className="data-template-layout">
        <section className={`data-template-list-pane ${compactView === 'templates' ? 'is-compact-visible' : ''}`} aria-label="推荐模板">
          {loadingRecommendations ? (
            <div className="data-template-loading"><Spin /><span>正在匹配全部模板…</span></div>
          ) : recommendations.length ? (
            <>
              {grouped.map(({ group, items }) => (
                <section className="data-template-group" key={group}>
                  <h3>{groupLabels[group]} <span>{items.length}</span></h3>
                  {items.map((item) => {
                    const index = recommendations.indexOf(item);
                    const badge = recommendationBadge(index);
                    const blocked = normalizedGroup(item.report.status) === 'blocked';
                    return (
                      <button
                        type="button"
                        key={item.template.id}
                        className={`data-template-card ${selectedId === item.template.id ? 'selected' : ''} ${blocked ? 'blocked' : ''}`}
                        aria-pressed={selectedId === item.template.id}
                        onClick={() => selectRecommendation(item)}
                      >
                        <span className="data-template-card-topline">
                          <strong>{item.template.name}</strong>
                          {badge && <span className={`data-template-rank rank-${index + 1}`}>{badge}</span>}
                        </span>
                        <span className="data-template-description">{item.template.description}</span>
                        <span className="data-template-reasons">{item.reasons.join(' · ')}</span>
                      </button>
                    );
                  })}
                </section>
              ))}
              {!showAll && recommendations.length > 3 && (
                <button type="button" className="ui-btn data-template-show-all" onClick={() => setShowAll(true)}>
                  查看全部 {recommendations.length} 个模板
                </button>
              )}
              {showAll && <button type="button" className="ui-btn data-template-show-all" onClick={() => setShowAll(false)}>只看推荐</button>}
            </>
          ) : (
            <div className="data-template-empty">当前选择没有可评估的模板。</div>
          )}
        </section>
        <section className={`data-template-preview-pane ${compactView === 'preview' ? 'is-compact-visible' : ''}`} aria-label="表单预览">
          {selected && (
            <div className="data-template-preview-header">
              <div>
                <span>{groupLabels[normalizedGroup(report?.status || selected.report.status)]}</span>
                <strong>{selected.template.name}</strong>
              </div>
              <div className="data-template-viewport-toggle" role="group" aria-label="预览宽度">
                <button type="button" aria-pressed={previewWidth === 'wide'} onClick={() => setPreviewWidth('wide')}>宽屏</button>
                <button type="button" aria-pressed={previewWidth === 'narrow'} onClick={() => setPreviewWidth('narrow')}>窄屏</button>
              </div>
            </div>
          )}
          {!!parameterEntries.length && selected && normalizedGroup(selected.report.status) !== 'blocked' && (
            <details className="data-template-parameters" open={missingRequired.length > 0}>
              <summary>业务配置{missingRequired.length ? ` · 还需 ${missingRequired.length} 项` : ' · 已自动填写'}</summary>
              <div>
                {renderParameterFields(requiredParameterEntries)}
                {!!optionalParameterEntries.length && (
                  <details className="data-template-advanced-parameters">
                    <summary>高级参数 · {optionalParameterEntries.length} 项</summary>
                    <div>{renderParameterFields(optionalParameterEntries)}</div>
                  </details>
                )}
              </div>
            </details>
          )}
          <div className={`data-template-preview-surface is-${previewWidth}`} aria-live="polite">
            {loadingPreview ? (
              <div className="data-template-loading"><Spin /><span>正在生成安全预览…</span></div>
            ) : previewForm ? (
              <PreviewCanvas
                formId={`template-preview-${selectedId}`}
                components={previewForm.design?.components || []}
                formWindow={previewForm.design?.formWindow}
                zoom={1}
                workflows={previewWorkflows}
                tables={project?.srcTable || []}
                presentation="runtime"
                interactionPolicy="local-only"
              />
            ) : selected && normalizedGroup(selected.report.status) === 'blocked' ? (
              <div className="data-template-empty">
                <strong>当前数据暂不适用</strong>
                <span>{selected.report.checks.filter((check) => check.status === 'failed').map((check) => check.message).join('；')}</span>
              </div>
            ) : missingRequired.length ? (
              <div className="data-template-empty"><strong>补充必要配置后即可预览</strong><span>{missingRequired.map((name) => parameterLabels[name] || name).join('、')}</span></div>
            ) : (
              <div className="data-template-empty">选择模板后将在这里显示真实表单。</div>
            )}
          </div>
          {planned && (
            <div className="data-template-generation-summary">
              <span><b>{planned.plan.summary.forms}</b> 表单</span>
              <span><b>{planned.plan.summary.workflows}</b> 流程</span>
              <span><b>{planned.plan.summary.behaviors}</b> 行为</span>
              <span><b>{planned.plan.summary.outputs}</b> 输出</span>
              <span><b>{planned.plan.summary.tests}</b> 测试</span>
            </div>
          )}
          {previewDetails && (
            <details className="data-template-preview-details">
              <summary>
                <span className="preview-details-icon" aria-hidden="true">📋</span>
                精确预览 · 字段/规则/流程
              </summary>
              <div className="preview-details-grid">
                <div className="preview-detail-card">
                  <div className="preview-detail-card-header">
                    <span className="preview-detail-icon" aria-hidden="true">📊</span>
                    <span className="preview-detail-title">字段投影</span>
                  </div>
                  <div className="preview-detail-card-body">
                    <div className="preview-field-group">
                      <span className="preview-field-label">可见</span>
                      <div className="preview-field-tags">
                        {(previewDetails.fieldProjection?.visibleFields || []).map((f: string) => <span key={f} className="preview-field-tag visible">{f}</span>)}
                        {!previewDetails.fieldProjection?.visibleFields?.length && <span className="preview-field-empty">无</span>}
                      </div>
                    </div>
                    {!!previewDetails.fieldProjection?.internalFields?.length && (
                      <div className="preview-field-group">
                        <span className="preview-field-label">内部</span>
                        <div className="preview-field-tags">
                          {previewDetails.fieldProjection.internalFields.map((f: string) => <span key={f} className="preview-field-tag internal">{f}</span>)}
                        </div>
                      </div>
                    )}
                    {!!previewDetails.fieldProjection?.queryFields?.length && (
                      <div className="preview-field-group">
                        <span className="preview-field-label">查询</span>
                        <div className="preview-field-tags">
                          {previewDetails.fieldProjection.queryFields.map((f: string) => <span key={f} className="preview-field-tag query">{f}</span>)}
                        </div>
                      </div>
                    )}
                    {!!previewDetails.fieldProjection?.editableFields?.length && (
                      <div className="preview-field-group">
                        <span className="preview-field-label">编辑</span>
                        <div className="preview-field-tags">
                          {previewDetails.fieldProjection.editableFields.map((f: string) => <span key={f} className="preview-field-tag editable">{f}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {!!previewDetails.normalizedFields?.length && (
                  <div className="preview-detail-card">
                    <div className="preview-detail-card-header">
                      <span className="preview-detail-icon" aria-hidden="true">🏷️</span>
                      <span className="preview-detail-title">字段类型</span>
                    </div>
                    <div className="preview-detail-card-body">
                      <div className="preview-field-type-list">
                        {previewDetails.normalizedFields.map((field: any) => (
                          <div key={field.name} className="preview-field-type-item">
                            <span className="preview-field-type-name">{field.name}</span>
                            <span className={`preview-field-type-badge ${field.type}`}>{field.type}</span>
                            <span className="preview-field-type-confidence">{Math.round(Number(field.typeConfidence || 0) * 100)}%</span>
                            {field.key && <span className="preview-field-type-role key">主键</span>}
                            {field.readOnly && <span className="preview-field-type-role readonly">只读</span>}
                            {field.computed && <span className="preview-field-type-role computed">计算</span>}
                            {field.needsConfiguration && <span className="preview-field-type-role pending">待确认</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="preview-detail-card">
                  <div className="preview-detail-card-header">
                    <span className="preview-detail-icon" aria-hidden="true">📐</span>
                    <span className="preview-detail-title">布局</span>
                  </div>
                  <div className="preview-detail-card-body">
                    <div className="preview-layout-info">
                      <div className="preview-layout-item">
                        <span className="preview-layout-label">标题</span>
                        <span className="preview-layout-value">{previewDetails.layout?.window?.title || selected?.template.name}</span>
                      </div>
                      {previewDetails.layout?.columns && (
                        <div className="preview-layout-item">
                          <span className="preview-layout-label">列数</span>
                          <span className="preview-layout-value">{previewDetails.layout.columns} 列</span>
                        </div>
                      )}
                      {previewDetails.layout?.mode && (
                        <div className="preview-layout-item">
                          <span className="preview-layout-label">模式</span>
                          <span className="preview-layout-value">{previewDetails.layout.mode}</span>
                        </div>
                      )}
                      {previewDetails.layout?.sectionMode && (
                        <div className="preview-layout-item">
                          <span className="preview-layout-label">分区</span>
                          <span className="preview-layout-value">{previewDetails.layout.sectionMode}</span>
                        </div>
                      )}
                      {previewDetails.layout?.componentCount && (
                        <div className="preview-layout-item">
                          <span className="preview-layout-label">组件</span>
                          <span className="preview-layout-value">{previewDetails.layout.componentCount} 个</span>
                        </div>
                      )}
                      {previewDetails.layout?.window?.width && (
                        <div className="preview-layout-item">
                          <span className="preview-layout-label">尺寸</span>
                          <span className="preview-layout-value">{previewDetails.layout.window.width}×{previewDetails.layout.window.height}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {!!previewDetails.rules?.length && (
                  <div className="preview-detail-card">
                    <div className="preview-detail-card-header">
                      <span className="preview-detail-icon" aria-hidden="true">📏</span>
                      <span className="preview-detail-title">规则摘要</span>
                    </div>
                    <div className="preview-detail-card-body">
                      <div className="preview-rule-list">
                        {previewDetails.rules.map((rule: any) => (
                          <div key={rule.id} className="preview-rule-item">
                            <span className="preview-rule-id">{rule.id}</span>
                            <span className="preview-rule-lines">{(rule.lines || []).slice(0, 2).join(' / ')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {!!previewDetails.workflows?.length && (
                  <div className="preview-detail-card">
                    <div className="preview-detail-card-header">
                      <span className="preview-detail-icon" aria-hidden="true">⚡</span>
                      <span className="preview-detail-title">流程摘要</span>
                    </div>
                    <div className="preview-detail-card-body">
                      <div className="preview-workflow-list">
                        {previewDetails.workflows.map((workflow: any) => (
                          <div key={workflow.id} className="preview-workflow-item">
                            <span className="preview-workflow-name">{workflow.name}</span>
                            <span className="preview-workflow-stats">{workflow.nodeCount} 节点 / {workflow.edgeCount} 连线</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {!!previewDetails.buttonTriggers?.length && (
                  <div className="preview-detail-card">
                    <div className="preview-detail-card-header">
                      <span className="preview-detail-icon" aria-hidden="true">🔘</span>
                      <span className="preview-detail-title">按钮触发</span>
                    </div>
                    <div className="preview-detail-card-body">
                      <div className="preview-button-list">
                        {previewDetails.buttonTriggers.map((button: any) => (
                          <div key={button.id} className="preview-button-item">
                            <span className="preview-button-label">{button.label}</span>
                            {button.workflowIds?.length ? <span className="preview-button-workflow">→ {button.workflowIds.join('、')}</span> : null}
                            {button.disabledExpression ? <span className="preview-button-disabled">禁用: {button.disabledExpression}</span> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {!!previewDetails.tests?.length && (
                  <div className="preview-detail-card">
                    <div className="preview-detail-card-header">
                      <span className="preview-detail-icon" aria-hidden="true">✅</span>
                      <span className="preview-detail-title">测试覆盖</span>
                    </div>
                    <div className="preview-detail-card-body">
                      <div className="preview-test-list">
                        {previewDetails.tests.map((suite: any) => (
                          <div key={suite.id} className="preview-test-item">
                            <span className="preview-test-name">{suite.name}</span>
                            <span className="preview-test-count">{suite.caseCount} 用例</span>
                            {suite.categories?.length ? <span className="preview-test-categories">{suite.categories.join('、')}</span> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </details>
          )}
          {!!planned?.plan?.conflicts?.length && (
            <div className="data-template-error" role="alert">
              发现 {planned.plan.conflicts.length} 个资源冲突：{planned.plan.conflicts.map((item: any) => item.message).join('；')}
            </div>
          )}
          {hasUnsavedChanges && <div className="data-template-unsaved" role="status">当前有未保存的数据修改；推荐和预览基于上次保存的数据。</div>}
          {error && <div className="data-template-error" role="alert">{error}</div>}
          {installedAnalysis && (
            <div className="data-template-recovery" role="status">
              <strong>模板已安装，分析尚未完成</strong>
              <span>{installedAnalysis.message}</span>
              <div>
                <button type="button" className="ui-btn ui-btn-primary" onClick={() => void retryInstalledAnalysis()} disabled={creating}>重试运行</button>
                <button type="button" className="ui-btn" onClick={() => { onClose(); onOpenAdvanced('results'); }}>查看已安装实例</button>
              </div>
            </div>
          )}
        </section>
      </div>
      <ModalFooter>
        <button type="button" className="ui-btn" onClick={() => { onClose(); onOpenAdvanced('library'); }}>高级配置</button>
        <button type="button" className="ui-btn" onClick={onClose}>取消</button>
        {installedAnalysis ? (
          <button type="button" className="ui-btn" onClick={() => { onClose(); onOpenAdvanced('results'); }}>关闭并查看实例</button>
        ) : hasUnsavedChanges ? (
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => void saveFirst()} disabled={creating}>{creating ? '保存中…' : '先保存数据'}</button>
        ) : (
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => void apply()} disabled={!planned || creating || !!planned?.plan?.conflicts?.length}>
            {creating ? '创建中…' : '创建并打开'}
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}
