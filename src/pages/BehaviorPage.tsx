import React, { useCallback, useMemo, useState } from 'react';
import CodeEditor from '../components/CodeEditor';
import {
  createEventContextExtraLib,
  createEventContextSuggestions,
  type EventFieldDescriptor,
} from '../components/codeEditorSuggestions';
import { useProjectStore } from '../project/store';
import type { BehaviorFile } from '../project/types';

export default function BehaviorPage() {
  const project = useProjectStore((s) => s.project);
  const addBehavior = useProjectStore((s) => s.addBehavior);
  const updateBehavior = useProjectStore((s) => s.updateBehavior);
  const removeBehavior = useProjectStore((s) => s.removeBehavior);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newScriptName, setNewScriptName] = useState('');
  const [newScriptEvent, setNewScriptEvent] = useState('onFieldChange');

  const scripts = project?.behaviors || [];
  const workflows = project?.workflows || [];
  const fieldDescriptors = useMemo<EventFieldDescriptor[]>(() => {
    if (!project) return [];
    const fromTables = project.srcTable.flatMap((table) => table.sheets.flatMap((sheet) => sheet.columns.map((column) => ({
      name: column.name,
      type: column.dataType,
    }))));
    const fromComponents = project.designs.flatMap((design) => design.components.map((component) => {
      const name = String(component.fieldBinding || component.props.name || '').trim();
      if (!name) return null;
      if (component.type === 'number' || component.type === 'rating') return { name, type: 'number' };
      if (component.type === 'switch') return { name, type: 'boolean' };
      if (component.type === 'checkbox') return { name, type: 'array' };
      if (component.type === 'json' || component.type === 'object') return { name, type: 'object' };
      return { name, type: 'string' };
    }).filter(Boolean) as EventFieldDescriptor[]);
    return [...new Map([...fromTables, ...fromComponents].map((field) => [field.name, field])).values()];
  }, [project]);

  const events = ['onFormLoad', 'onRowLoad', 'onFieldChange', 'onFieldBlur', 'onFieldFocus', 'onButtonClick', 'onValidate', 'onSubmit', 'onSubmitSuccess', 'onSubmitError'];

  const addScript = useCallback(() => {
    if (!newScriptName) return;
    const now = new Date().toISOString();
    addBehavior({
      id: `bh_${Date.now()}`,
      name: newScriptName,
      event: newScriptEvent,
      code: `// ${newScriptName}\n`,
      priority: 10,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    setNewScriptName('');
  }, [newScriptName, newScriptEvent, addBehavior]);

  const deleteScript = useCallback((id: string) => {
    removeBehavior(id);
    if (editingId === id) setEditingId(null);
  }, [editingId, removeBehavior]);

  const updateCode = useCallback((id: string, code: string) => {
    updateBehavior(id, { code });
  }, [updateBehavior]);

  const updateEvent = useCallback((id: string, event: string) => {
    updateBehavior(id, { event });
  }, [updateBehavior]);

  const toggleEnabled = useCallback((id: string, enabled: boolean) => {
    updateBehavior(id, { enabled });
  }, [updateBehavior]);

  const grouped = useMemo(() => {
    const g: Record<string, BehaviorFile[]> = {};
    for (const s of scripts) { (g[s.event] = g[s.event] || []).push(s); }
    return g;
  }, [scripts]);

  const editingScript = scripts.find((s) => s.id === editingId);

  const ctxApi = `// 受限 API\nctx.getValue(fieldId)       // 获取字段值\nctx.setValue(fieldId, val)   // 设置字段值\nctx.setVisible(id, bool)     // 显示/隐藏\nctx.setDisabled(id, bool)    // 启用/禁用\nctx.setRequired(id, bool)    // 设置必填\nctx.showMessage(msg, type)   // 弹出提示\nctx.validateField(id)        // 校验字段\nctx.querySheet(sheetId, f)   // 查询数据\nctx.updateRow(rowId, patch)  // 更新行\nctx.submit()                 // 提交`;
  return (
    <div className="page-layout">
      {/* 左侧：脚本列表 */}
      <div className="page-sidebar">
        <div className="page-section-header">
          <span>脚本 ({scripts.length})</span>
          <button onClick={addScript} style={{ padding: '2px 8px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel)' }}>+ 新建</button>
        </div>
        <div className="page-section-body">
          {scripts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 12 }}>
              <p>暂无脚本</p>
            </div>
          ) : Object.entries(grouped).map(([event, items]) => (
            <div key={event}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginTop: 8, marginBottom: 4 }}>{event}</div>
              {items.map((s) => (
                <div key={s.id} className={`sidebar-item ${editingId === s.id ? 'active' : ''}`} onClick={() => setEditingId(s.id)}>
                  <span style={{ fontSize: 12, color: s.enabled ? '#16a34a' : '#dc2626' }}>{s.enabled ? '●' : '○'}</span>
                  <div className="sidebar-item-info">
                    <span className="sidebar-item-name">{s.name}</span>
                    <span className="sidebar-item-meta">{s.code.length} 字符</span>
                  </div>
                  <button className="sidebar-item-delete" onClick={(e) => { e.stopPropagation(); deleteScript(s.id); }}>×</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 中间：代码编辑器 */}
      <div className="page-main">
        <div className="page-section-header">
          <span>{editingScript ? editingScript.name : '行为定义'}</span>
          {editingScript && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select value={editingScript.event} onChange={(e) => updateEvent(editingScript.id, e.target.value)} style={{ padding: '3px 6px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4 }}>
                {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <input type="checkbox" checked={editingScript.enabled} onChange={(e) => toggleEnabled(editingScript.id, e.target.checked)} />
                <span>启用</span>
              </label>
            </div>
          )}
        </div>
        <div className="page-section-body" style={{ padding: 0, position: 'relative' }}>
          {editingScript ? (
            <CodeEditor
              value={editingScript.code}
              onChange={(code) => updateCode(editingScript.id, code)}
              language="javascript"
              path={`inmemory://model/behavior-${editingScript.id}.js`}
              title={`${editingScript.name} · ${editingScript.event}`}
              theme="light"
              extraLibs={[
                createEventContextExtraLib({
                  filePath: `inmemory://model/behavior-${editingScript.id}.d.ts`,
                  fields: fieldDescriptors,
                  eventName: editingScript.event,
                }),
              ]}
              suggestions={createEventContextSuggestions({
                fields: fieldDescriptors,
                workflows,
                eventName: editingScript.event,
              })}
              suggestionTriggerCharacters={['.', "'", '"', '(', '$']}
              lineNumbers
              options={{ minimap: { enabled: true }, folding: true, fontSize: 13, lineHeight: 21 }}
              fullscreen
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 13 }}>
              <p>选择左侧脚本进行编辑</p>
              <p style={{ fontSize: 11, marginTop: 4 }}>或点击「+ 新建」创建新脚本</p>
            </div>
          )}
        </div>
      </div>

      {/* 右侧：API 参考 */}
      <div className="page-inspector">
        <div className="page-section-header"><span>API 参考</span></div>
        <div className="page-section-body">
          <pre style={{ fontSize: 10, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: 'var(--panel-soft)', padding: 8, borderRadius: 4, margin: 0 }}>{ctxApi}</pre>
        </div>
      </div>
    </div>
  );
}
