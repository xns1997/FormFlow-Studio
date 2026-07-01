import React, { useEffect, useRef } from 'react';
import { type ResizeHandle, useDesigner } from './useDesigner';
import { DesignerIcon } from './icons';
import { PreviewCanvas } from './PreviewCanvas';
import { useProjectStore } from '../project/store';

interface Props {
  designer: ReturnType<typeof useDesigner>;
}

export function DesignCanvas({ designer }: Props) {
  const { containerRef, initGraph, mode } = designer;
  const lastPlacementRef = useRef<{ type: string; x: number; y: number; at: number } | null>(null);
  const workflows = useProjectStore((state) => state.project?.workflows || []);
  const tables = useProjectStore((state) => state.project?.srcTable || []);

  useEffect(() => { initGraph(); }, [initGraph]);

  const placeControl = (type: string, clientX: number, clientY: number) => {
    if (mode === 'preview') return;
    const graph = designer.graphRef.current;
    if (!graph) return;
    const localPoint = graph.clientToLocal(clientX, clientY);
    const x = Math.round(localPoint.x / 12) * 12;
    const y = Math.round(localPoint.y / 12) * 12;
    const last = lastPlacementRef.current;
    const now = Date.now();
    if (last && last.type === type && last.x === x && last.y === y && now - last.at < 300) return;
    lastPlacementRef.current = { type, x, y, at: now };
    designer.addComponent(type, x, y);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (mode === 'preview') return;
    const type = e.dataTransfer.getData('control-type') || e.dataTransfer.getData('text/plain');
    if (!type) return;
    placeControl(type, e.clientX, e.clientY);
  };

  const resizeHandles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  return (
    <div
      className={`designer-canvas-shell ${mode === 'preview' ? 'mode-preview' : ''}`}
      onDragEnter={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={handleDrop}
    >
      <div className="canvas-floating-toolbar" aria-label="画布工具">
        {/* 模式切换 */}
        <button
          type="button"
          className={`mode-toggle ${mode === 'preview' ? 'active' : ''}`}
          onClick={designer.toggleMode}
          title={mode === 'preview' ? '切换到设计模式' : '切换到预览模式'}
        >
          <DesignerIcon name={mode === 'preview' ? 'design' : 'preview'} />
          {mode === 'preview' ? '设计' : '预览'}
        </button>
        <span />
        {mode === 'design' && (
          <>
            <button type="button" onClick={designer.undo} title="撤销"><DesignerIcon name="undo" /></button>
            <button type="button" onClick={designer.redo} title="重做"><DesignerIcon name="redo" /></button>
            <span />
            <button type="button" onClick={designer.copy} title="复制"><DesignerIcon name="copy" /></button>
            <button type="button" onClick={designer.paste} title="粘贴"><DesignerIcon name="paste" /></button>
            <button type="button" onClick={designer.duplicate} title="复制一份"><DesignerIcon name="duplicate" /></button>
            <button type="button" onClick={designer.deleteSelected} title="删除"><DesignerIcon name="delete" /></button>
            <span />
            <button type="button" onClick={designer.bringToFront} title="置顶"><DesignerIcon name="bringToFront" /></button>
            <button type="button" onClick={designer.sendToBack} title="置底"><DesignerIcon name="sendToBack" /></button>
            <span />
          </>
        )}
        <button type="button" onClick={designer.zoomOut} title="缩小"><DesignerIcon name="zoomOut" /></button>
        <strong>{Math.round(designer.zoom * 100)}%</strong>
        <button type="button" onClick={designer.zoomIn} title="放大"><DesignerIcon name="zoomIn" /></button>
        <button type="button" onClick={designer.fitContent} title="适应内容"><DesignerIcon name="fitContent" /></button>
        <button type="button" onClick={designer.resetView} title="重置视图"><DesignerIcon name="resetView" /></button>
      </div>
      <div className="canvas-status-pill">
        {mode === 'preview'
          ? '预览模式 · 可交互不可编辑 · 点击左上角切换'
          : '右键拖动画布 · ⌘/Ctrl+滚轮缩放 · 方向键微调'
        }
      </div>
      <div
        ref={containerRef}
        className={`designer-canvas ${mode === 'preview' ? 'designer-canvas-hidden' : ''}`}
        aria-hidden={mode === 'preview'}
      />
      {mode === 'preview' && (
        <PreviewCanvas components={designer.components} zoom={designer.zoom} workflows={workflows} tables={tables} />
      )}
      {mode === 'design' && designer.selectionOverlay && (
        <div
          className="designer-selection-overlay"
          style={{
            left: designer.selectionOverlay.left,
            top: designer.selectionOverlay.top,
            width: designer.selectionOverlay.width,
            height: designer.selectionOverlay.height,
          }}
        >
          {resizeHandles.map((handle) => (
            <button
              key={handle}
              type="button"
              aria-label={`resize-${handle}`}
              className={`designer-resize-handle handle-${handle}`}
              onPointerDown={(event) => designer.startResize(handle, event)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
