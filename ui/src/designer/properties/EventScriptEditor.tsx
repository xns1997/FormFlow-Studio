import React, { useState, useMemo } from 'react';
import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../../project/types';
import { getBehaviorEventDoc, getEventReferenceShortcuts } from '../../services/io/behaviorDocs';
import { createEventContextExtraLib, createEventContextSuggestions, type EventFieldDescriptor } from '../../components/codeEditorSuggestions';
import CodeEditor from '../../components/CodeEditor';
import Modal, { ModalFooter, ModalHeader } from '../../components/Modal';
import { buildDocsPath } from '../../services/io/routes';
import { getComponentDisplayName, appendScriptSnippet } from './utils';

export function EventScriptEditorSection({
  component,
  evt,
  controlLabel,
  eventCode,
  fieldDescriptors,
  workflows,
  components,
  tables,
  projectId,
  controlSnippets,
  impactFields,
  impactComponents,
  onChange,
}: {
  component: DesignComponent;
  evt: { key: string; label: string; description?: string };
  controlLabel: string;
  eventCode: string;
  fieldDescriptors: EventFieldDescriptor[];
  workflows: WorkflowFile[];
  components: DesignComponent[];
  tables: SrcTableEntry[];
  projectId: string;
  controlSnippets: Array<{ id: string; title: string; summary: string; code: string }>;
  impactFields: string[];
  impactComponents: string[];
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'controls' | 'data' | 'reference' | 'snippets' | 'describe' | 'impact'>('controls');
  const [docModal, setDocModal] = useState<{ title: string; path: string } | null>(null);
  const currentField = String(component.fieldBinding || component.props.name || component.type);
  const docsQuery = {
    fromProject: projectId,
    fromPage: 'workspace' as const,
    fromTab: 'designer',
  };
  const eventDoc = getBehaviorEventDoc(evt.key, 'control');
  const currentFieldDescriptor = fieldDescriptors.find((field) => field.name === currentField);
  const lineCount = eventCode.trim() ? eventCode.trim().split('\n').length : 0;
  const closeWorkbench = () => {
    setDocModal(null);
    setOpen(false);
  };
  const openDocModal = (slug: string | undefined, title: string) => {
    if (!slug) return;
    setDocModal({
      title,
      path: buildDocsPath(slug, docsQuery),
    });
  };
  const componentHelpers = useMemo(() => components.map((item) => {
    const name = String(item.fieldBinding || item.props.name || item.id);
    return {
      id: item.id,
      name,
      label: getComponentDisplayName(item),
      type: item.type,
      fieldBinding: String(item.fieldBinding || item.props.name || ''),
      isCurrent: item.id === component.id,
    };
  }), [component.id, components]);
  const tableHelpers = useMemo(() => tables.flatMap((table) => table.sheets.map((sheet) => ({
    tableId: table.id,
    tableName: table.fileName,
    sheetName: sheet.name,
    queryId: sheet.name === table.id ? table.id : `${table.id}:${sheet.name}`,
    rowCount: sheet.rowCount,
    colCount: sheet.colCount,
    columns: sheet.columns,
  }))), [tables]);
  const renderSidebarTabContent = () => {
    if (sidebarTab === 'controls') {
      return (
        <div className="event-workbench-list">
          {componentHelpers.map((item) => (
            <div key={item.id} className={`event-workbench-item ${item.isCurrent ? 'current' : ''}`}>
              <div className="event-workbench-item-head">
                <strong>{item.label}</strong>
                <span>{item.type}</span>
              </div>
              <div className="event-workbench-item-meta">
                <span>name: {item.name}</span>
                <span>field: {item.fieldBinding || '—'}</span>
              </div>
              <div className="event-workbench-inline-actions">
                <button type="button" onClick={() => onChange(appendScriptSnippet(eventCode, `ctx.controls.${item.name}.value`))}>插入值句柄</button>
                <button type="button" onClick={() => onChange(appendScriptSnippet(eventCode, `await ctx.setVisible('${item.id}', true);`))}>插入显隐</button>
                <button type="button" onClick={() => onChange(appendScriptSnippet(eventCode, `await ctx.setDisabled('${item.id}', true);`))}>插入禁用</button>
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (sidebarTab === 'data') {
      return (
        <div className="event-workbench-list">
          {tableHelpers.map((entry) => (
            <div key={`${entry.tableId}:${entry.sheetName}`} className="event-workbench-item">
              <div className="event-workbench-item-head">
                <strong>{entry.sheetName}</strong>
                <span>{entry.rowCount} 行</span>
              </div>
              <div className="event-workbench-item-meta">
                <span>数据源: {entry.tableId}</span>
                <span>列数: {entry.colCount}</span>
              </div>
              <div className="event-workbench-inline-actions">
                <button type="button" onClick={() => onChange(appendScriptSnippet(eventCode, `const rows = ctx.querySheet('${entry.queryId}');`))}>插入查询</button>
                <button type="button" onClick={() => onChange(appendScriptSnippet(eventCode, `const first = ctx.querySheet('${entry.queryId}')[0];`))}>插入首行</button>
              </div>
              <div className="event-workbench-column-tags">
                {entry.columns.slice(0, 8).map((column) => (
                  <button
                    key={column.name}
                    type="button"
                    className="event-workbench-token"
                    onClick={() => onChange(appendScriptSnippet(eventCode, column.name))}
                    title={`${column.dataType}${column.sampleValues?.length ? ` · 示例: ${column.sampleValues.slice(0, 2).join(', ')}` : ''}`}
                  >
                    {column.name}
                  </button>
                ))}
                {entry.columns.length > 8 && <span className="event-workbench-more">+{entry.columns.length - 8}</span>}
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (sidebarTab === 'reference') {
      return (
        <div className="event-workbench-reference-grid">
          <div className="event-workbench-reference-card">
            <strong>事件说明</strong>
            <p>{eventDoc?.summary || evt.description || '暂无事件说明。'}</p>
            <p>{eventDoc?.triggerWhen || '脚本会在当前事件触发时执行。'}</p>
          </div>
          <div className="event-workbench-reference-card">
            <strong>Reference 快捷项</strong>
            <div className="event-workbench-reference-list">
              {getEventReferenceShortcuts(evt.key, 'control').map((item) => (
                <button key={item.path} type="button" className="event-workbench-reference-item" onClick={() => onChange(appendScriptSnippet(eventCode, item.path.startsWith('ctx.') ? item.path : `ctx.${item.path}`))}>
                  <code>{item.path.startsWith('ctx.') ? item.path : `ctx.${item.path}`}</code>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="event-workbench-reference-card">
            <strong>可用 API</strong>
            <div className="event-workbench-reference-list">
              {(eventDoc?.apis || []).map((api) => (
                <button key={api.name} type="button" className="event-workbench-reference-item" onClick={() => onChange(appendScriptSnippet(eventCode, api.signature))}>
                  <code>{api.signature}</code>
                  <span>{api.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }
    if (sidebarTab === 'snippets') {
      return (
        <div className="prop-event-snippets event-workbench-snippets">
          {[...controlSnippets, ...((eventDoc?.examples || []).map((example, index) => ({
            id: `doc_${index}`,
            title: example.title,
            summary: eventDoc?.summary || '事件文档示例',
            code: example.code,
          })))].map((snippet) => (
            <div key={snippet.id} className="prop-event-snippet-card">
              <div className="prop-event-snippet-head">
                <strong>{snippet.title}</strong>
                <button type="button" onClick={() => onChange(appendScriptSnippet(eventCode, snippet.code))}>插入示例</button>
              </div>
              <span>{snippet.summary}</span>
              <code>{snippet.code}</code>
            </div>
          ))}
        </div>
      );
    }
    if (sidebarTab === 'describe') {
      return (
        <div className="event-workbench-describe-grid">
          {tableHelpers.map((entry) => (
            <div key={`${entry.tableId}:${entry.sheetName}:describe`} className="event-workbench-reference-card">
              <strong>{entry.sheetName}</strong>
              <p>{entry.tableName} · {entry.rowCount} 行 · {entry.colCount} 列</p>
              <div className="event-workbench-describe-columns">
                {entry.columns.map((column) => (
                  <div key={column.name} className="event-workbench-describe-column">
                    <code>{column.name}</code>
                    <span>{column.dataType}{column.description ? ` · ${column.description}` : ''}</span>
                    {column.sampleValues?.length > 0 && <small>示例：{column.sampleValues.slice(0, 3).map((item) => String(item)).join(' / ')}</small>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="event-workbench-reference-grid">
        <div className="event-workbench-reference-card">
          <strong>字段影响</strong>
          <p>{impactFields.length > 0 ? impactFields.join('、') : '当前未通过联动规则影响其他字段。'}</p>
        </div>
        <div className="event-workbench-reference-card">
          <strong>控件影响</strong>
          <p>{impactComponents.length > 0 ? impactComponents.join('、') : '当前未通过联动规则影响其他控件。'}</p>
        </div>
        <div className="event-workbench-reference-card">
          <strong>当前控件</strong>
          <p>{getComponentDisplayName(component)} · {component.type}</p>
          <p>ID: {component.id}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="prop-event-section">
      <div className="prop-event-section-title">高级脚本</div>
      <div className="prop-event-script-toolbar">
        <div className="prop-event-doc-links">
          <button type="button" className="prop-event-doc-link" onClick={() => openDocModal('control-handles-reference', '控件句柄')}>
            控件句柄
          </button>
          <button type="button" className="prop-event-doc-link" onClick={() => openDocModal('context-reference', '上下文总览')}>
            上下文总览
          </button>
          <button type="button" className="prop-event-doc-link" onClick={() => openDocModal(eventDoc?.slug, '事件文档')} disabled={!eventDoc?.slug}>
            事件文档
          </button>
        </div>
        <button type="button" className="prop-event-workbench-btn" onClick={() => setOpen(true)}>
          打开脚本工作台
        </button>
      </div>
      <CodeEditor
        value={eventCode}
        placeholder={evt.description}
        height={160}
        minHeight={120}
        path={`inmemory://model/form-event-${component.id}-${evt.key}.js`}
        compact
        lineNumbers
        theme="light"
        extraLibs={[
          createEventContextExtraLib({
            filePath: `inmemory://model/form-event-${component.id}-${evt.key}.d.ts`,
            fields: fieldDescriptors,
            currentField,
            eventName: evt.key,
          }),
        ]}
        suggestions={createEventContextSuggestions({
          fields: fieldDescriptors,
          workflows,
          eventName: evt.key,
          currentField,
        })}
        autoSuggestPolicy="explicit"
        suggestionTriggerCharacters={['.', "'", '"', '(']}
        options={{ folding: true, lineNumbersMinChars: 2, scrollbar: { vertical: 'hidden', horizontal: 'auto' } }}
        title={`${controlLabel} · ${evt.label}`}
        onChange={onChange}
      />
      <div className="prop-event-impact">
        <strong>脚本摘要</strong>
        <div>
          <span>当前字段：{currentFieldDescriptor?.name || currentField}</span>
          <span>脚本：{lineCount > 0 ? `${lineCount} 行` : '未编写'}</span>
          <span>影响字段：{impactFields.length > 0 ? impactFields.join('、') : '—'}</span>
          <span>影响控件：{impactComponents.length > 0 ? impactComponents.join('、') : '—'}</span>
        </div>
      </div>

      <Modal
        open={open}
        onClose={closeWorkbench}
        width="min(1440px, 96vw)"
        maxWidth="96vw"
        maxHeight="92vh"
        containerClassName="event-workbench-modal"
      >
        <ModalHeader title={`${controlLabel} · ${evt.label} 脚本工作台`} onClose={closeWorkbench} />
        <div className="modal-body event-workbench-body">
          <div className="event-workbench-topbar">
            <div className="event-workbench-top-meta">
              <span>字段：{currentFieldDescriptor?.name || currentField}</span>
              <span>类型：{currentFieldDescriptor?.type || 'string'}</span>
              <span>事件：{evt.key}</span>
              <span>脚本：{lineCount > 0 ? `${lineCount} 行` : '空脚本'}</span>
            </div>
            <div className="prop-event-doc-links">
              <button type="button" className="prop-event-doc-link" onClick={() => openDocModal('control-handles-reference', '控件句柄')}>
                控件句柄
              </button>
              <button type="button" className="prop-event-doc-link" onClick={() => openDocModal('context-reference', '上下文')}>
                上下文
              </button>
              <button type="button" className="prop-event-doc-link" onClick={() => openDocModal(eventDoc?.slug, '事件说明')} disabled={!eventDoc?.slug}>
                事件说明
              </button>
            </div>
          </div>

          <div className="event-workbench-layout">
            <div className="event-workbench-editor">
              <CodeEditor
                value={eventCode}
                placeholder={evt.description}
                height="100%"
                minHeight={0}
                path={`inmemory://model/form-event-${component.id}-${evt.key}-workbench.js`}
                lineNumbers
                theme="light"
                extraLibs={[
                  createEventContextExtraLib({
                    filePath: `inmemory://model/form-event-${component.id}-${evt.key}-workbench.d.ts`,
                    fields: fieldDescriptors,
                    currentField,
                    eventName: evt.key,
                  }),
                ]}
                suggestions={createEventContextSuggestions({
                  fields: fieldDescriptors,
                  workflows,
                  eventName: evt.key,
                  currentField,
                })}
                autoSuggestPolicy="explicit"
                suggestionTriggerCharacters={['.', "'", '"', '(']}
                options={{ folding: true, lineNumbersMinChars: 2, scrollbar: { vertical: 'auto', horizontal: 'auto' } }}
                title={`${controlLabel} · ${evt.label}`}
                onChange={onChange}
              />
            </div>
            <aside className="event-workbench-sidebar">
              <div className="event-workbench-panel">
                <div className="event-workbench-panel-tabs">
                  <button type="button" className={sidebarTab === 'controls' ? 'active' : ''} onClick={() => setSidebarTab('controls')}>控件列表</button>
                  <button type="button" className={sidebarTab === 'data' ? 'active' : ''} onClick={() => setSidebarTab('data')}>数据 Describe</button>
                  <button type="button" className={sidebarTab === 'reference' ? 'active' : ''} onClick={() => setSidebarTab('reference')}>Reference</button>
                  <button type="button" className={sidebarTab === 'snippets' ? 'active' : ''} onClick={() => setSidebarTab('snippets')}>示例片段</button>
                  <button type="button" className={sidebarTab === 'describe' ? 'active' : ''} onClick={() => setSidebarTab('describe')}>数据结构</button>
                  <button type="button" className={sidebarTab === 'impact' ? 'active' : ''} onClick={() => setSidebarTab('impact')}>影响面</button>
                </div>
                {renderSidebarTabContent()}
              </div>
            </aside>
          </div>
        </div>
        <ModalFooter>
          <button type="button" className="toolbar-btn" onClick={closeWorkbench}>完成</button>
        </ModalFooter>
      </Modal>

      <Modal
        open={!!docModal}
        onClose={() => setDocModal(null)}
        width="min(1280px, 92vw)"
        maxWidth="92vw"
        maxHeight="88vh"
        containerClassName="event-doc-modal"
      >
        <ModalHeader title={docModal?.title || '文档'} onClose={() => setDocModal(null)} />
        <div className="modal-body event-doc-modal-body">
          {docModal && (
            <iframe
              className="event-doc-frame"
              src={docModal.path}
              title={docModal.title}
            />
          )}
        </div>
        <ModalFooter>
          <button type="button" className="toolbar-btn" onClick={() => setDocModal(null)}>返回脚本</button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
