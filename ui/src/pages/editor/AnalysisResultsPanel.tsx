import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, Spin, Tag } from "antd";
import {
  operationTemplateClient,
  TemplateConfirmationRequired,
  TemplateToolError,
  type AnalysisResultRecord,
} from "../../services/templates/operationTemplateClient";
import type { TemplateDiagnostic } from "./TemplateDiagnosticPanel";
import { useAppInteraction } from "../../components/AppInteractionProvider";

function resultRows(
  record: AnalysisResultRecord,
): Array<Record<string, unknown>> {
  const result = record.result || {};
  for (const key of [
    "groups",
    "matrix",
    "predictions",
    "forecast",
    "anomalies",
    "detail",
  ]) {
    const value = result[key];
    if (Array.isArray(value))
      return value
        .slice(0, 100)
        .map((item, index) =>
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : { 序号: index + 1, 结果: item },
        );
  }
  return [];
}

function metricEntries(record: AnalysisResultRecord) {
  const entries: Array<[string, number]> = [];
  for (const [key, value] of Object.entries(record.metrics || {}))
    if (typeof value === "number" && Number.isFinite(value))
      entries.push([key, value]);
  const cards = record.result?.cards;
  if (cards && typeof cards === "object")
    for (const [field, summary] of Object.entries(
      cards as Record<string, unknown>,
    )) {
      if (summary && typeof summary === "object")
        for (const [key, value] of Object.entries(
          summary as Record<string, unknown>,
        ))
          if (typeof value === "number" && Number.isFinite(value))
            entries.push([`${field} · ${key}`, value]);
    }
  return entries.slice(0, 8);
}

export default function AnalysisResultsPanel({
  projectId,
  onDiagnostic,
}: {
  projectId: string;
  onDiagnostic(value?: TemplateDiagnostic): void;
}) {
  const [records, setRecords] = useState<AnalysisResultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string>();
  const [writebackFields, setWritebackFields] = useState<
    Record<string, string>
  >({});
  const [writingId, setWritingId] = useState<string>();
  const { confirm, announce } = useAppInteraction();
  const load = () => {
    setLoading(true);
    onDiagnostic(undefined);
    operationTemplateClient
      .listAnalysisResults(projectId)
      .then((items) => setRecords([...items].reverse()))
      .catch((error) =>
        onDiagnostic({
          title: "分析结果加载失败",
          error: error as Error,
          action: "list-analysis-results",
        }),
      )
      .finally(() => setLoading(false));
  };
  useEffect(load, [projectId]);
  const staleCount = useMemo(
    () => records.filter((item) => item.stale).length,
    [records],
  );
  const writeback = async (record: AnalysisResultRecord) => {
    const fieldName = writebackFields[record.id]?.trim();
    if (!fieldName) return;
    setWritingId(record.id);
    onDiagnostic(undefined);
    try {
      const revision = await operationTemplateClient.getRevision(projectId);
      const key = `prediction-writeback-${crypto.randomUUID()}`;
      try {
        await operationTemplateClient.writebackPrediction(
          projectId,
          record.id,
          fieldName,
          revision,
          key,
        );
      } catch (error) {
        if (
          !(error instanceof TemplateToolError) ||
          error.code !== "WRITEBACK_FIELD_EXISTS"
        )
          throw error;
        if (
          !(await confirm({
            title: "覆盖已有预测字段",
            message: `字段“${fieldName}”已经存在。用本次预测结果覆盖全部行？`,
            detail: "系统仍会检查输入数据版本，数据已变化时不会写回。",
            confirmLabel: "覆盖字段",
            destructive: true,
          }))
        )
          return;
        try {
          await operationTemplateClient.writebackPrediction(
            projectId,
            record.id,
            fieldName,
            revision,
            key,
            true,
          );
        } catch (confirmation) {
          if (confirmation instanceof TemplateConfirmationRequired)
            await operationTemplateClient.writebackPrediction(
              projectId,
              record.id,
              fieldName,
              revision,
              key,
              true,
              confirmation.token,
            );
          else throw confirmation;
        }
      }
      announce(`预测结果已写回 ${fieldName}`);
      load();
    } catch (error) {
      onDiagnostic({
        title: "预测结果写回失败",
        error: error as Error,
        action: "prediction-writeback",
      });
    } finally {
      setWritingId(undefined);
    }
  };
  if (loading)
    return (
      <div className="template-loading">
        <Spin />
        <span>正在核对结果与当前数据版本…</span>
      </div>
    );
  return (
    <section
      className="analysis-results"
      aria-labelledby="analysis-results-heading"
    >
      <div className="section-heading">
        <div>
          <h2 id="analysis-results-heading">分析与预测结果</h2>
          <p>
            结果、模型版本和输入数据版本放在一起；数据变化后会明确标记过期。
          </p>
        </div>
        <div>
          <Tag color={staleCount ? "orange" : "green"}>
            {staleCount} 个已过期
          </Tag>
          <Button onClick={load}>刷新状态</Button>
        </div>
      </div>
      {records.length ? (
        <div className="analysis-result-list">
          {records.map((record) => {
            const metrics = metricEntries(record);
            const rows = resultRows(record);
            const headers = [
              ...new Set(rows.flatMap((row) => Object.keys(row))),
            ].slice(0, 10);
            const numericHeader = headers.find((header) =>
              rows.some((row) => typeof row[header] === "number"),
            );
            const max = numericHeader
              ? Math.max(
                  1,
                  ...rows.map((row) =>
                    Math.abs(Number(row[numericHeader]) || 0),
                  ),
                )
              : 1;
            const expanded = expandedId === record.id;
            const canWriteback =
              ["regression-prediction", "classification-prediction"].includes(
                record.templateId,
              ) &&
              record.status === "succeeded" &&
              record.usable &&
              !record.stale;
            return (
              <article
                className={`analysis-result-card ${record.stale ? "stale" : ""}`}
                key={record.id}
              >
                <header>
                  <div>
                    <strong>{record.templateName || record.templateId}</strong>
                    <span>
                      {new Date(record.completedAt).toLocaleString()} ·{" "}
                      {record.modelVersion}
                    </span>
                  </div>
                  <div>
                    <Tag
                      color={
                        record.status === "failed"
                          ? "red"
                          : record.usable
                            ? "green"
                            : "orange"
                      }
                    >
                      {record.status === "failed"
                        ? "运行失败"
                        : record.usable
                          ? "结果可用"
                          : "需要复核"}
                    </Tag>
                    {record.stale && <Tag color="orange">结果已过期</Tag>}
                  </div>
                </header>
                {record.stale && (
                  <Alert
                    showIcon
                    type="warning"
                  title="输入数据已变化"
                    description={
                      record.staleReason || "请重新运行后再用于决策。"
                    }
                  />
                )}
                {record.error && (
                  <Alert
                    showIcon
                    type="error"
                  title="结果不可用"
                    description={record.error}
                  />
                )}
                {metrics.length > 0 && (
                  <div className="analysis-metrics" aria-label="关键指标">
                    {metrics.map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>
                          {Number(value.toFixed(4)).toLocaleString()}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
                {rows.length > 0 && (
                  <div
                    className="analysis-chart"
                    role="img"
                    aria-label={`${record.templateId} 前 ${Math.min(rows.length, 12)} 条结果图`}
                  >
                    <div className="analysis-bars">
                      {rows.slice(0, 12).map((row, index) => {
                        const value = numericHeader
                          ? Number(row[numericHeader]) || 0
                          : index + 1;
                        return (
                          <span
                            key={index}
                            title={`${numericHeader || "序号"}：${value}`}
                            style={{
                              height: `${Math.max(4, (Math.abs(value) / max) * 100)}%`,
                            }}
                          />
                        );
                      })}
                    </div>
                    <small>
                      {numericHeader
                        ? `${numericHeader}（结果预览）`
                        : "记录数量预览"}
                    </small>
                  </div>
                )}
                {canWriteback && (
                  <div className="prediction-writeback">
                    <div>
                      <strong>可选写回</strong>
                      <span>
                        写回到 {record.input?.tableId}/{record.input?.sheetName}
                        ；数据版本变化时自动阻止。
                      </span>
                    </div>
                    <Input
                      value={writebackFields[record.id] || ""}
                      onChange={(event) =>
                        setWritebackFields((current) => ({
                          ...current,
                          [record.id]: event.target.value,
                        }))
                      }
                      placeholder="新字段名，例如：预测利润"
                      aria-label={`${record.templateId} 写回字段名`}
                    />
                    <Button
                      onClick={() => void writeback(record)}
                      loading={writingId === record.id}
                      disabled={!writebackFields[record.id]?.trim()}
                    >
                      写回预测
                    </Button>
                  </div>
                )}
                <div className="analysis-result-actions">
                  <Button
                    onClick={() =>
                      setExpandedId(expanded ? undefined : record.id)
                    }
                    disabled={!rows.length}
                  >
                    {expanded ? "收起明细" : `查看明细（${rows.length}）`}
                  </Button>
                  <Button
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        JSON.stringify(record, null, 2),
                      )
                    }
                  >
                    复制结果 JSON
                  </Button>
                </div>
                {expanded && (
                  <div className="analysis-table-wrap">
                    <table>
                      <caption>
                        {record.templateId} 结果明细，最多显示 100 行
                      </caption>
                      <thead>
                        <tr>
                          {headers.map((header) => (
                            <th scope="col" key={header}>
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, index) => (
                          <tr key={index}>
                            {headers.map((header) => (
                              <td key={header}>
                                {typeof row[header] === "object"
                                  ? JSON.stringify(row[header])
                                  : String(row[header] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="template-empty-state">
          <strong>还没有分析结果</strong>
          <p>运行分析或预测模板后，这里会显示指标、图表、明细和过期状态。</p>
        </div>
      )}
    </section>
  );
}
