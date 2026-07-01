import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-theme-quartz.css";

const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const agThemeClass = prefersDark ? 'ag-theme-quartz-dark' : 'ag-theme-quartz';
import { useProjectStore } from "../project/store";
import { useSharedDataStore } from "../services/sharedDataStore";
import {
  createDefaultTableConfig,
  type TableConfig,
} from "../project/types";
import type {
  SrcColumnInfo,
  SrcTableEntry,
  SrcSheetInfo,
} from "../project/types";
import { DesignerIcon } from "../designer/icons";

ModuleRegistry.registerModules([AllCommunityModule]);

type PreviewRow = Record<string, unknown> & { __rowId?: string };

function withRowIds(data: Record<string, unknown>[], offset = 0): PreviewRow[] {
  return data.map((row, index) => ({
    ...row,
    __rowId: String(row.id ?? row.customer_id ?? `${offset + index}`),
  }));
}

function inferColumnInfo(
  name: string,
  index: number,
  data: Record<string, unknown>[],
): SrcColumnInfo {
  const values = data.map((row) => row[name]);
  const nonEmpty = values.filter((value) => value !== "" && value != null);
  const sampleValues = [...new Set(nonEmpty.map(String))].slice(0, 8);
  const dataType =
    nonEmpty.length === 0
      ? "unknown"
      : nonEmpty.every((value) => typeof value === "number")
        ? "number"
        : nonEmpty.every((value) => typeof value === "boolean")
          ? "boolean"
          : nonEmpty.every((value) => !Number.isNaN(Date.parse(String(value))))
            ? "date"
            : sampleValues.length <= 20
              ? "enum"
              : "string";

  return {
    name,
    index,
    dataType,
    nullable: nonEmpty.length < values.length,
    uniqueCount: new Set(nonEmpty.map(String)).size,
    sampleValues,
  };
}

export default function DataPreviewPage() {
  const project = useProjectStore((s) => s.project);
  const addTable = useProjectStore((s) => s.addTable);
  const removeTable = useProjectStore((s) => s.removeTable);
  const saveSheetConfig = useProjectStore((s) => s.updateTableSheetConfig);
  const setPendingRowData = useSharedDataStore((s) => s.setPendingRowData);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [selectedColIdx, setSelectedColIdx] = useState<number | null>(null);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [describeReport, setDescribeReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [describeLoading, setDescribeLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"table" | "describe" | "config">(
    "table",
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedTable = project?.srcTable.find((t) => t.id === selectedTableId);
  const activeSheet = selectedTable?.sheets[activeSheetIdx];
  const currentConfig = useMemo(() => {
    if (!selectedTable || !activeSheet) return null;
    const defaults = createDefaultTableConfig(
      `${selectedTable.id}:${activeSheet.name}`,
      `${selectedTable.fileName} / ${activeSheet.name}`,
    );
    return { ...defaults, ...activeSheet.config };
  }, [selectedTable, activeSheet]);

  // AG Grid 列定义
  const colDefs = useMemo(() => {
    if (!activeSheet) return [];
    return activeSheet.headers.map((h) => ({
      headerName: h,
      field: h,
      flex: currentConfig?.columnWidths[h] ? undefined : 1,
      width: currentConfig?.columnWidths[h],
      minWidth: 80,
      resizable: true,
      sortable: currentConfig?.sortEnabled !== false,
      filter: currentConfig?.filterEnabled !== false,
      hide: currentConfig?.hiddenColumns?.includes(h) || false,
    }));
  }, [
    activeSheet?.headers,
    currentConfig?.sortEnabled,
    currentConfig?.filterEnabled,
    currentConfig?.columnWidths,
    currentConfig?.hiddenColumns,
  ]);

  const updateConfig = useCallback(
    (patch: Partial<TableConfig>) => {
      if (!selectedTable || !activeSheet || !currentConfig) return;
      void saveSheetConfig(selectedTable.id, activeSheet.name, {
        ...currentConfig,
        ...patch,
      });
    },
    [selectedTable, activeSheet, currentConfig, saveSheetConfig],
  );

  const onColumnMoved = useCallback(
    (e: any) => {
      if (!selectedTable || !activeSheet || !currentConfig) return;
      const colState = e.api?.getColumnState?.() || [];
      const hiddenCols = colState
        .filter((state: { colId: string; hide?: boolean }) => state.hide)
        .map((state: { colId: string }) => state.colId);
      updateConfig({ hiddenColumns: hiddenCols });
    },
    [selectedTable, activeSheet, currentConfig, updateConfig],
  );

  const onColumnResized = useCallback(
    (e: any) => {
      if (!e.finished || !selectedTable || !activeSheet || !currentConfig || !e.column)
        return;
      const colId = e.column.colDef?.field;
      const newWidth = e.column.getActualWidth();
      if (
        colId &&
        newWidth &&
        Math.abs(newWidth - (currentConfig.columnWidths[colId] || 0)) > 2
      ) {
        updateConfig({
          columnWidths: { ...currentConfig.columnWidths, [colId]: newWidth },
        });
      }
    },
    [selectedTable, activeSheet, currentConfig, updateConfig],
  );

  const derivedColumns = useMemo(() => {
    if (!activeSheet) return [];
    if (activeSheet.columns?.length) return activeSheet.columns;
    return activeSheet.headers.map((header, index) =>
      inferColumnInfo(header, index, rows),
    );
  }, [activeSheet, rows]);

  const activeSheetData = activeSheet
    ? { ...activeSheet, columns: derivedColumns }
    : undefined;
  const selectedCol =
    selectedColIdx !== null ? activeSheetData?.columns?.[selectedColIdx] : null;

  useEffect(() => {
    if (!selectedTableId && project?.srcTable.length) {
      setSelectedTableId(project.srcTable[0].id);
    }
  }, [project?.srcTable, selectedTableId]);

  useEffect(() => {
    if (!selectedTable || !activeSheet || !selectedTableId) {
      setRows([]);
      setTotalRows(0);
      return;
    }

    let cancelled = false;
    const loadRows = async () => {
      setLoading(true);
      const fallbackRows = activeSheet.preview || [];
      const serverPageSize = Math.min(activeSheet.rowCount || fallbackRows.length, 5000);
      try {
        const res = await fetch(
          `http://localhost:3001/api/data/${encodeURIComponent(selectedTable.id)}/${encodeURIComponent(activeSheet.name)}/rows?page=1&pageSize=${serverPageSize}`,
        );
        if (!res.ok) throw new Error(`rows api failed: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setRows(withRowIds(data.rows || []));
        setTotalRows(data.total ?? data.rows?.length ?? fallbackRows.length);
      } catch {
        if (cancelled) return;
        // Limit fallback to prevent OOM on large files
        const limited = fallbackRows.length > 5000 ? fallbackRows.slice(0, 5000) : fallbackRows;
        setRows(withRowIds(limited));
        setTotalRows(activeSheet.rowCount || fallbackRows.length);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadRows();
    setSelectedColIdx(null);
    setDescribeReport(null);

    return () => {
      cancelled = true;
    };
  }, [selectedTableId, activeSheetIdx, activeSheet?.name]);

  useEffect(() => {
    if (!selectedTable || !activeSheet || activeTab !== "describe") return;

    let cancelled = false;
    setDescribeLoading(true);
    fetch(
      `http://localhost:3001/api/describe/${encodeURIComponent(selectedTable.id)}?sheet=${encodeURIComponent(activeSheet.name)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setDescribeReport(data);
      })
      .catch(() => {
        if (!cancelled) setDescribeReport(null);
      })
      .finally(() => {
        if (!cancelled) setDescribeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTable, activeSheet, activeTab]);

  const handleUpload = useCallback(
    async (file: File) => {
      setLoading(true);
      const formData = new FormData();
      formData.append("file", file);
      let fileId = `local_${Date.now()}`;
      try {
        const uploadRes = await fetch(
          "http://localhost:3001/api/files/upload",
          { method: "POST", body: formData },
        );
        if (uploadRes.ok) {
          const meta = await uploadRes.json();
          fileId = meta.id;
        }
      } catch {}
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        let sheets: SrcSheetInfo[];

        if (ext === "json") {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const rows = Array.isArray(parsed)
            ? parsed
            : parsed.data || parsed.rows || [parsed];
          const headers =
            rows.length > 0 ? Object.keys(rows[0]) : [];
          sheets = [
            {
              name: "Sheet1",
              rowCount: rows.length,
              colCount: headers.length,
              headers,
              columns: [],
              preview: rows,
              config: createDefaultTableConfig(
                `${fileId}:Sheet1`,
                `${file.name} / Sheet1`,
              ),
            },
          ];
        } else {
          const XLSX = await import("xlsx");
          const data = await file.arrayBuffer();
          const wb = XLSX.read(data, { type: "array" });
          sheets = wb.SheetNames.map((name) => {
            const ws = wb.Sheets[name];
            const json = XLSX.utils.sheet_to_json<
              Record<string, unknown>
            >(ws, { defval: "" });
            const headers =
              json.length > 0 ? Object.keys(json[0]) : [];
            return {
              name,
              rowCount: json.length,
              colCount: headers.length,
              headers,
              columns: [],
              preview: json,
              config: createDefaultTableConfig(
                `${fileId}:${name}`,
                `${file.name} / ${name}`,
              ),
            };
          });
        }

        const fileType = (
          ext === "json"
            ? "json"
            : ext === "db" || ext === "sqlite" || ext === "sqlite3"
              ? "sqlite"
              : ext || "xlsx"
        ) as SrcTableEntry["fileType"];
        const table: SrcTableEntry = {
          id: fileId,
          fileName: file.name,
          fileSize: file.size,
          fileType,
          uploadedAt: new Date().toISOString(),
          sheets,
          dataHash: `${file.size}_${file.lastModified}`,
        };
        await addTable(table);
        setRows(withRowIds(sheets[0]?.preview || []));
        setTotalRows(sheets[0]?.rowCount || 0);
        setSelectedTableId(fileId);
        setActiveSheetIdx(0);
        setSelectedColIdx(null);
      } catch (e) {
        console.error("解析失败", e);
      }
      setLoading(false);
    },
    [addTable],
  );

  // 重新生成 describe
  const regenerateDescribe = useCallback(() => {
    if (!selectedTable || !activeSheet) return;
    setDescribeLoading(true);
    const fileId = selectedTable.id;
    const sheetName = activeSheet.name;
    // 先清除缓存
    fetch(`http://localhost:3001/api/describe/${fileId}`, { method: "DELETE" })
      .then(() =>
        fetch(
          `http://localhost:3001/api/describe/${fileId}?sheet=${encodeURIComponent(sheetName)}`,
        ),
      )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setDescribeReport(data);
        setDescribeLoading(false);
      })
      .catch(() => setDescribeLoading(false));
  }, [selectedTable, activeSheet]);

  return (
    <div className="page-layout">
      {/* 左侧：数据表列表 */}
      <div className="page-sidebar">
        <div className="page-section-header">
          <span>数据表 ({project?.srcTable.length || 0})</span>
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              border: "1px solid var(--line)",
              borderRadius: 4,
              background: "var(--panel)",
            }}
          >
            + 上传
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.json,.db,.sqlite,.sqlite3"
            style={{ display: "none" }}
            onChange={(e) =>
              e.target.files?.[0] && handleUpload(e.target.files[0])
            }
          />
        </div>
        <div className="page-section-body">
          {!project?.srcTable || project.srcTable.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "20px 0",
                color: "var(--muted)",
                fontSize: 12,
              }}
            >
              <p>暂无数据表</p>
              <p>点击上方「+ 上传」添加</p>
            </div>
          ) : (
            project.srcTable.map((t) => (
              <div
                key={t.id}
                className={`sidebar-item ${selectedTableId === t.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedTableId(t.id);
                  setActiveSheetIdx(0);
                  setSelectedColIdx(null);
                  setActiveTab("table");
                }}
              >
                <span className="sidebar-item-icon">
                  <DesignerIcon name={t.fileType === "json" ? "text" : t.fileType === "sqlite" ? "data" : "table"} />
                </span>
                <div className="sidebar-item-info">
                  <span className="sidebar-item-name">{t.fileName}</span>
                  <span className="sidebar-item-meta">
                    {t.sheets.length} sheets · {(t.fileSize / 1024).toFixed(0)}
                    KB
                  </span>
                </div>
                <button
                  className="sidebar-item-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTable(t.id);
                    if (selectedTableId === t.id) setSelectedTableId(null);
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 中间：数据预览 */}
      <div className="page-main">
        <div className="page-section-header">
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className={
                activeTab === "table" ? "sheet-tab active" : "sheet-tab"
              }
              onClick={() => setActiveTab("table")}
            >
              数据表
            </button>
            <button
              className={
                activeTab === "describe" ? "sheet-tab active" : "sheet-tab"
              }
              onClick={() => setActiveTab("describe")}
            >
              数据概览
            </button>
            <button
              className={
                activeTab === "config" ? "sheet-tab active" : "sheet-tab"
              }
              onClick={() => setActiveTab("config")}
            >
              配置
            </button>
          </div>
          {activeSheet && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>
                {totalRows} 行 × {activeSheetData?.colCount || 0} 列
              </span>
              {selectedRowIdx !== null && selectedRowIdx < rows.length && (
                <button
                  onClick={() => {
                    const rowData = rows[selectedRowIdx];
                    if (rowData) {
                      const source = `${selectedTable?.fileName || ''} / ${activeSheet?.name || ''} / 行${selectedRowIdx + 1}`;
                      setPendingRowData(rowData, source);
                    }
                  }}
                  style={{
                    padding: "3px 10px",
                    fontSize: 11,
                    border: "1px solid var(--accent)",
                    borderRadius: 4,
                    background: "var(--accent)",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  发送到表单 (行 {selectedRowIdx + 1})
                </button>
              )}
            </div>
          )}
        </div>
        <div className="page-section-body" style={{ padding: 0 }}>
          {!activeSheet ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                color: "var(--muted)",
                fontSize: 13,
              }}
            >
              <p>
                {project?.srcTable.length
                  ? "选择左侧数据表查看预览"
                  : "上传数据表开始预览"}
              </p>
            </div>
          ) : activeTab === "table" ? (
            <>
              {selectedTable && selectedTable.sheets.length > 1 && (
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    padding: "6px 12px",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  {selectedTable.sheets.map((s, i) => (
                    <button
                      key={s.name}
                      className={
                        activeSheetIdx === i ? "sheet-tab active" : "sheet-tab"
                      }
                      onClick={() => {
                        setActiveSheetIdx(i);
                        setSelectedColIdx(null);
                      }}
                    >
                      {s.name}
                      <span className="sheet-count">{s.rowCount}</span>
                    </button>
                  ))}
                </div>
              )}
              {loading ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: 40,
                    color: "var(--muted)",
                  }}
                >
                  加载中…
                </div>
              ) : (
                <div
                  className={[
                    agThemeClass,
                    "data-preview-grid",
                    currentConfig?.alternateRowColor === false
                      ? "no-zebra"
                      : "",
                    currentConfig?.showGridLines === false
                      ? "no-grid-lines"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ width: "100%", height: "100%" }}
                >
                  <AgGridReact
                    rowData={rows}
                    columnDefs={colDefs}
                    defaultColDef={{
                      resizable: true,
                      sortable: currentConfig?.sortEnabled !== false,
                      filter: currentConfig?.filterEnabled !== false,
                    }}
                    rowHeight={currentConfig?.rowHeight}
                    headerHeight={currentConfig?.headerHeight}
                    pagination={true}
                    paginationPageSize={100}
                    paginationPageSizeSelector={[50, 100, 200, 500]}
                    animateRows={true}
                    rowSelection="single"
                    onColumnResized={onColumnResized}
                    onColumnMoved={onColumnMoved}
                    onColumnHeaderClicked={(e) => {
                      const field =
                        e.column && "getColDef" in e.column
                          ? e.column.getColDef().field
                          : undefined;
                      if (!field || !activeSheetData) return;
                      const idx = activeSheetData.headers.indexOf(field);
                      setSelectedColIdx(idx >= 0 ? idx : null);
                    }}
                    onCellClicked={(e) => {
                      const field = e.colDef.field;
                      if (!field || !activeSheetData) return;
                      const idx = activeSheetData.headers.indexOf(field);
                      setSelectedColIdx(idx >= 0 ? idx : null);
                      if (e.rowIndex !== null && e.rowIndex !== undefined) {
                        setSelectedRowIdx(e.rowIndex);
                      }
                    }}
                    getRowId={(p) => String(p.data.__rowId)}
                  />
                </div>
              )}
            </>
          ) : activeTab === "describe" ? (
            <div
              className="describe-report"
              style={{ padding: "12px 16px", overflow: "auto", flex: 1 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <h3 style={{ fontSize: 13, fontWeight: 600 }}>数据概览</h3>
                <button
                  onClick={regenerateDescribe}
                  disabled={describeLoading}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    border: "1px solid var(--line)",
                    borderRadius: 4,
                    background: describeLoading ? "#f3f4f6" : "var(--panel)",
                    cursor: describeLoading ? "wait" : "pointer",
                  }}
                >
                  {describeLoading ? "分析中…" : "🔄 重新分析"}
                </button>
              </div>
              {!describeReport ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: 40,
                    color: "var(--muted)",
                  }}
                >
                  {describeLoading ? "正在分析数据…" : "加载数据概览中…"}
                </div>
              ) : (
                <>
                  <div className="describe-overview">
                    <div className="describe-stat">
                      <strong>{describeReport.overview?.rows || 0}</strong>
                      <span>行</span>
                    </div>
                    <div className="describe-stat">
                      <strong>{describeReport.overview?.columns || 0}</strong>
                      <span>列</span>
                    </div>
                    <div className="describe-stat">
                      <strong>
                        {describeReport.overview?.memoryUsage || "-"}
                      </strong>
                      <span>内存</span>
                    </div>
                    <div className="describe-stat">
                      <strong>
                        {describeReport.overview?.duplicateRows || 0}
                      </strong>
                      <span>重复行</span>
                    </div>
                    <div className="describe-stat">
                      <strong>
                        {describeReport.overview?.missingPercent || "0%"}
                      </strong>
                      <span>缺失率</span>
                    </div>
                    <div className="describe-stat">
                      <strong>{describeReport.qualityScore || 0}</strong>
                      <span>质量分</span>
                    </div>
                  </div>
                  <div className="describe-section">
                    <h4>字段信息</h4>
                    <div className="describe-col-list">
                      {describeReport.columns?.map((col: any, i: number) => (
                        <div key={i} className="describe-col-item">
                          <div className="describe-col-header">
                            <span className="describe-col-name">
                              {col.name}
                            </span>
                            {col.hasOutliers && (
                              <span className="describe-outlier-badge">
                                ⚠ {col.outlierCount} 异常值
                              </span>
                            )}
                            <span
                              className="describe-col-type"
                              style={{
                                background:
                                  col.type === "number"
                                    ? "#dbeafe"
                                    : col.type === "category"
                                      ? "#d1fae5"
                                      : "#f3f4f6",
                                color:
                                  col.type === "number"
                                    ? "#1e40af"
                                    : col.type === "category"
                                      ? "#065f46"
                                      : "#6b7280",
                              }}
                            >
                              {col.type}
                            </span>
                          </div>
                          <div className="describe-col-stats">
                            <span>非空: {col.nonNull}</span>
                            <span>唯一: {col.uniqueCount}</span>
                            <span>空值: {col.nullPercent}</span>
                            {col.cardinality && (
                              <span>基数: {col.cardinality}</span>
                            )}
                          </div>
                          {col.stats && (
                            <div
                              className="describe-col-stats"
                              style={{ marginTop: 2 }}
                            >
                              <span>均值: {col.stats.mean}</span>
                              <span>标准差: {col.stats.std}</span>
                              <span>
                                范围: [{col.stats.min}, {col.stats.max}]
                              </span>
                              <span>中位数: {col.stats.median}</span>
                            </div>
                          )}
                          {col.topValues && (
                            <div
                              className="describe-col-stats"
                              style={{ marginTop: 2 }}
                            >
                              <span>
                                Top:{" "}
                                {Object.entries(col.topValues)
                                  .slice(0, 3)
                                  .map(([k, v]) => `${k}(${v})`)
                                  .join(", ")}
                              </span>
                            </div>
                          )}
                          <div className="describe-col-samples">
                            {col.sampleValues
                              ?.slice(0, 4)
                              .map((v: string, j: number) => (
                                <span key={j} className="describe-sample">
                                  {v}
                                </span>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {describeReport.correlations?.numericColumns?.length > 0 && (
                    <div className="describe-section">
                      <h4>相关性矩阵</h4>
                      <div style={{ overflow: "auto" }}>
                        <table className="corr-table">
                          <thead>
                            <tr>
                              <th className="corr-corner"></th>
                              {describeReport.correlations.numericColumns.map(
                                (c: string) => (
                                  <th key={c} className="corr-header">
                                    {c.length > 10 ? c.slice(0, 10) + "…" : c}
                                  </th>
                                ),
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {describeReport.correlations.matrix.map(
                              (row: number[], i: number) => (
                                <tr key={i}>
                                  <th className="corr-row-header">
                                    {describeReport.correlations.numericColumns[i]?.length > 10
                                      ? describeReport.correlations.numericColumns[i].slice(0, 10) + "…"
                                      : describeReport.correlations.numericColumns[i]}
                                  </th>
                                  {row.map((v: number, j: number) => {
                                    const abs = Math.abs(v);
                                    const bg = i === j
                                      ? "#e5e7eb"
                                      : v > 0
                                        ? `rgba(34,197,94,${abs * 0.8})`
                                        : `rgba(239,68,68,${abs * 0.8})`;
                                    return (
                                      <td
                                        key={j}
                                        className="corr-cell"
                                        style={{ background: bg }}
                                        title={`${describeReport.correlations.numericColumns[i]} × ${describeReport.correlations.numericColumns[j]}: ${v.toFixed(3)}`}
                                      >
                                        {v.toFixed(2)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {describeReport.distributions?.length > 0 && (
                    <div className="describe-section">
                      <h4>值分布</h4>
                      {describeReport.distributions.map(
                        (dist: any, i: number) => {
                          const max = Math.max(...(dist.histogram || [1]));
                          return (
                            <div key={i} className="dist-container">
                              <div className="dist-header">
                                <span className="dist-name">{dist.columnName}</span>
                                <span className="dist-range">
                                  {dist.bins?.[0]?.range?.split("-")[0]} ~ {dist.bins?.[dist.bins.length - 1]?.range?.split("-")[1]}
                                </span>
                              </div>
                              <div className="dist-chart">
                                {dist.bins?.map((bin: any, j: number) => {
                                  const count = dist.histogram[j] || 0;
                                  const pct = max > 0 ? (count / max) * 100 : 0;
                                  return (
                                    <div key={j} className="dist-row">
                                      <span className="dist-label">{bin.range.split("-")[0]}</span>
                                      <div className="dist-bar-track">
                                        <div
                                          className="dist-bar-fill"
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                      <span className="dist-count">{count}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                  {describeReport.timeSeries?.length > 0 && (
                    <div className="describe-section">
                      <h4>时序分析</h4>
                      {describeReport.timeSeries.map((ts: any, i: number) => (
                        <div
                          key={i}
                          className="describe-col-item"
                          style={{ marginBottom: 8 }}
                        >
                          <div className="describe-col-header">
                            <span className="describe-col-name">
                              {ts.columnName}
                            </span>
                            <span
                              className="describe-col-type"
                              style={{
                                background: "#fce7f3",
                                color: "#9d174d",
                              }}
                            >
                              date
                            </span>
                          </div>
                          <div className="describe-col-stats">
                            <span>起始: {ts.min}</span>
                            <span>结束: {ts.max}</span>
                            {ts.range_days && (
                              <span>跨度: {ts.range_days} 天</span>
                            )}
                            {ts.frequency && <span>频率: {ts.frequency}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {describeReport.oscillations?.length > 0 && (
                    <div className="describe-section">
                      <h4>震荡检测</h4>
                      {describeReport.oscillations.map(
                        (osc: any, i: number) => (
                          <div
                            key={i}
                            className="osc-item"
                          >
                            <div className="osc-header">
                              <span className="osc-name">
                                {osc.columnName}
                              </span>
                              <span
                                className="osc-badge"
                                style={{
                                  background: osc.isHighOscillation
                                    ? "#fef2f2"
                                    : "#fef3c7",
                                  color: osc.isHighOscillation
                                    ? "#991b1b"
                                    : "#92400e",
                                }}
                              >
                                {osc.isHighOscillation ? "高震荡" : "中等震荡"}
                              </span>
                            </div>
                            <div className="osc-metrics">
                              <div className="osc-metric">
                                <span className="osc-metric-label">震荡率</span>
                                <div className="osc-bar-track">
                                  <div
                                    className="osc-bar-fill"
                                    style={{
                                      width: `${osc.oscillationRatio * 100}%`,
                                      background: osc.isHighOscillation
                                        ? "#ef4444"
                                        : "#f59e0b",
                                    }}
                                  />
                                </div>
                                <span className="osc-metric-value">
                                  {(osc.oscillationRatio * 100).toFixed(1)}%
                                </span>
                              </div>
                              <div className="osc-metric">
                                <span className="osc-metric-label">波动率</span>
                                <div className="osc-bar-track">
                                  <div
                                    className="osc-bar-fill"
                                    style={{
                                      width: `${Math.min(osc.volatility * 100, 100)}%`,
                                      background: osc.volatility > 1
                                        ? "#ef4444"
                                        : "#3b82f6",
                                    }}
                                  />
                                </div>
                                <span className="osc-metric-value">
                                  {osc.volatility}
                                </span>
                              </div>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="table-config-panel">
              {currentConfig && (
                <>
                  <div className="config-summary">
                    <div>
                      <h3>数据表配置</h3>
                      <p>
                        {selectedTable?.fileName || "-"} /{" "}
                        {activeSheet?.name || "-"}
                      </p>
                    </div>
                    <div className="config-summary-stats">
                      <span>{activeSheet?.rowCount || 0} 行</span>
                      <span>{activeSheet?.colCount || 0} 列</span>
                      <span>
                        {Object.keys(currentConfig.columnWidths).length} 个列宽
                      </span>
                    </div>
                  </div>

                  <div className="settings-form">
                    <section className="settings-group">
                      <h4>尺寸</h4>
                      <div className="settings-grid">
                        <label>
                          <span>表头高度</span>
                          <input
                            type="number"
                            value={currentConfig.headerHeight}
                            min={24}
                            max={80}
                            onChange={(e) =>
                              updateConfig({
                                headerHeight: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>行高</span>
                          <input
                            type="number"
                            value={currentConfig.rowHeight}
                            min={20}
                            max={64}
                            onChange={(e) =>
                              updateConfig({ rowHeight: Number(e.target.value) })
                            }
                          />
                        </label>
                        <label>
                          <span>冻结列数</span>
                          <input
                            type="number"
                            value={currentConfig.frozenColumns}
                            min={0}
                            max={10}
                            onChange={(e) =>
                              updateConfig({
                                frozenColumns: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>冻结行数</span>
                          <input
                            type="number"
                            value={currentConfig.frozenRows}
                            min={0}
                            max={10}
                            onChange={(e) =>
                              updateConfig({
                                frozenRows: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                    </section>

                    <section className="settings-group">
                      <h4>交互</h4>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={currentConfig.filterEnabled}
                          onChange={(e) =>
                            updateConfig({ filterEnabled: e.target.checked })
                          }
                        />
                        <span>启用筛选</span>
                      </label>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={currentConfig.sortEnabled}
                          onChange={(e) =>
                            updateConfig({ sortEnabled: e.target.checked })
                          }
                        />
                        <span>启用排序</span>
                      </label>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={currentConfig.autoFitColumns}
                          onChange={(e) =>
                            updateConfig({ autoFitColumns: e.target.checked })
                          }
                        />
                        <span>自动列宽</span>
                      </label>
                    </section>

                    <section className="settings-group">
                      <h4>显示</h4>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={currentConfig.alternateRowColor}
                          onChange={(e) =>
                            updateConfig({
                              alternateRowColor: e.target.checked,
                            })
                          }
                        />
                        <span>交替行颜色</span>
                      </label>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={currentConfig.showGridLines}
                          onChange={(e) =>
                            updateConfig({ showGridLines: e.target.checked })
                          }
                        />
                        <span>显示网格线</span>
                      </label>
                    </section>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 右侧：字段信息 */}
      <div className="page-inspector">
        <div className="page-section-header">
          <span>{selectedCol ? selectedCol.name : "字段信息"}</span>
          {selectedCol && (
            <span className={`column-type type-${selectedCol.dataType}`}>
              {selectedCol.dataType}
            </span>
          )}
        </div>
        <div className="page-section-body">
          {!selectedCol ? (
            <div
              style={{
                padding: "20px 0",
                color: "var(--muted)",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              <p>点击表格列头查看字段详情</p>
            </div>
          ) : (
            <div className="column-detail">
              <label>
                <span>字段名</span>
                <input value={selectedCol.name} readOnly />
              </label>
              <label>
                <span>数据类型</span>
                <input value={selectedCol.dataType} readOnly />
              </label>
              <label>
                <span>唯一值</span>
                <input value={String(selectedCol.uniqueCount)} readOnly />
              </label>
              <label>
                <span>可空</span>
                <input value={selectedCol.nullable ? "是" : "否"} readOnly />
              </label>
              <label>
                <span>样本值</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {selectedCol.sampleValues.map((v, i) => (
                    <span key={i} className="sample-tag">
                      {String(v)}
                    </span>
                  ))}
                </div>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
