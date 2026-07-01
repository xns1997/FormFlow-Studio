import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createRuntimeState, setFormValue, submitForm, addBehaviorLog, type RuntimeState } from '../services/runtime';
import { validateAllFields } from '../services/validator';
import { generateChangeLogJson, generateNewExcel, generateChangeLogCsv, downloadExcel, downloadJson, downloadCsv } from '../services/submitter';
import { executeAllRules, type BehaviorRule } from '../services/behaviorEngine';
import { runAllChecks, type BindingError } from '../services/errorChecker';
import { resolveRange } from '../services/rangeResolver';
import { exportToComponentNodes } from '../designer/export';
import { useSharedDataStore } from '../services/sharedDataStore';
import FormRenderer from '../components/FormRenderer';
import { useProjectStore } from '../project/store';
import type { ComponentNode, ColumnSchema, RangeRef } from '../models';
import { DesignerIcon } from '../designer/icons';
import type { FormControlEventContext } from '../services/formFlowTrigger';
import { executeFormControlEvent } from '../services/formEventExecutor';
import type { ProjectStructure } from '../project/types';

interface SheetData { name: string; data: Record<string, unknown>[]; headers: string[]; }

function doSwitchRow(prev: RuntimeState, sheetName: string, rowIdx: number, rowData: Record<string, unknown>): RuntimeState {
  return { ...prev, currentSheet: sheetName, currentRow: rowIdx, formValues: { ...rowData }, originalValues: { ...rowData }, dirtyFields: new Set(), validationErrors: {}, componentStates: {} };
}

const DEFAULT_RULES: BehaviorRule[] = [
  { id: 'rule-init', name: '表单加载', enabled: true, priority: 0, trigger: { type: 'formLoad' }, conditions: [], actions: [{ type: 'showMessage', message: '表单已加载', messageType: 'info' }], sideEffects: [] },
  { id: 'rule-validate', name: '提交前校验', enabled: true, priority: 10, trigger: { type: 'submit' }, conditions: [], actions: [{ type: 'showMessage', message: '正在校验数据…', messageType: 'info' }], sideEffects: [] },
];

export default function TestPage() {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [runtime, setRuntime] = useState<RuntimeState>(createRuntimeState);
  const [behaviorRules, setBehaviorRules] = useState<BehaviorRule[]>(DEFAULT_RULES);
  const [bindingErrors, setBindingErrors] = useState<BindingError[]>([]);
  const [rangeConnections, setRangeConnections] = useState<Record<string, RangeRef>>({});
  const runtimeRef = useRef(runtime);
  useEffect(() => { runtimeRef.current = runtime; }, [runtime]);
  const rulesRef = useRef(behaviorRules);
  useEffect(() => { rulesRef.current = behaviorRules; }, [behaviorRules]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImportProject = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as ProjectStructure;
      if (!data.config) { alert('无效的项目文件'); return; }
      data.config.id = `proj_${Date.now()}`;
      data.config.updatedAt = new Date().toISOString();
      setProject(data);
    } catch (err) {
      alert(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  }, [setProject]);

  const pendingRowData = useSharedDataStore((s) => s.pendingRowData);
  const pendingRowSource = useSharedDataStore((s) => s.pendingRowSource);
  const clearPendingRowData = useSharedDataStore((s) => s.clearPendingRowData);

  const handleRangeChange = useCallback((componentName: string, ref: RangeRef | null) => {
    setRangeConnections(prev => {
      const next = { ...prev };
      if (ref) next[componentName] = ref; else delete next[componentName];
      return next;
    });
  }, []);

  // 加载项目行为规则
  useEffect(() => {
    if (!project?.behaviors?.length) return;
    const eventMap: Record<string, string> = {
      onFormLoad: 'formLoad', onRowLoad: 'rowLoad',
      onFieldChange: 'fieldChange', onFieldBlur: 'fieldBlur', onFieldFocus: 'fieldFocus',
      onButtonClick: 'buttonClick', onSubmit: 'submit',
      formLoad: 'formLoad', rowLoad: 'rowLoad',
      fieldChange: 'fieldChange', fieldBlur: 'fieldBlur', fieldFocus: 'fieldFocus',
      buttonClick: 'buttonClick', submit: 'submit',
    };
    const loaded: BehaviorRule[] = project.behaviors.map((b) => ({
      id: b.id,
      name: b.name,
      enabled: b.enabled,
      priority: b.priority,
      trigger: { type: (eventMap[b.event] || b.event || 'formLoad') as any },
      conditions: [],
      actions: [{ type: 'executeScript' as any, scriptCode: b.code }],
      sideEffects: [],
    }));
    setBehaviorRules([...DEFAULT_RULES, ...loaded]);
  }, [project?.behaviors]);

  // 从项目 store 加载数据表
  useEffect(() => {
    if (!project?.srcTable.length) return;
    const loaded: SheetData[] = project.srcTable.flatMap((t) => t.sheets.map((s) => ({
      name: `${t.fileName} > ${s.name}`,
      data: s.preview,
      headers: s.headers,
    })));
    if (loaded.length > 0) {
      // 如果有设计器表单，找到字段匹配度最高的 sheet
      let bestIdx = 0;
      const design = project.designs?.[0];
      if (design?.components?.length) {
        const bindings = design.components.filter(c => c.fieldBinding).map(c => c.fieldBinding!);
        if (bindings.length > 0) {
          let bestScore = -1;
          loaded.forEach((sheet, idx) => {
            const score = bindings.filter(b => sheet.headers.includes(b)).length;
            if (score > bestScore) { bestScore = score; bestIdx = idx; }
          });
        }
      }
      setSheets(loaded);
      setActiveSheet(bestIdx);
      const firstRow = loaded[bestIdx].data[0] || {};
      setRuntime((prev) => {
        let next = doSwitchRow(prev, loaded[bestIdx].name, 0, firstRow);
        next = addBehaviorLog(next, { timestamp: Date.now(), level: 'info', source: 'system', message: `从项目加载 ${project.srcTable.length} 个数据表` });
        return next;
      });
      // formLoad + fieldChange 触发（延迟确保 rules 已更新）
      const initState = { ...createRuntimeState(), formValues: firstRow, originalValues: firstRow };
      executeAllRules(rulesRef.current, 'formLoad', initState, setRuntime);
      setTimeout(() => {
        executeAllRules(rulesRef.current, 'fieldChange', runtimeRef.current, setRuntime);
      }, 100);
    }
  }, [project]);

  useEffect(() => {
    if (!pendingRowData) return;
    setRuntime((prev) => {
      let next = { ...prev, formValues: { ...prev.formValues, ...pendingRowData }, originalValues: { ...prev.originalValues, ...pendingRowData } };
      next = addBehaviorLog(next, { timestamp: Date.now(), level: 'info', source: 'data-preview', message: `从数据预览导入: ${pendingRowSource}` });
      return next;
    });
    clearPendingRowData();
  }, [pendingRowData, pendingRowSource, clearPendingRowData]);

  const doSwitchSheet = useCallback((idx: number) => {
    setActiveSheet(idx);
    if (sheets[idx]?.data.length > 0) {
      setRuntime((prev) => addBehaviorLog(doSwitchRow(prev, sheets[idx].name, 0, sheets[idx].data[0]), { timestamp: Date.now(), level: 'info', source: 'system', message: `切换到 Sheet: ${sheets[idx].name}` }));
    }
  }, [sheets]);

  const doSwitchRowNum = useCallback((rowIdx: number) => {
    const sheet = sheets[activeSheet];
    if (!sheet || rowIdx < 0 || rowIdx >= sheet.data.length) return;
    setRuntime((prev) => {
      let next = doSwitchRow(prev, sheet.name, rowIdx, sheet.data[rowIdx]);
      next = addBehaviorLog(next, { timestamp: Date.now(), level: 'info', source: 'system', message: `切换到第 ${rowIdx + 1} 行` });
      return next;
    });
    // rowLoad 触发
    executeAllRules(behaviorRules, 'rowLoad', runtimeRef.current, setRuntime);
  }, [sheets, activeSheet, behaviorRules]);

  // ── 控件事件 → 行为引擎 ──────────────────────────────

  const updateField = useCallback((field: string, value: unknown) => {
    setRuntime((prev) => setFormValue(prev, field, value));
    // fieldChange 触发行为规则
    executeAllRules(behaviorRules, 'fieldChange', { ...runtimeRef.current, formValues: { ...runtimeRef.current.formValues, [field]: value } }, setRuntime);
  }, [behaviorRules]);

  const handleFieldBlur = useCallback((field: string) => {
    setRuntime((prev) => addBehaviorLog(prev, { timestamp: Date.now(), level: 'debug', source: 'event', message: `fieldBlur: ${field}` }));
    executeAllRules(behaviorRules, 'fieldBlur', runtimeRef.current, setRuntime);
  }, [behaviorRules]);

  const handleFieldFocus = useCallback((field: string) => {
    setRuntime((prev) => addBehaviorLog(prev, { timestamp: Date.now(), level: 'debug', source: 'event', message: `fieldFocus: ${field}` }));
    executeAllRules(behaviorRules, 'fieldFocus', runtimeRef.current, setRuntime);
  }, [behaviorRules]);

  const handleButtonClick = useCallback((buttonName: string) => {
    setRuntime((prev) => addBehaviorLog(prev, { timestamp: Date.now(), level: 'info', source: 'event', message: `buttonClick: ${buttonName}` }));
    executeAllRules(behaviorRules, 'buttonClick', runtimeRef.current, setRuntime);
  }, [behaviorRules]);

  const handleControlEvent = useCallback(async (context: FormControlEventContext) => {
    const result = await executeFormControlEvent(context, {
      workflows: project?.workflows || [],
      tables: project?.srcTable || [],
      setValue: updateField,
    });
    if (!result.callbackExecuted && !result.flowExecuted && !result.error) return;
    setRuntime((prev) => addBehaviorLog(prev, {
      timestamp: Date.now(),
      level: result.error ? 'error' : 'info',
      source: 'form-event',
      message: result.error
        ? `${context.field}.${context.eventName} 执行失败：${result.error.message}`
        : `${context.field}.${context.eventName} 执行完成（回调 ${result.callbackExecuted ? '已执行' : '无'}，流程 ${result.flowResults.length} 次）`,
    }));
  }, [project, updateField]);

  // ── 提交 ────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    await executeAllRules(behaviorRules, 'submit', runtime, setRuntime);
    const sheet = sheets[activeSheet];
    if (sheet) {
      const columns: ColumnSchema[] = sheet.headers.map((h, i) => ({ id: `col_${h}`, sheetId: sheet.name, name: h, originalName: h, index: i, dataType: 'string' as const, nullable: true, sampleValues: [], uniqueCount: 0, emptyCount: 0, validationRules: [], required: true }));
      setBindingErrors(runAllChecks(columns, activeComponents, []));
    }
    setRuntime((prev) => {
      const s = sheets[activeSheet];
      if (!s) return prev;
      const v = validateAllFields(prev.formValues, s.headers.map((h) => ({ name: h })));
      let next = prev;
      if (!v.valid) { for (const [f, e] of Object.entries(v.errors)) next = addBehaviorLog(next, { timestamp: Date.now(), level: 'error', source: 'validator', message: `${f}: ${e}` }); return addBehaviorLog(next, { timestamp: Date.now(), level: 'error', source: 'submit', message: '校验失败' }); }
      next = submitForm(next);
      if (next.submitResult?.success) next = addBehaviorLog(next, { timestamp: Date.now(), level: 'info', source: 'submit', message: `提交成功，${next.submitResult.changeLog.length} 项变更` });
      return next;
    });
    // submitSuccess / submitError
    setTimeout(() => {
      const s = runtimeRef.current;
      executeAllRules(behaviorRules, s.submitResult?.success ? 'submitSuccess' : 'submitError', s, setRuntime);
    }, 50);
  }, [sheets, activeSheet, runtime, behaviorRules]);

  const handleExport = useCallback((format: string) => {
    const sheet = sheets[activeSheet];
    if (!sheet) return;
    if (format === 'json') downloadJson(generateChangeLogJson(runtime), `${sheet.name}_changes.json`);
    else if (format === 'excel') downloadExcel(generateNewExcel(sheet.data, runtime.formValues, runtime.currentRow, sheet.name), `${sheet.name}_modified.xlsx`);
    else if (format === 'csv') downloadCsv(generateChangeLogCsv(runtime), `${sheet.name}_changes.csv`);
  }, [runtime, sheets, activeSheet]);

  const currentSheet = sheets[activeSheet];
  const fields = currentSheet?.headers || [];
  const changeCount = runtime.dirtyFields.size;
  const errorCount = Object.keys(runtime.validationErrors).length;

  const designerComponents = useMemo(() => {
    if (!project?.designs?.length) return null;
    const active = project.designs[0];
    if (!active?.components?.length) return null;
    return exportToComponentNodes(active.components);
  }, [project?.designs]);

  const autoComponents: ComponentNode[] = fields.map((f, i) => ({ id: `auto_${f}`, type: 'input', name: f, label: f, props: { placeholder: `请输入${f}`, required: false }, layout: { row: i, col: 0, colSpan: 1, rowSpan: 1 }, ports: [{ name: 'value', direction: 'input', type: 'string' }], events: [] }));

  const activeComponents = designerComponents && designerComponents.length > 0 ? designerComponents : autoComponents;

  const resolvedRanges = useMemo(() => {
    const resolved: Record<string, unknown> = {};
    const allTables = project?.srcTable || [];
    for (const [compName, ref] of Object.entries(rangeConnections)) {
      const rangeVal = resolveRange(ref, allTables);
      if (rangeVal) {
        if (rangeVal.singleValue !== undefined) {
          resolved[compName] = rangeVal.singleValue;
        } else if (rangeVal.data.length > 0) {
          resolved[compName] = rangeVal.data[0][0];
        }
      }
    }
    return resolved;
  }, [rangeConnections, project?.srcTable]);

  return (
    <div className="page-layout">
      {/* 左侧：数据表选择 + 行为规则 */}
      <div className="page-sidebar">
        <div className="page-section-header">
          <span>测试数据</span>
          <input ref={fileRef} type="file" accept=".json,.formflow.json" style={{ display: 'none' }} onChange={handleImportProject} />
          <button onClick={() => fileRef.current?.click()} style={{ padding: '2px 8px', fontSize: 10, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel)', cursor: 'pointer' }}>导入项目</button>
        </div>
        <div className="page-section-body">
          {sheets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 12 }}>
              <p>暂无数据表</p>
              <p style={{ fontSize: 10, marginTop: 8 }}>点击上方"导入项目"加载 JSON 文件</p>
            </div>
          ) : sheets.map((s, i) => (
            <div key={s.name} className={`sidebar-item ${activeSheet === i ? 'active' : ''}`} onClick={() => doSwitchSheet(i)}>
              <span className="sidebar-item-icon"><DesignerIcon name="table" /></span>
              <div className="sidebar-item-info">
                <span className="sidebar-item-name">{s.name}</span>
                <span className="sidebar-item-meta">{s.data.length} 行 × {s.headers.length} 列</span>
              </div>
            </div>
          ))}

          <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 8 }}>
            <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>行为规则 ({behaviorRules.length})</h4>
            {behaviorRules.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 11 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.enabled ? '#34c759' : '#e5e5ea', flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'monospace' }}>{r.trigger.type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 中间：表单预览 */}
      <div className="page-main">
        <div className="page-section-header">
          <span>{currentSheet ? `行 ${runtime.currentRow + 1}/${currentSheet.data.length}` : '表单预览'}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => doSwitchRowNum(Math.max(0, runtime.currentRow - 1))} disabled={runtime.currentRow === 0} style={{ padding: '3px 8px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4 }}>上一行</button>
            <button onClick={() => doSwitchRowNum(runtime.currentRow + 1)} disabled={!currentSheet || runtime.currentRow >= currentSheet.data.length - 1} style={{ padding: '3px 8px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4 }}>下一行</button>
            <button className="primary" onClick={handleSubmit} style={{ padding: '3px 10px', fontSize: 11 }}>提交</button>
            <select onChange={(e) => e.target.value && handleExport(e.target.value)} style={{ padding: '3px 6px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4 }}>
              <option value="">导出…</option><option value="json">JSON</option><option value="excel">Excel</option><option value="csv">CSV</option>
            </select>
          </div>
        </div>
        <div className="page-section-body">
          {!currentSheet ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>
              <p>选择左侧数据表开始测试</p>
            </div>
          ) : (
            <FormRenderer
              components={activeComponents}
              values={{ ...resolvedRanges, ...runtime.formValues }}
              originalValues={runtime.originalValues}
              componentStates={runtime.componentStates}
              errors={runtime.validationErrors}
              onChange={updateField}
              onBlur={handleFieldBlur}
              onFocus={handleFieldFocus}
              onButtonClick={handleButtonClick}
              onControlEvent={handleControlEvent}
              tables={project?.srcTable || []}
              rangeConnections={rangeConnections}
              onRangeChange={handleRangeChange}
            />
          )}
        </div>
      </div>

      {/* 右侧：状态/日志 */}
      <div className="page-inspector">
        <div className="page-section-header"><span>运行时状态</span></div>
        <div className="page-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="runtime-info" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Sheet</span><span>{runtime.currentSheet || '-'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>行</span><span>{runtime.currentRow + 1}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>字段</span><span>{fields.length}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: changeCount > 0 ? '#d97706' : 'var(--muted)' }}>变更</span><span>{changeCount}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: errorCount > 0 ? 'var(--danger)' : 'var(--muted)' }}>错误</span><span>{errorCount}</span></div>
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>变更记录 ({changeCount})</h4>
            {changeCount === 0 ? <p style={{ fontSize: 11, color: 'var(--muted)' }}>暂无变更</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Array.from(runtime.dirtyFields).map((f) => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', background: '#f8fafc', borderRadius: 4, fontSize: 11 }}>
                    <span style={{ fontWeight: 600 }}>{f}</span>
                    <span style={{ color: 'var(--muted)', textDecoration: 'line-through' }}>{String(runtime.originalValues[f])}</span>
                    <span style={{ color: 'var(--muted)' }}>→</span>
                    <span style={{ color: '#16a34a' }}>{String(runtime.formValues[f])}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>行为日志 ({runtime.behaviorLogs.length})</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflow: 'auto' }}>
              {runtime.behaviorLogs.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 4, fontSize: 10, padding: '2px 0' }}>
                  <span style={{ color: 'var(--muted)', fontFamily: 'monospace', fontSize: 9 }}>{new Date(l.timestamp).toLocaleTimeString()}</span>
                  <span style={{ color: l.level === 'error' ? 'var(--danger)' : l.level === 'info' ? 'var(--accent)' : '#d97706', fontWeight: 600 }}>[{l.source}]</span>
                  <span>{l.message}</span>
                </div>
              ))}
            </div>
          </div>

          {bindingErrors.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>错误检查 ({bindingErrors.length})</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {bindingErrors.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, padding: '3px 6px', borderRadius: 4, fontSize: 11, background: e.severity === 'error' ? '#fef2f2' : '#fefce8', color: e.severity === 'error' ? 'var(--danger)' : '#92400e' }}>
                    <span style={{ fontWeight: 700, minWidth: 60, fontSize: 10 }}>{e.type}</span>
                    <span style={{ flex: 1 }}>{e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
