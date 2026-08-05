/**
 * DiagnosticPanel — unified error/warning/info panel with cause analysis and fix suggestions.
 * Shows both design-time diagnostics and runtime errors.
 */
import React from 'react';
import { useMemo, useState } from 'react';
import type { FormDiagnostic } from '../services/formGeneration/formDiagnostics';
import { getDiagnosticExplanation, getDiagnosticCategory } from '../services/formGeneration/diagnosticCategories';
import type { ManagedError, ErrorCategory, ErrorFix } from '../services/engine/errorManager';
import CollapsiblePanel from './CollapsiblePanel';

interface DiagnosticPanelProps {
  diagnostics: FormDiagnostic[];
  runtimeErrors?: ManagedError[];
  open: boolean;
  onToggle: (next: boolean) => void;
  onJumpToComponent?: (componentId: string) => void;
  onApplyFix?: (diagnostic: FormDiagnostic) => void;
  onFixAll?: (diagnostics: FormDiagnostic[]) => void;
  onRuntimeFix?: (error: ManagedError, fix: ErrorFix) => void;
}

type SeverityFilter = 'all' | 'error' | 'warning' | 'info';
type SourceFilter = 'all' | 'design' | 'runtime';

interface UnifiedEntry {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  field?: string;
  componentId?: string;
  source: 'design' | 'runtime';
  category?: string;
  cause?: string;
  impact?: string;
  diagnostic?: FormDiagnostic;
  fixes?: Array<{ label: string; description: string }>;
  runtimeError?: ManagedError;
}

const SEVERITY_META: Record<string, { label: string; color: string; bg: string }> = {
  error: { label: '错误', color: '#dc2626', bg: 'rgba(220,38,38,0.06)' },
  warning: { label: '警告', color: '#d97706', bg: 'rgba(217,119,6,0.06)' },
  info: { label: '提示', color: '#0f766e', bg: 'rgba(15,118,110,0.06)' },
};

const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: '全部来源',
  design: '设计时',
  runtime: '运行时',
};

const CATEGORY_LABELS: Record<ErrorCategory, { label: string; icon: string }> = {
  'data-binding': { label: '数据绑定', icon: '🔗' },
  expression: { label: '表达式', icon: '📝' },
  workflow: { label: '流程', icon: '⚙' },
  validation: { label: '校验', icon: '✓' },
  runtime: { label: '运行时', icon: '🔄' },
  network: { label: '网络', icon: '🌐' },
  permission: { label: '权限', icon: '🔒' },
  render: { label: '渲染', icon: '🖼' },
  unknown: { label: '其他', icon: '❓' },
};

export default function DiagnosticPanel({ diagnostics, runtimeErrors = [], open, onToggle, onJumpToComponent, onApplyFix, onFixAll, onRuntimeFix }: DiagnosticPanelProps) {
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Unify design-time diagnostics and runtime errors
  const allEntries = useMemo<UnifiedEntry[]>(() => {
    const designEntries: UnifiedEntry[] = diagnostics.map((d) => ({
      id: d.id,
      severity: d.severity,
      title: d.title,
      detail: d.detail,
      field: d.field,
      componentId: d.componentId,
      source: 'design' as const,
      category: getDiagnosticCategory(d.id).label,
      cause: getDiagnosticExplanation(d.id)?.cause,
      impact: getDiagnosticExplanation(d.id)?.impact,
      diagnostic: d,
      fixes: getDiagnosticExplanation(d.id)?.fixes,
    }));

    const runtimeEntries: UnifiedEntry[] = runtimeErrors.map((e) => ({
      id: e.id,
      severity: e.severity === 'warn' ? 'warning' : e.severity === 'debug' ? 'info' : e.severity,
      title: e.title,
      detail: e.message,
      field: e.field,
      componentId: e.componentId,
      source: 'runtime' as const,
      category: CATEGORY_LABELS[e.category]?.label || e.category,
      cause: e.cause,
      impact: e.impact,
      fixes: e.fixes,
      runtimeError: e,
    }));

    return [...designEntries, ...runtimeEntries].sort((a, b) => {
      const sevOrder = { error: 0, warning: 1, info: 2 };
      return (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3);
    });
  }, [diagnostics, runtimeErrors]);

  const filtered = useMemo(() => {
    return allEntries.filter((d) => {
      if (severity !== 'all' && d.severity !== severity) return false;
      if (source !== 'all' && d.source !== source) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = [d.title, d.detail, d.field, d.componentId, d.category].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allEntries, severity, source, search]);

  const errorCount = allEntries.filter((d) => d.severity === 'error').length;
  const warnCount = allEntries.filter((d) => d.severity === 'warning').length;
  const fixableCount = diagnostics.filter((d) => d.quickFix && d.quickFix.auto !== false).length;

  const badge = (
    <>
      {errorCount > 0 && <span className="diagnostic-pill diagnostic-pill--error">{errorCount} 错误</span>}
      {warnCount > 0 && <span className="diagnostic-pill diagnostic-pill--warning">{warnCount} 警告</span>}
      {allEntries.length === 0 && <span className="diagnostic-pill diagnostic-pill--ok">无问题</span>}
    </>
  );

  return (
    <CollapsiblePanel
      title="诊断"
      subtitle={`${filtered.length} / ${allEntries.length} 条`}
      badge={badge}
      open={open}
      onToggle={onToggle}
      className="diagnostic-panel"
      actions={
        <button
          type="button"
          className="ui-btn ui-btn-xs ui-btn-primary diagnostic-fix-all"
          disabled={fixableCount === 0}
          title="依次尝试应用所有可自动修复的问题，无法自动修复的会保留提示"
          onClick={() => onFixAll?.(diagnostics)}
        >
          ✨ 一键尝试修复{fixableCount > 0 ? ` (${fixableCount})` : ''}
        </button>
      }
    >
      <div className="diagnostic-panel__filters">
        <input
          className="diagnostic-panel__search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索错误、字段、控件…"
          aria-label="搜索诊断"
        />
        <div className="diagnostic-panel__filter-row">
          <div className="diagnostic-panel__severity-tabs">
            {(['all', 'error', 'warning', 'info'] as SeverityFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`diagnostic-tab ${severity === s ? 'diagnostic-tab--active' : ''}`}
                onClick={() => setSeverity(s)}
              >
                {s === 'all' ? `全部` : SEVERITY_META[s].label}
              </button>
            ))}
          </div>
          <div className="diagnostic-panel__source-tabs">
            {(['all', 'design', 'runtime'] as SourceFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`diagnostic-tab ${source === s ? 'diagnostic-tab--active' : ''}`}
                onClick={() => setSource(s)}
              >
                {SOURCE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="diagnostic-panel__list">
        {filtered.length === 0 ? (
          <div className="diagnostic-panel__empty">
            {allEntries.length === 0 ? '✅ 没有发现问题' : '没有匹配的诊断'}
          </div>
        ) : (
          filtered.map((d) => {
            const expanded = expandedId === d.id;
            const meta = SEVERITY_META[d.severity] || SEVERITY_META.info;

            return (
              <div
                key={d.id}
                className={`diagnostic-item ${expanded ? 'diagnostic-item--expanded' : ''}`}
                style={{ borderLeftColor: meta.color }}
              >
                <div
                  className="diagnostic-item__header"
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(expanded ? null : d.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(expanded ? null : d.id); } }}
                >
                  <div className="diagnostic-item__badges">
                    <span className="diagnostic-pill" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                    {d.category && <span className="diagnostic-category-badge">{d.category}</span>}
                    <span className="diagnostic-source-badge">{d.source === 'design' ? '设计' : '运行'}</span>
                  </div>
                  <div className="diagnostic-item__title">{d.title}</div>
                  {d.field && <div className="diagnostic-item__field">字段: {d.field}</div>}
                  <div className="diagnostic-item__toggle">{expanded ? '收起' : '详情'}</div>
                </div>

                {expanded && (
                  <div className="diagnostic-item__body">
                    {d.detail && <div className="diagnostic-item__detail">{d.detail}</div>}

                    {d.cause && (
                      <div className="diagnostic-item__section">
                        <div className="diagnostic-item__section-label">原因</div>
                        <div className="diagnostic-item__section-text">{d.cause}</div>
                      </div>
                    )}
                    {d.impact && (
                      <div className="diagnostic-item__section">
                        <div className="diagnostic-item__section-label">影响</div>
                        <div className="diagnostic-item__section-text">{d.impact}</div>
                      </div>
                    )}

                    <div className="diagnostic-item__actions">
                      {d.componentId && (
                        <button
                          type="button"
                          className="ui-btn ui-btn-xs diagnostic-action"
                          onClick={() => onJumpToComponent?.(d.componentId!)}
                        >
                          定位控件
                        </button>
                      )}
                      {d.diagnostic?.quickFix && (
                        <button
                          type="button"
                          className="ui-btn ui-btn-xs ui-btn-primary diagnostic-action"
                          title={d.diagnostic.quickFix.description}
                          onClick={() => onApplyFix?.(d.diagnostic!)}
                        >
                          尝试修复：{d.diagnostic.quickFix.label}
                        </button>
                      )}
                      {d.fixes?.map((fix, i) => (
                        <button
                          key={i}
                          type="button"
                          className={`ui-btn ui-btn-xs diagnostic-action ${(fix as ErrorFix).auto ? 'diagnostic-action--auto' : ''}`}
                          title={fix.description}
                          onClick={d.runtimeError ? () => onRuntimeFix?.(d.runtimeError!, fix as ErrorFix) : undefined}
                        >
                          {fix.label}{(fix as ErrorFix).auto ? ' ✨' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </CollapsiblePanel>
  );
}
