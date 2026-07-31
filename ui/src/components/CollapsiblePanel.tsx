/**
 * CollapsiblePanel — shared shell for all debug/inspector panels.
 * Provides header with title, subtitle, badge, and expand/collapse toggle.
 */
import React from 'react';

interface CollapsiblePanelProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  open: boolean;
  onToggle: (next: boolean) => void;
  className?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function CollapsiblePanel({ title, subtitle, badge, open, onToggle, className = '', children, actions }: CollapsiblePanelProps) {
  return (
    <div className={`collapsible-panel ${className}`} data-open={open || undefined}>
      <div className="collapsible-panel__header">
        <div className="collapsible-panel__header-info">
          <strong className="collapsible-panel__title">{title}</strong>
          <div className="collapsible-panel__meta">
            {subtitle && <span className="collapsible-panel__subtitle">{subtitle}</span>}
            {badge}
          </div>
        </div>
        <div className="collapsible-panel__actions">
          {actions}
          <button
            type="button"
            className="ui-btn ui-btn-xs"
            aria-expanded={open}
            onClick={() => onToggle(!open)}
          >
            {open ? '收起' : '展开'}
          </button>
        </div>
      </div>
      {open && <div className="collapsible-panel__body">{children}</div>}
    </div>
  );
}
