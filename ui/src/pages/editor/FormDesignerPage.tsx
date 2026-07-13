import React, { useState, useEffect, useCallback } from 'react';
import '../../designer/controls';
import { useDesigner } from '../../designer/useDesigner';
import { DesignCanvas } from '../../designer/DesignCanvas';
import { LeftPanel } from '../../designer/LeftPanel';
import { PropertyPanel } from '../../designer/PropertyPanel';
import { TabBar } from '../../designer/TabBar';
import { useProjectStore } from '../../project/store';
import { useSharedDataStore } from '../../services/data/sharedDataStore';
import type { DesignFile } from '../../project/types';
import type { ComponentNode } from '../../models';
import { createDesignFile } from '../../project/types';
import { exportToComponentNodes } from '../../designer/export';
import Modal, { ModalHeader } from '../../components/Modal';
import type { LayoutDiagnostics } from '../../services/layout';

export default function FormDesignerPage() {
  const project = useProjectStore((s) => s.project);
  const store = useProjectStore((s) => s) as any;

  const [designs, setDesigns] = useState<DesignFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [interfaceNodes, setInterfaceNodes] = useState<ComponentNode[] | null>(null);
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null);
  const designer = useDesigner();

  useEffect(() => {
    if (project?.designs?.length) {
      setDesigns(project.designs);
      if (!activeId) setActiveId(project.designs[0].id);
    } else {
      const first = createDesignFile('设计 1');
      setDesigns([first]);
      setActiveId(first.id);
    }
  }, [project?.designs]);

  useEffect(() => {
    const design = designs.find((d) => d.id === activeId);
    if (design) designer.loadDesign(design);
  }, [activeId, designs, designer.loadDesign]);

  const handleSave = useCallback(() => {
    if (!activeId) return;
    const comps = designer.exportDesign();
    setDesigns((prev) => prev.map((d) => {
      if (d.id !== activeId) return d;
      return { ...d, components: comps, updatedAt: new Date().toISOString() };
    }));
    const updated = designs.find((d) => d.id === activeId);
    if (updated && store.addDesign) {
      const toSave = { ...updated, components: comps, updatedAt: new Date().toISOString() };
      store.addDesign(toSave).catch(() => {});
    }
  }, [activeId, designer, designs, store]);

  const handleCreate = useCallback((design: DesignFile) => {
    setDesigns((prev) => [...prev, design]);
    setActiveId(design.id);
  }, []);

  const handleClose = useCallback((id: string) => {
    setDesigns((prev) => {
      const next = prev.filter((d) => d.id !== id);
      if (activeId === id) setActiveId(next[0]?.id || null);
      return next;
    });
  }, [activeId]);

  const handleRename = useCallback((id: string, name: string) => {
    setDesigns((prev) => prev.map((d) => d.id === id ? { ...d, name } : d));
  }, []);

  const setPendingRowData = useSharedDataStore((s) => s.setPendingRowData);

  const handlePreview = useCallback(() => {
    const comps = designer.exportDesign();
    const nodes = exportToComponentNodes(comps);
    setInterfaceNodes(nodes);
  }, [designer]);

  const formatLayoutNotice = useCallback((diagnostics: LayoutDiagnostics, count: number) => {
    const overlapDelta = Math.max(0, diagnostics.overlapCountBefore - diagnostics.overlapCountAfter);
    const crossingDelta = Math.max(0, diagnostics.edgeCrossingsBefore - diagnostics.edgeCrossingsAfter);
    const warningText = diagnostics.warnings[0] ? ` · ${diagnostics.warnings[0]}` : '';
    return `已整理 ${count} 个控件，消除 ${overlapDelta} 处重叠，减少 ${crossingDelta} 处交叉${warningText}`;
  }, []);

  const handleAutoLayout = useCallback(() => {
    const diagnostics = designer.applyAutoLayout();
    setLayoutNotice(formatLayoutNotice(diagnostics, designer.components.length));
  }, [designer, formatLayoutNotice]);

  const handleSendToTest = useCallback(() => {
    // Collect default values from design components
    const comps = designer.components;
    const values: Record<string, unknown> = {};
    for (const comp of comps) {
      const name = comp.fieldBinding || comp.props?.name;
      if (name && comp.props?.defaultValue !== undefined) {
        values[name] = comp.props.defaultValue;
      }
    }
    if (Object.keys(values).length > 0) {
      setPendingRowData(values, 'form-designer');
    }
  }, [designer, setPendingRowData]);

  const selectedComponent = designer.selectedId
    ? designer.components.find((c) => c.id === designer.selectedId) || null
    : null;

  return (
    <div className="designer-layout">
      <div className={`designer-toolbar ${designer.mode === 'preview' ? 'preview-active' : ''}`}>
        {designer.mode === 'design' && <button onClick={handleSave} className="toolbar-btn">保存</button>}
        {designer.mode === 'design' && <button onClick={handleAutoLayout} className="toolbar-btn">自动整理表单</button>}
        {designer.mode === 'design' && <button onClick={handlePreview} className="toolbar-btn">预览/导出</button>}
        {designer.mode === 'preview' && <button onClick={handleSendToTest} className="toolbar-btn">发送到测试</button>}
        <span className="toolbar-sep" />
        <span className="toolbar-info">
          {designs.find((d) => d.id === activeId)?.name || '—'} · {designer.components.length} 个控件
        </span>
        {layoutNotice && <span className="toolbar-info">{layoutNotice}</span>}
      </div>
      <TabBar
        designs={designs}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={handleClose}
        onCreate={handleCreate}
        onRename={handleRename}
      />
      <div className={`designer-body ${designer.mode === 'preview' ? 'preview-active' : ''}`}>
        {designer.mode === 'design' && <LeftPanel
          components={designer.components}
          selectedId={designer.selectedId}
          onSelect={designer.setSelectedId}
          onRemove={designer.removeComponent}
          onReparent={designer.reparentComponent}
        />}
        <DesignCanvas designer={designer} />
        {designer.mode === 'design' && <PropertyPanel
          component={selectedComponent}
          components={designer.components}
          onUpdate={designer.updateComponentProps}
          onUpdateGeometry={designer.updateComponentGeometry}
          onRemove={designer.removeComponent}
        />}
      </div>
      <InterfaceTreeModal nodes={interfaceNodes} onClose={() => setInterfaceNodes(null)} />
    </div>
  );
}

function InterfaceTreeModal({ nodes, onClose }: { nodes: ComponentNode[] | null; onClose: () => void }) {
  const childrenMap = new Map<string, ComponentNode[]>();
  const nodeIds = new Set((nodes || []).map((node) => node.id));
  for (const node of nodes || []) {
    const parentId = typeof node.props.parentId === 'string' ? node.props.parentId : undefined;
    if (parentId && nodeIds.has(parentId)) {
      childrenMap.set(parentId, [...(childrenMap.get(parentId) || []), node]);
    }
  }
  const roots = (nodes || []).filter((node) => {
    const parentId = typeof node.props.parentId === 'string' ? node.props.parentId : undefined;
    return !parentId || !nodeIds.has(parentId);
  });

  const renderNode = (node: ComponentNode, depth = 0) => {
    const children = childrenMap.get(node.id) || [];
    return (
      <div key={node.id} className="interface-tree-item">
        <div className="interface-tree-row" style={{ paddingLeft: 12 + depth * 18 }}>
          <span className="interface-tree-toggle">{children.length ? '▾' : ''}</span>
          <span className="interface-tree-name">{node.label || node.name}</span>
          <span className="interface-tree-type">{node.type}</span>
          <span className="interface-tree-id">{node.name}</span>
        </div>
        <div className="interface-tree-meta" style={{ marginLeft: 30 + depth * 18 }}>
          {node.ports.length > 0 && <span>ports: {node.ports.map((port) => `${port.name}:${port.type}`).join(', ')}</span>}
          {node.events.length > 0 && <span>events: {node.events.map((event) => event.name).join(', ')}</span>}
          {node.ports.length === 0 && node.events.length === 0 && <span>无接口</span>}
        </div>
        {children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <Modal open={!!nodes} onClose={onClose} width="720px" maxWidth="92vw" maxHeight="82vh">
      <ModalHeader title={`接口树${nodes ? ` · ${nodes.length} 个组件` : ''}`} onClose={onClose} />
      <div className="interface-tree-modal">
        {roots.length ? roots.map((node) => renderNode(node)) : <div className="interface-tree-empty">暂无组件接口</div>}
      </div>
    </Modal>
  );
}
