/**
 * DiagnosticPanel — unified error/warning/info panel with cause analysis and fix suggestions.
 * Replaces the basic DebugDrawer for form-level diagnostics.
 */
import React, { useMemo, useState } from 'react';
import type { FormDiagnostic } from '../services/formGeneration/formDiagnostics';
import { getDiagnosticExplanation, getDiagnosticCategory, type DiagnosticCategory } from '../services/formGeneration/diagnosticCategories';

interface DiagnosticPanelProps {
  diagnostics: FormDiagnostic[];
  open: boolean;
  onToggle: (next: boolean) => void;
  onJumpToComponent?: (componentId: string) => void;
  onApplyFix?: (diagnosticId: string, props: Record<string, unknown>) => void;
}

type SeverityFilter = 'all' | 'error' | 'warning' | 'info';

const SEVERITY_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  error: { label: '错误', color: '#dc2626', bg: 'rgba(220,38,38,0.06)', border: 'rgba(220,38,38,0.16)' },
  warning: { label: '警告', color: '#d97706', bg: 'rgba(217,119,6,0.06)', border: 'rgba(217,119,6,0.16)' },
  info: { label: '提示', color: '#0f766e', bg: 'rgba(15,118,110,0.06)', border: 'rgba(15,118,110,0.16)' },
};

export default function DiagnosticPanel({ diagnostics, open, onToggle, onJumpToComponent, onApplyFix }: DiagnosticPanelProps) {
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return diagnostics.filter((d) => {
      if (severity !== 'all' && d.severity !== severity) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = [d.title, d.detail, d.field, d.componentId].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [diagnostics, severity, search]);

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warnCount = diagnostics.filter((d) => d.severity === 'warning').length;
  const infoCount = diagnostics.filter((d) => d.severity === 'info').length;

  return (
    <div className="diagnostic-panel" data-open={open || undefined}>
      <div className="diagnostic-panel__header">
        <div className="diagnostic-panel__header-info">
          <strong className="diagnostic-panel__title">诊断</strong>
          <div className="diagnostic-panel__counts">
            {errorCount > 0 && <span className="diagnostic-pill diagnostic-pill--error">{errorCount} 错误</span>}
            {warnCount > 0 && <span className="diagnostic-pill diagnostic-pill--warning">{warnCount} 警告</span>}
            {infoCount > 0 && <span className="diagnostic-pill diagnostic-pill--info">{infoCount} 提示</span>}
            {diagnostics.length === 0 && <span className="diagnostic-pill diagnostic-pill--ok">无问题</span>}
          </div>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn-xs"
          aria-expanded={open}
          onClick={() => onToggle(!open)}
        >
          {open ? '收起' : '展开'}
        </button>
      </div>

      {open && (
        <>
          <div className="diagnostic-panel__filters">
            <input
              className="diagnostic-panel__search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索错误、字段、控件…"
              aria-label="搜索诊断"
            />
            <div className="diagnostic-panel__severity-tabs">
              {(['all', 'error', 'warning', 'info'] as SeverityFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`diagnostic-tab ${severity === s ? 'diagnostic-tab--active' : ''}`}
                  onClick={() => setSeverity(s)}
                >
                  {s === 'all' ? `全部 (${diagnostics.length})` : `${SEVERITY_META[s].label} (${diagnostics.filter((d) => d.severity === s).length})`}
                </button>
              ))}
            </div>
          </div>

          <div className="diagnostic-panel__list">
            {filtered.length === 0 ? (
              <div className="diagnostic-panel__empty">
                {diagnostics.length === 0 ? '✅ 没有发现问题' : '没有匹配的诊断'}
              </div>
            ) : (
              filtered.map((d) => {
                const expanded = expandedId === d.id;
                const meta = SEVERITY_META[d.severity] || SEVERITY_META.info;
                const explanation = getDiagnosticExplanation(d.id);
                const category = getDiagnosticCategory(d.id);

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
                        <span className="diagnostic-category-badge">{category.icon} {category.label}</span>
                      </div>
                      <div className="diagnostic-item__title">{d.title}</div>
                      {d.field && <div className="diagnostic-item__field">字段: {d.field}</div>}
                      <div className="diagnostic-item__toggle">{expanded ? '收起' : '详情'}</div>
                    </div>

                    {expanded && (
                      <div className="diagnostic-item__body">
                        <div className="diagnostic-item__detail">{d.detail}</div>

                        {explanation && (
                          <>
                            <div className="diagnostic-item__section">
                              <div className="diagnostic-item__section-label">原因</div>
                              <div className="diagnostic-item__section-text">{explanation.cause}</div>
                            </div>
                            <div className="diagnostic-item__section">
                              <div className="diagnostic-item__section-label">影响</div>
                              <div className="diagnostic-item__section-text">{explanation.impact}</div>
                            </div>
                          </>
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
                          {d.quickFix && (
                            <button
                              type="button"
                              className="ui-btn ui-btn-xs ui-btn-primary diagnostic-action"
                              onClick={() => onApplyFix?.(d.id, d.quickFix!.props)}
                            >
                              {d.quickFix.label}
                            </button>
                          )}
                          {explanation?.fixes.map((fix, i) => (
                            <button
                              key={i}
                              type="button"
                              className={`ui-btn ui-btn-xs ${fix.auto ? 'ui-btn-primary' : ''} diagnostic-action`}
                              onClick={() => {
                                if (fix.props && onApplyFix) onApplyFix(d.id, fix.props);
                              }}
                              title={fix.description}
                            >
                              {fix.label}
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
        </>
      )}
    </div>
  );
}
