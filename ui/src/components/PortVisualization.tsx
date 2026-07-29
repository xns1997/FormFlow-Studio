import React, { useState } from 'react';

interface Port {
  name: string;
  label: string;
  type: string;
  direction: 'input' | 'output' | 'both';
  required?: boolean;
  description: string;
}

interface PortVisualizationProps {
  label: string;
  description: string;
  inputs: Port[];
  outputs: Port[];
  className?: string;
}

/** 端口类型颜色映射 */
const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  // Object-like
  object: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  workbook: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  worksheet: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  cell: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  range: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  'cell-ref': { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  options: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  filter: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  'sort-config': { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  style: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  'validation-rule': { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  // Array-like
  array: { bg: '#dcfce7', border: '#86efac', text: '#166534' },
  'json-rows': { bg: '#dcfce7', border: '#86efac', text: '#166534' },
  aoa: { bg: '#dcfce7', border: '#86efac', text: '#166534' },
  headers: { bg: '#dcfce7', border: '#86efac', text: '#166534' },
  // String-like
  string: { bg: '#f3e8ff', border: '#c084fc', text: '#6b21a8' },
  address: { bg: '#f3e8ff', border: '#c084fc', text: '#6b21a8' },
  'csv-string': { bg: '#f3e8ff', border: '#c084fc', text: '#6b21a8' },
  'html-string': { bg: '#f3e8ff', border: '#c084fc', text: '#6b21a8' },
  'json-string': { bg: '#f3e8ff', border: '#c084fc', text: '#6b21a8' },
  // Number-like
  number: { bg: '#fff7ed', border: '#fdba74', text: '#9a3412' },
  boolean: { bg: '#fff7ed', border: '#fdba74', text: '#9a3412' },
  // File-like
  'file-data': { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
  // Code
  code: { bg: '#f1f5f9', border: '#94a3b8', text: '#334155' },
  // Any
  any: { bg: '#f1f5f9', border: '#cbd5e1', text: '#475569' },
  // Special
  enum: { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
  color: { bg: '#fce7f3', border: '#f9a8d4', text: '#9d174d' },
  trigger: { bg: '#e0e7ff', border: '#a5b4fc', text: '#3730a3' },
  'port-definition': { bg: '#e0e7ff', border: '#a5b4fc', text: '#3730a3' },
};

function getTypeColor(type: string) {
  return TYPE_COLORS[type] || TYPE_COLORS.any;
}

function PortBadge({ type }: { type: string }) {
  const color = getTypeColor(type);
  return (
    <span
      className="port-viz-badge"
      style={{
        background: color.bg,
        borderColor: color.border,
        color: color.text,
      }}
    >
      {type}
    </span>
  );
}

function PortItem({ port, side }: { port: Port; side: 'left' | 'right' }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className={`port-viz-item port-viz-item--${side}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="port-viz-item-main">
        {side === 'left' && (
          <span className={`port-viz-dot port-viz-dot--${port.direction}`} />
        )}
        <span className="port-viz-label">
          {port.required && <span className="port-viz-required">*</span>}
          {port.label}
        </span>
        <PortBadge type={port.type} />
        {side === 'right' && (
          <span className={`port-viz-dot port-viz-dot--${port.direction}`} />
        )}
      </div>
      {showTooltip && (
        <div className="port-viz-tooltip">
          <div className="port-viz-tooltip-name">{port.name}</div>
          <div className="port-viz-tooltip-desc">{port.description}</div>
          <div className="port-viz-tooltip-meta">
            类型: {port.type} | 方向: {port.direction}
            {port.required ? ' | 必填' : ''}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PortVisualization({
  label,
  description,
  inputs,
  outputs,
  className,
}: PortVisualizationProps) {
  return (
    <div className={`port-viz ${className || ''}`}>
      <div className="port-viz-header">
        <div className="port-viz-title">{label}</div>
        <div className="port-viz-desc">{description}</div>
      </div>
      <div className="port-viz-body">
        <div className="port-viz-col port-viz-col--input">
          <div className="port-viz-col-header">输入端口</div>
          {inputs.length === 0 ? (
            <div className="port-viz-empty">无输入端口</div>
          ) : (
            inputs.map((port) => (
              <PortItem key={port.name} port={port} side="left" />
            ))
          )}
        </div>
        <div className="port-viz-divider" />
        <div className="port-viz-col port-viz-col--output">
          <div className="port-viz-col-header">输出端口</div>
          {outputs.length === 0 ? (
            <div className="port-viz-empty">无输出端口</div>
          ) : (
            outputs.map((port) => (
              <PortItem key={port.name} port={port} side="right" />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
