import React from 'react';
import type { FlowPreview, PreviewNode, PreviewEdge } from '../services/io/docs/flow-previews';

interface FlowPreviewCanvasProps {
  preview: FlowPreview;
  className?: string;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;
const KIND_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  scenario: { bg: '#f0fdfa', border: '#14b8a6', text: '#0f766e' },
  generic: { bg: '#fff7ed', border: '#f97316', text: '#9a3412' },
  behavior: { bg: '#faf5ff', border: '#a855f7', text: '#7e22ce' },
  'xlsx-method': { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
  ml: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
};

function getNodeCenter(node: PreviewNode): { x: number; y: number } {
  return {
    x: node.x + NODE_WIDTH / 2,
    y: node.y + NODE_HEIGHT / 2,
  };
}

function getNodeRight(node: PreviewNode): { x: number; y: number } {
  return {
    x: node.x + NODE_WIDTH,
    y: node.y + NODE_HEIGHT / 2,
  };
}

function getNodeLeft(node: PreviewNode): { x: number; y: number } {
  return {
    x: node.x,
    y: node.y + NODE_HEIGHT / 2,
  };
}

function renderEdge(edge: PreviewEdge, nodes: PreviewNode[], index: number) {
  const fromNode = nodes.find((n) => n.id === edge.from);
  const toNode = nodes.find((n) => n.id === edge.to);
  if (!fromNode || !toNode) return null;

  const start = getNodeRight(fromNode);
  const end = getNodeLeft(toNode);
  const midX = (start.x + end.x) / 2;

  const path = `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;

  return (
    <g key={`edge-${index}`}>
      <path
        d={path}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={1.5}
        strokeDasharray={edge.label ? '4 2' : 'none'}
        markerEnd="url(#arrowhead)"
      />
      {edge.label && (
        <text
          x={midX}
          y={(start.y + end.y) / 2 - 6}
          textAnchor="middle"
          fontSize={10}
          fill="#64748b"
          fontFamily="ui-monospace, monospace"
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}

function renderNode(node: PreviewNode, index: number) {
  const colors = KIND_COLORS[node.kind] || KIND_COLORS.generic;
  const lines = node.label.split('\n');

  return (
    <g key={`node-${index}`}>
      <rect
        x={node.x}
        y={node.y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={8}
        fill={colors.bg}
        stroke={colors.border}
        strokeWidth={1.5}
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={node.x + NODE_WIDTH / 2}
          y={node.y + NODE_HEIGHT / 2 + (i - (lines.length - 1) / 2) * 16}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fontWeight={500}
          fill={colors.text}
          fontFamily="system-ui, sans-serif"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

export default function FlowPreviewCanvas({ preview, className }: FlowPreviewCanvasProps) {
  // 计算画布大小
  const maxX = Math.max(...preview.nodes.map((n) => n.x + NODE_WIDTH)) + 40;
  const maxY = Math.max(...preview.nodes.map((n) => n.y + NODE_HEIGHT)) + 40;

  return (
    <div className={`flow-preview-canvas ${className || ''}`}>
      <div className="flow-preview-title">{preview.title}</div>
      <svg
        width="100%"
        viewBox={`0 0 ${maxX} ${maxY}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ maxWidth: maxX }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
          </marker>
        </defs>
        {preview.edges.map((edge, i) => renderEdge(edge, preview.nodes, i))}
        {preview.nodes.map((node, i) => renderNode(node, i))}
      </svg>
    </div>
  );
}
