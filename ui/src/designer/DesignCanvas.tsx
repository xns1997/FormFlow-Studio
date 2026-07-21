import React, { useEffect, useRef, useState } from 'react';
import { type ResizeHandle, useDesigner } from './useDesigner';
import { DesignerIcon } from './icons';
import { PreviewCanvas } from './PreviewCanvas';
import { useProjectStore } from '../project/store';
import Modal, { ModalFooter, ModalHeader } from '../components/Modal';
import { AntdCompatSelect } from '../components/AntdFormControls';
import {
  controlOptionsFromSamples,
  FIELD_DROP_COMMITTED_EVENT,
  recommendControls,
  recommendedControl,
  type DataFieldDragItem,
} from '../services/formGeneration/fieldControlRecommendation';
import { getCanvasToolbarAvailability } from './canvasToolbarModel';

interface Props {
  designer: ReturnType<typeof useDesigner>;
  readOnly?: boolean;
  hideToolbar?: boolean;
  formId?: string;
}

export function DesignCanvas({ designer, readOnly = false, hideToolbar = false, formId }: Props) {
  const { containerRef, initGraph, mode } = designer;
  const lastPlacementRef = useRef<{ type: string; x: number; y: number; at: number } | null>(null);
  const workflows = useProjectStore((state) => state.project?.workflows || []);
  const tables = useProjectStore((state) => state.project?.srcTable || []);
  const [pendingFieldDrop, setPendingFieldDrop] = useState<{
    fields: DataFieldDragItem[];
    point: { x: number; y: number };
    choices: Record<string, string>;
  } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const toolbarAvailability = getCanvasToolbarAvailability(designer);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof PointerEvent && moreMenuRef.current?.contains(event.target as Node)) return;
      setMoreOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [moreOpen]);

  const fieldKey = (item: DataFieldDragItem) => `${item.tableId}:${item.sheetName}:${item.column.name}`;

  useEffect(() => {
    let mountedGraph: any = null;
    const raf = requestAnimationFrame(() => {
      initGraph();
      const graph = designer.graphRef.current;
      if (!graph) return;
      mountedGraph = graph;
    });
    return () => {
      cancelAnimationFrame(raf);
      designer.resizeObserverRef.current?.disconnect();
      designer.resizeObserverRef.current = null;
      if (mountedGraph && designer.graphRef.current === mountedGraph) {
        designer.graphRef.current = null;
        // X6 React shape owns nested React roots. Dispose after the current
        // React commit so those roots are not synchronously unmounted mid-render.
        queueMicrotask(() => mountedGraph.dispose());
      }
    };
  }, [initGraph]);

  useEffect(() => {
    const applyInteractionMode = () => {
      const graph = designer.graphRef.current;
      if (!graph) return false;
      graph.options.interacting = readOnly ? { nodeMovable: false, edgeMovable: false } : { nodeMovable: true, edgeMovable: false };
      if (readOnly) {
        graph.disableKeyboard();
        graph.disableClipboard();
        graph.disableHistory();
      } else {
        graph.enableKeyboard();
        graph.enableClipboard();
        graph.enableHistory();
      }
      return true;
    };
    if (applyInteractionMode()) return;
    const raf = requestAnimationFrame(applyInteractionMode);
    return () => cancelAnimationFrame(raf);
  }, [designer.graphRef, readOnly]);

  const placeControl = (type: string, clientX: number, clientY: number) => {
    if (mode === 'preview' || readOnly) return;
    const graph = designer.graphRef.current;
    if (!graph) return;
    const localPoint = graph.clientToLocal(clientX, clientY);
    const x = Math.round(localPoint.x / 12) * 12;
    const y = Math.round(localPoint.y / 12) * 12;
    const last = lastPlacementRef.current;
    const now = Date.now();
    if (last && last.type === type && last.x === x && last.y === y && now - last.at < 300) return;
    lastPlacementRef.current = { type, x, y, at: now };
    designer.addComponent(type, x, y, localPoint);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (mode === 'preview' || readOnly) return;
    const fieldPayload = e.dataTransfer.getData('application/formflow-fields');
    if (fieldPayload) {
      try {
        const fields = JSON.parse(fieldPayload) as DataFieldDragItem[];
        const graph = designer.graphRef.current;
        if (!graph || !Array.isArray(fields) || fields.length === 0) return;
        const point = graph.clientToLocal(e.clientX, e.clientY);
        setPendingFieldDrop({
          fields,
          point,
          choices: Object.fromEntries(fields.map((item) => [fieldKey(item), recommendedControl(item.column).type])),
        });
      } catch { /* Ignore malformed external drag payloads. */ }
      return;
    }
    const type = e.dataTransfer.getData('control-type') || e.dataTransfer.getData('text/plain');
    if (!type) return;
    placeControl(type, e.clientX, e.clientY);
  };

  const confirmFieldDrop = () => {
    if (!pendingFieldDrop) return;
    let createdCount = 0;
    pendingFieldDrop.fields.forEach((item, index) => {
      const type = pendingFieldDrop.choices[fieldKey(item)] || recommendedControl(item.column).type;
      const point = { x: pendingFieldDrop.point.x, y: pendingFieldDrop.point.y + index * 76 };
      const options = controlOptionsFromSamples(item, type);
      const props = {
        name: item.column.name,
        label: item.column.name,
        required: item.column.nullable === false,
        ...(options ? { options } : {}),
        dataBinding: {
          version: 1,
          source: { kind: 'tableCell', tableId: item.tableId, sheetName: item.sheetName, column: item.column.name },
          direction: 'twoWay',
          valueMode: 'firstCell',
        },
      };
      const id = designer.addComponent(
        type,
        Math.round(point.x / 12) * 12,
        Math.round(point.y / 12) * 12,
        point,
        props,
      );
      if (id) createdCount += 1;
    });
    if (createdCount > 0) window.dispatchEvent(new Event(FIELD_DROP_COMMITTED_EVENT));
    setPendingFieldDrop(null);
  };

  const resizeHandles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  return (
    <div
      className={`designer-canvas-shell ${mode === 'preview' ? 'mode-preview' : ''} ${readOnly ? 'mode-readonly' : ''}`}
      onDragEnter={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={handleDrop}
    >
      {!hideToolbar && <div className="canvas-floating-toolbar" role="toolbar" aria-label="画布工具">
        <div className="toolbar-group toolbar-group-mode">
          <button
            type="button"
            className={`mode-toggle ${mode === 'preview' ? 'active' : ''}`}
            onClick={designer.toggleMode}
            title={mode === 'preview' ? '切换到设计模式' : '切换到预览模式'}
            aria-label={mode === 'preview' ? '切换到设计模式' : '预览表单'}
            aria-pressed={mode === 'preview'}
          >
            <DesignerIcon name={mode === 'preview' ? 'design' : 'preview'} />
            {mode === 'preview' ? '设计' : '预览'}
          </button>
        </div>
        {mode === 'design' && (
          <>
            <div className="toolbar-group toolbar-history-actions">
              <button type="button" onClick={designer.undo} disabled={!toolbarAvailability.undo} title="撤销（⌘/Ctrl+Z）" aria-label="撤销"><DesignerIcon name="undo" /></button>
              <button type="button" onClick={designer.redo} disabled={!toolbarAvailability.redo} title="重做（⇧⌘Z / Ctrl+Y）" aria-label="重做"><DesignerIcon name="redo" /></button>
            </div>
            <div className="toolbar-group toolbar-selection-actions">
              <button type="button" onClick={designer.copy} disabled={!toolbarAvailability.copy} title="复制（⌘/Ctrl+C）" aria-label="复制所选控件"><DesignerIcon name="copy" /></button>
              <button type="button" onClick={designer.paste} disabled={!toolbarAvailability.paste} title="粘贴（⌘/Ctrl+V）" aria-label="粘贴控件"><DesignerIcon name="paste" /></button>
              <button type="button" onClick={designer.duplicate} disabled={!toolbarAvailability.duplicate} title="复制一份（⌘/Ctrl+D）" aria-label="复制一份所选控件"><DesignerIcon name="duplicate" /></button>
              <button type="button" className="is-danger" onClick={designer.deleteSelected} disabled={!toolbarAvailability.delete} title="删除（Delete）" aria-label="删除所选控件"><DesignerIcon name="delete" /></button>
            </div>
            <div className="toolbar-group toolbar-selection-actions">
              <button type="button" onClick={designer.bringToFront} disabled={!toolbarAvailability.layer} title="移到最前" aria-label="将所选控件移到最前"><DesignerIcon name="bringToFront" /></button>
              <button type="button" onClick={designer.sendToBack} disabled={!toolbarAvailability.layer} title="移到最后" aria-label="将所选控件移到最后"><DesignerIcon name="sendToBack" /></button>
            </div>
          </>
        )}
        <span className="toolbar-spacer" />
        <div className="toolbar-group toolbar-group-zoom">
          <button type="button" onClick={designer.zoomOut} title="缩小（⌘/Ctrl+-）" aria-label="缩小画布"><DesignerIcon name="zoomOut" /></button>
          <span className="zoom-value" aria-label={`当前缩放 ${Math.round(designer.zoom * 100)}%`}>{Math.round(designer.zoom * 100)}%</span>
          <button type="button" onClick={designer.zoomIn} title="放大（⌘/Ctrl++）" aria-label="放大画布"><DesignerIcon name="zoomIn" /></button>
          <button type="button" className="toolbar-view-extra" onClick={designer.fitContent} title="适应内容" aria-label="使内容适应画布"><DesignerIcon name="fitContent" /></button>
          <button type="button" className="toolbar-view-extra" onClick={designer.resetView} title="重置视图" aria-label="重置画布视图"><DesignerIcon name="resetView" /></button>
        </div>
        <div className="canvas-toolbar-more" ref={moreMenuRef}>
          <button type="button" className="canvas-toolbar-more-trigger" aria-label="更多画布命令" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}><DesignerIcon name="more" /></button>
          {moreOpen && <div className="canvas-toolbar-more-menu" role="menu">
            {mode === 'design' && <>
              <button type="button" role="menuitem" disabled={!toolbarAvailability.copy} onClick={() => { designer.copy(); setMoreOpen(false); }}><DesignerIcon name="copy" />复制</button>
              <button type="button" role="menuitem" disabled={!toolbarAvailability.paste} onClick={() => { designer.paste(); setMoreOpen(false); }}><DesignerIcon name="paste" />粘贴</button>
              <button type="button" role="menuitem" disabled={!toolbarAvailability.duplicate} onClick={() => { designer.duplicate(); setMoreOpen(false); }}><DesignerIcon name="duplicate" />复制一份</button>
              <button type="button" role="menuitem" disabled={!toolbarAvailability.layer} onClick={() => { designer.bringToFront(); setMoreOpen(false); }}><DesignerIcon name="bringToFront" />移到最前</button>
              <button type="button" role="menuitem" disabled={!toolbarAvailability.layer} onClick={() => { designer.sendToBack(); setMoreOpen(false); }}><DesignerIcon name="sendToBack" />移到最后</button>
              <button type="button" role="menuitem" className="is-danger" disabled={!toolbarAvailability.delete} onClick={() => { designer.deleteSelected(); setMoreOpen(false); }}><DesignerIcon name="delete" />删除</button>
            </>}
            <button type="button" role="menuitem" onClick={() => { designer.fitContent(); setMoreOpen(false); }}><DesignerIcon name="fitContent" />适应内容</button>
            <button type="button" role="menuitem" onClick={() => { designer.resetView(); setMoreOpen(false); }}><DesignerIcon name="resetView" />重置视图</button>
          </div>}
        </div>
      </div>}
      <div
        ref={containerRef}
        className={`designer-canvas ${mode === 'preview' ? 'designer-canvas-hidden' : ''}`}
        aria-hidden={mode === 'preview'}
      />
      {mode === 'preview' && (
        <PreviewCanvas formId={formId} components={designer.components} zoom={designer.zoom} workflows={workflows} tables={tables} />
      )}
      {mode === 'design' && !readOnly && designer.selectionOverlay && (
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
              aria-label={`调整尺寸：${handle}`}
              className={`designer-resize-handle handle-${handle}`}
              onPointerDown={(event) => designer.startResize(handle, event)}
            />
          ))}
        </div>
      )}
      <Modal
        open={!!pendingFieldDrop}
        onClose={() => setPendingFieldDrop(null)}
        width="720px"
        maxWidth="94vw"
        maxHeight="84vh"
        containerClassName="field-drop-modal"
      >
        <ModalHeader title="选择字段控件" onClose={() => setPendingFieldDrop(null)} />
        <div className="modal-body field-drop-review">
          <div className="field-drop-intro">
            <strong>已推荐合适的控件类型</strong>
            <span>确认前可以逐项改成文本框、下拉框或其他适合的控件，创建后会自动绑定原数据字段。</span>
          </div>
          <div className="field-drop-list">
            {pendingFieldDrop?.fields.map((item) => {
              const key = fieldKey(item);
              const recommendations = recommendControls(item.column);
              const selectedType = pendingFieldDrop.choices[key] || recommendations[0].type;
              const selected = recommendations.find((candidate) => candidate.type === selectedType) || recommendations[0];
              return <div className="field-drop-row" key={key}>
                <div className="field-drop-field">
                  <strong>{item.column.name}</strong>
                  <span>{item.tableName} / {item.sheetName}</span>
                  <small>{item.column.dataType}</small>
                </div>
                <label className="field-drop-control">
                  <span>控件类型</span>
                  <AntdCompatSelect
                    aria-label={`${item.column.name} 控件类型`}
                    value={selectedType}
                    onChange={(event) => setPendingFieldDrop((current) => current ? {
                      ...current,
                      choices: { ...current.choices, [key]: event.target.value },
                    } : current)}
                  >
                    {recommendations.map((candidate, index) => <option key={candidate.type} value={candidate.type}>{index === 0 ? '推荐 · ' : ''}{candidate.label}</option>)}
                  </AntdCompatSelect>
                  <small>{selected.reason}</small>
                </label>
              </div>;
            })}
          </div>
        </div>
        <ModalFooter>
          <button type="button" className="ui-btn" onClick={() => setPendingFieldDrop(null)}>取消</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={confirmFieldDrop}>创建并绑定 {pendingFieldDrop?.fields.length || 0} 个字段</button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
