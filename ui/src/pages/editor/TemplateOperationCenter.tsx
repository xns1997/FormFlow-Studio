import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Input, Select, Spin, Tag, notification } from "antd";
import { useNavigate } from "react-router-dom";
import { useProjectStore } from "../../project/store";
import { useAppInteraction } from "../../components/AppInteractionProvider";
import {
  operationTemplateClient,
  type FeasibilityReport,
  type OperationTemplateCatalogItem,
  type TemplateCategory,
} from "../../services/templates/operationTemplateClient";
import DataRelationsPanel from "./DataRelationsPanel";
import TemplateDiagnosticPanel, {
  type TemplateDiagnostic,
} from "./TemplateDiagnosticPanel";
import TemplateInstancesPanel from "./TemplateInstancesPanel";
import AnalysisResultsPanel from "./AnalysisResultsPanel";
import "./template-operation-center.css";

type CenterView = "library" | "instances" | "relations" | "results";
const categories: Array<{ id: "all" | TemplateCategory; label: string }> = [
  { id: "all", label: "全部" },
  { id: "entry", label: "数据录入" },
  { id: "maintenance", label: "查询与维护" },
  { id: "cross-table", label: "跨表业务" },
  { id: "analysis", label: "数据分析" },
  { id: "prediction", label: "数据预测" },
];
const statusLabel = {
  ready: "可以创建",
  "needs-configuration": "需要补充配置",
  warning: "可以创建，但需确认风险",
  blocked: "暂时不能创建",
  "not-applicable": "不适用于当前选择",
} as const;
const parameterLabels: Record<string, string> = {
  formId: "表单 ID",
  name: "生成名称",
  title: "表单标题",
  subtitle: "表单副标题",
  selectedFields: "录入字段",
  columns: "布局列数",
  includeReset: "显示重置按钮",
  saveLabel: "保存按钮文案",
  lookupLabel: "查询按钮文案",
  queryFields: "查询条件",
  editableFields: "可编辑字段",
  maxChanges: "单次最大修改数",
  atomic: "要求原子提交",
  existingPolicy: "记录已存在时",
  relationId: "数据关系",
  allowEmptyDetails: "允许空明细",
  submitLabel: "提交按钮文案",
  previewRows: "预览样本行数",
  detailRows: "结果显示行数",
  metrics: "指标字段",
  dimensions: "分组维度",
  rowDimension: "行维度",
  columnDimension: "列维度",
  aggregation: "聚合方式",
  timeField: "时间字段",
  metric: "数值指标",
  grain: "时间粒度",
  fields: "分析字段",
  contamination: "预期异常比例",
  target: "预测目标",
  features: "特征字段",
  validationRatio: "验证集比例",
  horizon: "预测期数",
};
const fieldParameters = new Set([
  "selectedFields",
  "queryFields",
  "editableFields",
  "metrics",
  "dimensions",
  "rowDimension",
  "columnDimension",
  "timeField",
  "metric",
  "fields",
  "target",
  "features",
]);

function summaryText(template: OperationTemplateCatalogItem) {
  return [
    ["表单", template.generation.forms],
    ["流程", template.generation.workflows],
    ["输出", template.generation.outputs],
    ["测试", template.generation.tests],
  ]
    .filter(([, count]) => Number(count) > 0)
    .map(([label, count]) => `${count} 个${label}`)
    .join(" · ");
}

export default function TemplateOperationCenter({
  variant = "page",
  initialView = "library",
}: {
  variant?: "page" | "modal";
  initialView?: CenterView;
}) {
  const navigate = useNavigate();
  const project = useProjectStore((state) => state.project);
  const refreshProject = useProjectStore((state) => state.refreshProject);
  const { announce } = useAppInteraction();
  const [view, setView] = useState<CenterView>(initialView);
  const [catalog, setCatalog] = useState<OperationTemplateCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string>();
  const [category, setCategory] = useState<"all" | TemplateCategory>("all");
  const [query, setQuery] = useState("");
  const [templateId, setTemplateId] = useState<string>();
  const [tableIds, setTableIds] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState<string>();
  const [fields, setFields] = useState<string[]>([]);
  const [relationIds, setRelationIds] = useState<string[]>([]);
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [presetName, setPresetName] = useState("");
  const [report, setReport] = useState<FeasibilityReport>();
  const [planned, setPlanned] = useState<{
    plan: Record<string, any>;
    revision: string;
  }>();
  const [diagnostic, setDiagnostic] = useState<TemplateDiagnostic>();
  const [tablesRefreshing, setTablesRefreshing] = useState(false);
  const retryRef = useRef<(() => void) | undefined>(undefined);
  const packageInputRef = useRef<HTMLInputElement>(null);
  const attemptedTableRefreshRef = useRef(false);

  const loadCatalog = () => {
    setLoading(true);
    operationTemplateClient
      .list(project?.config.id)
      .then(setCatalog)
      .catch((error) =>
        setDiagnostic({
          title: "模板目录加载失败",
          error,
          action: "load-catalog",
        }),
      )
      .finally(() => setLoading(false));
  };
  useEffect(loadCatalog, []);
  const selected = catalog.find((item) => item.id === templateId);
  const tables = project?.srcTable || [];
  const primaryTable = tables.find((item) => item.id === tableIds[0]);
  const sheet =
    primaryTable?.sheets.find((item) => item.name === sheetName) ||
    primaryTable?.sheets[0];
  const visible = useMemo(
    () =>
      catalog.filter(
        (item) =>
          (category === "all" || item.category === category) &&
          (!query.trim() ||
            `${item.name}${item.description}`
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase())),
      ),
    [catalog, category, query],
  );
  const contract = selected?.selectionContract as
    | { minTables?: number; maxTables?: number; requiresRelation?: boolean }
    | undefined;
  const multiTable =
    Number(contract?.minTables || 1) > 1 ||
    Number(contract?.maxTables || 1) > 1;

  const reloadTables = async () => {
    if (!project?.config.id) return;
    setTablesRefreshing(true);
    try {
      await refreshProject();
      announce("已重新读取项目数据表");
    } catch (error) {
      fail("重新读取数据表失败", error, "refresh-project-tables");
    } finally {
      setTablesRefreshing(false);
    }
  };

  useEffect(() => {
    if (!project?.config.id || tables.length || attemptedTableRefreshRef.current)
      return;
    attemptedTableRefreshRef.current = true;
    void reloadTables();
  }, [project?.config.id, tables.length]);

  useEffect(() => {
    setSheetName(primaryTable?.sheets[0]?.name);
    setFields([]);
    setReport(undefined);
    setPlanned(undefined);
  }, [tableIds.join("|")]);
  useEffect(() => {
    if (!tables.length || tableIds.length) return;
    const defaultTables = multiTable
      ? tables.slice(0, Math.max(1, Number(contract?.minTables || 1)))
      : tables.slice(0, 1);
    setTableIds(defaultTables.map((item) => item.id));
  }, [tables, tableIds.length, multiTable, contract?.minTables]);
  useEffect(() => {
    setParameters({});
    setReport(undefined);
    setPlanned(undefined);
    setRelationIds([]);
    setDiagnostic(undefined);
  }, [templateId]);
  useEffect(() => {
    if (relationIds[0])
      setParameters((current) => ({ ...current, relationId: relationIds[0] }));
  }, [relationIds]);
  const selection = {
    tableId: tableIds[0],
    tableIds,
    sheetName: sheet?.name,
    fields,
    relationIds,
  };

  const fail = (
    title: string,
    error: unknown,
    action: string,
    retry?: () => void,
  ) => {
    retryRef.current = retry;
    setDiagnostic({ title, error: error as Error, action });
    announce(
      `${title}：${error instanceof Error ? error.message : String(error)}`,
    );
  };
  const updateParameter = (
    name: string,
    schema: Record<string, any>,
    value: unknown,
  ) => {
    setParameters((current) => ({ ...current, [name]: value }));
    setReport(undefined);
    setPlanned(undefined);
  };
  const analyze = async () => {
    if (!project || !selected) return;
    setBusyAction("analyze");
    setPlanned(undefined);
    setDiagnostic(undefined);
    try {
      const next = await operationTemplateClient.analyze(
        project.config.id,
        selected.id,
        selection,
        parameters,
      );
      setReport(next);
      announce(next.summary);
    } catch (error) {
      fail("可行性检查失败", error, "analyze-template", () => void analyze());
    } finally {
      setBusyAction(undefined);
    }
  };
  const preview = async () => {
    if (!project || !selected) return;
    setBusyAction("preview");
    setDiagnostic(undefined);
    try {
      const nextReport = await operationTemplateClient.analyze(
        project.config.id,
        selected.id,
        selection,
        parameters,
      );
      setReport(nextReport);
      if (
        nextReport.status === "blocked" ||
        nextReport.status === "needs-configuration"
      ) {
        announce(nextReport.summary);
        return;
      }
      const next = await operationTemplateClient.plan(
        project.config.id,
        selected.id,
        selection,
        parameters,
      );
      setPlanned(next);
      announce("生成内容预览已就绪");
    } catch (error) {
      fail("无法生成预览", error, "preview-template", () => void preview());
    } finally {
      setBusyAction(undefined);
    }
  };
  const apply = async () => {
    if (!project || !planned || !selected) return;
    setBusyAction("apply");
    setDiagnostic(undefined);
    try {
      const applied = await operationTemplateClient.apply(
        project.config.id,
        planned.revision,
        planned.plan,
      );
      let nextView: CenterView = "instances";
      if (
        selected.category === "analysis" ||
        selected.category === "prediction"
      ) {
        try {
          await operationTemplateClient.runAnalysis(
            project.config.id,
            applied.revision,
            selected.id,
            selection,
            parameters,
          );
          nextView = "results";
        } catch (analysisError) {
          fail("模板已创建，但首次运行失败", analysisError, "run-analysis");
        }
      }
      await refreshProject();
      notification.success({
        message:
          nextView === "results" ? "模板已创建并完成首次运行" : "模板已创建",
        description:
          selected.id === "single-table-batch-update"
            ? "正在打开可跨页修改、一次原子提交的数据工作台。"
            : nextView === "results"
              ? "结果、图表、明细和数据版本已保存。"
              : "表单、流程、输出和测试已原子写入项目。",
      });
      announce(
        nextView === "results" ? "模板已创建并完成首次运行" : "模板已创建",
      );
      setPlanned(undefined);
      setReport(undefined);
      if (selected.id === "single-table-batch-update") {
        navigate(
          `/projects/${encodeURIComponent(project.config.id)}/editor?mode=data&table=${encodeURIComponent(String(selection.tableId))}&sheet=${encodeURIComponent(String(selection.sheetName || ""))}`,
        );
        return;
      }
      setView(nextView);
    } catch (error) {
      fail("模板创建失败", error, "apply-template", () => void apply());
    } finally {
      setBusyAction(undefined);
    }
  };
  const onChanged = async () => {
    await refreshProject();
  };
  const savePreset = async () => {
    if (!project || !selected || !presetName.trim()) return;
    setBusyAction("preset");
    try {
      const revision = await operationTemplateClient.getRevision(
        project.config.id,
      );
      await operationTemplateClient.savePreset(project.config.id, revision, {
        id: `preset_${crypto.randomUUID().split("-").join("")}`,
        name: presetName.trim(),
        templateId: selected.id,
        parameters,
      });
      await refreshProject();
      setPresetName("");
      announce("参数预设已保存");
    } catch (error) {
      fail(
        "保存参数预设失败",
        error,
        "save-template-preset",
        () => void savePreset(),
      );
    } finally {
      setBusyAction(undefined);
    }
  };
  const exportTemplate = async () => {
    if (!project || !selected) return;
    try {
      const packageValue = await operationTemplateClient.exportPackage(
        project.config.id,
        [selected.id],
      );
      const blob = new Blob([JSON.stringify(packageValue, null, 2)], {
        type: "application/json",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${selected.id}-${selected.version}.formflow-template.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      announce(`已导出模板 ${selected.name}`);
    } catch (error) {
      fail(
        "导出模板失败",
        error,
        "export-template",
        () => void exportTemplate(),
      );
    }
  };
  const importTemplate = async (file?: File) => {
    if (!project || !file) return;
    setBusyAction("import");
    try {
      const packageValue = JSON.parse(await file.text()) as Record<
        string,
        unknown
      >;
      const revision = await operationTemplateClient.getRevision(
        project.config.id,
      );
      const result = await operationTemplateClient.importPackage(
        project.config.id,
        revision,
        packageValue,
      );
      await refreshProject();
      loadCatalog();
      notification.success({
        message: `已导入 ${result.imported.length} 个模板`,
      });
      announce(`已导入 ${result.imported.length} 个模板`);
    } catch (error) {
      fail("导入模板失败", error, "import-template");
    } finally {
      setBusyAction(undefined);
      if (packageInputRef.current) packageInputRef.current.value = "";
    }
  };
  const selectTemplate = (id: string) => {
    setTemplateId(id);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          ".template-wizard select, .template-wizard input, .template-wizard .ant-select-selector",
        )
        ?.focus(),
    );
  };
  const moveTabFocus = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
      return;
    const tabs = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        ':scope > [role="tab"]',
      ) || [],
    );
    const current = tabs.indexOf(event.currentTarget);
    if (current < 0 || !tabs.length) return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
            tabs.length;
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  };

  if (!project)
    return (
      <div className="template-center-empty">
        <strong>未打开项目</strong>
        <p>请先从项目列表打开一个项目。</p>
      </div>
    );
  const requiredTables = Number(contract?.minTables || 1);
  const tableSelectionReady = tableIds.length >= requiredTables;
  const parameterEntries = Object.entries(
    selected?.parameterSchema.properties || {},
  );
  const requiredParameters = new Set(selected?.parameterSchema.required || []);
  const requiredParameterEntries = parameterEntries.filter(([name]) => requiredParameters.has(name));
  const optionalParameterEntries = parameterEntries.filter(([name]) => !requiredParameters.has(name));

  const parameterControl = (name: string, schema: Record<string, any>) => {
    if (name === "relationId")
      return (
        <Select<string>
          value={parameters[name] as string | undefined}
          onChange={(value) => {
            updateParameter(name, schema, value);
            setRelationIds(value ? [value] : []);
          }}
          placeholder="选择数据关系"
          options={(project.relations || []).map((item) => ({
            value: item.id,
            label: item.name,
          }))}
        />
      );
    if (fieldParameters.has(name) && sheet) {
      const multiple = schema.type === "array";
      return (
        <Select
          mode={multiple ? "multiple" : undefined}
          value={parameters[name] as any}
          onChange={(value) => updateParameter(name, schema, value)}
          placeholder={`选择${parameterLabels[name] || name}`}
          options={sheet.headers.map((field) => ({
            value: field,
            label: field,
          }))}
        />
      );
    }
    if (schema.enum)
      return (
        <Select
          value={parameters[name]}
          onChange={(value) => updateParameter(name, schema, value)}
          options={schema.enum.map((value: string) => ({
            value,
            label: value,
          }))}
        />
      );
    if (schema.type === "boolean")
      return (
        <Select
          value={parameters[name]}
          onChange={(value) => updateParameter(name, schema, value)}
          options={[
            { value: true, label: "是" },
            { value: false, label: "否" },
          ]}
        />
      );
    return (
      <Input
        value={String(parameters[name] ?? "")}
        type={
          schema.type === "number" || schema.type === "integer"
            ? "number"
            : "text"
        }
        placeholder={
          schema.default !== undefined
            ? `默认：${schema.default}`
            : `填写${parameterLabels[name] || name}`
        }
        onChange={(event) =>
          updateParameter(
            name,
            schema,
            schema.type === "number" || schema.type === "integer"
              ? event.target.value === ""
                ? undefined
                : Number(event.target.value)
              : event.target.value,
          )
        }
      />
    );
  };

  return (
    <div className={`template-center-shell ${variant === "modal" ? "template-center-shell-modal" : ""}`}>
      <header className={`template-center-header ${variant === "modal" ? "is-modal" : ""}`}>
        <div>
          <h1>{variant === "modal" ? "操作模板" : "模板化操作中心"}</h1>
          <p>
            {variant === "modal"
              ? "在当前上下文里选择模板、完成检查，再把生成结果写回项目。"
              : "发现适用能力，先检查再生成；所有失败都保留定位和恢复方式。"}
          </p>
        </div>
        <div className="template-center-summary">
          <span>
            <strong>{catalog.length}</strong> 个模板
          </span>
          <span>
            <strong>{project.relations?.length || 0}</strong> 个关系
          </span>
          <span>
            <strong>
              {project.templateInstances?.filter(
                (item) => item.status === "managed",
              ).length || 0}
            </strong>{" "}
            个受管实例
          </span>
        </div>
      </header>
      <nav
        className="template-center-nav"
        role="tablist"
        aria-label="模板中心功能"
      >
        <button
          id="template-tab-library"
          role="tab"
          aria-selected={view === "library"}
          aria-controls="template-panel-library"
          tabIndex={view === "library" ? 0 : -1}
          onClick={() => setView("library")}
          onKeyDown={moveTabFocus}
        >
          模板库
        </button>
        <button
          id="template-tab-instances"
          role="tab"
          aria-selected={view === "instances"}
          aria-controls="template-panel-instances"
          tabIndex={view === "instances" ? 0 : -1}
          onClick={() => setView("instances")}
          onKeyDown={moveTabFocus}
        >
          已安装实例
        </button>
        <button
          id="template-tab-relations"
          role="tab"
          aria-selected={view === "relations"}
          aria-controls="template-panel-relations"
          tabIndex={view === "relations" ? 0 : -1}
          onClick={() => setView("relations")}
          onKeyDown={moveTabFocus}
        >
          数据关系
        </button>
        <button
          id="template-tab-results"
          role="tab"
          aria-selected={view === "results"}
          aria-controls="template-panel-results"
          tabIndex={view === "results" ? 0 : -1}
          onClick={() => setView("results")}
          onKeyDown={moveTabFocus}
        >
          分析结果
        </button>
      </nav>
      <TemplateDiagnosticPanel
        diagnostic={diagnostic}
        onDismiss={() => setDiagnostic(undefined)}
        {...(retryRef.current ? { onRetry: retryRef.current } : {})}
      />
      {view === "instances" && (
        <div
          id="template-panel-instances"
          role="tabpanel"
          aria-labelledby="template-tab-instances"
        >
          <TemplateInstancesPanel
            project={project}
            onChanged={onChanged}
            onDiagnostic={setDiagnostic}
          />
        </div>
      )}
      {view === "relations" && (
        <div
          id="template-panel-relations"
          role="tabpanel"
          aria-labelledby="template-tab-relations"
        >
          <DataRelationsPanel
            project={project}
            onChanged={onChanged}
            onDiagnostic={setDiagnostic}
          />
        </div>
      )}
      {view === "results" && (
        <div
          id="template-panel-results"
          role="tabpanel"
          aria-labelledby="template-tab-results"
        >
          <AnalysisResultsPanel
            projectId={project.config.id}
            onDiagnostic={setDiagnostic}
          />
        </div>
      )}
      {view === "library" && (
        <div
          id="template-panel-library"
          role="tabpanel"
          aria-labelledby="template-tab-library"
          className="template-center-layout"
        >
          <section className="template-library" aria-label="模板库">
            <div className="template-library-tools">
              <div className="template-search-row">
                <Input.Search
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索名称或用途"
                  aria-label="搜索模板名称或用途"
                  allowClear
                />
                <Button
                  onClick={() => packageInputRef.current?.click()}
                  loading={busyAction === "import"}
                >
                  导入模板
                </Button>
                <Button
                  onClick={() => void exportTemplate()}
                  disabled={!selected}
                >
                  导出所选
                </Button>
                <input
                  ref={packageInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="application/json,.json"
                  aria-label="选择操作模板 JSON 包"
                  onChange={(event) =>
                    void importTemplate(event.target.files?.[0])
                  }
                />
              </div>
              <div
                className="template-category-tabs"
                role="tablist"
                aria-label="模板分类"
              >
                {categories.map((item) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={category === item.id}
                    tabIndex={category === item.id ? 0 : -1}
                    key={item.id}
                    className={category === item.id ? "active" : ""}
                    onClick={() => setCategory(item.id)}
                    onKeyDown={moveTabFocus}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="template-result-count" aria-live="polite">
                找到 {visible.length} 个模板
              </p>
            </div>
            {loading ? (
              <div className="template-loading">
                <Spin />
                <span>正在加载模板目录…</span>
              </div>
            ) : visible.length ? (
              <div className="template-card-grid">
                {visible.map((item) => (
                  <button
                    type="button"
                    aria-pressed={item.id === templateId}
                    className={`template-card ${item.id === templateId ? "selected" : ""}`}
                    key={item.id}
                    onClick={() => selectTemplate(item.id)}
                  >
                    <span
                      className={`template-category-badge ${item.category}`}
                    >
                      {categories.find((entry) => entry.id === item.category)
                        ?.label || item.category}
                    </span>
                    <strong>{item.name}</strong>
                    <p>{item.description}</p>
                    <small>{summaryText(item)}</small>
                    <span className="template-card-action">
                      配置模板 <span aria-hidden="true">›</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="template-empty-state">
                <strong>没有匹配的模板</strong>
                <p>调整搜索词或切换分类。当前搜索范围是模板名称和用途。</p>
                <Button
                  onClick={() => {
                    setQuery("");
                    setCategory("all");
                  }}
                >
                  清除筛选
                </Button>
              </div>
            )}
          </section>
          <aside className="template-wizard" aria-label="模板配置向导">
            {!selected ? (
              <div className="template-wizard-empty">
                <span className="empty-state-icon" aria-hidden="true">
                  ＋
                </span>
                <strong>选择一个模板开始</strong>
                <span>左侧卡片会说明用途和生成物；选择后在这里完成配置。</span>
              </div>
            ) : (
              <>
                <div className="wizard-title">
                  <div>
                    <span>配置向导</span>
                    <strong>{selected.name}</strong>
                  </div>
                  <Tag color="blue">v{selected.version}</Tag>
                </div>
                <ol className="wizard-progress" aria-label="创建步骤">
                  <li className="done" aria-current={!tableSelectionReady ? "step" : undefined}>
                    <span>1</span>选择模板
                  </li>
                  <li className={tableSelectionReady ? "done" : "current"} aria-current={!tableSelectionReady ? "step" : undefined}>
                    <span>2</span>数据范围
                  </li>
                  <li
                    className={
                      report ? "done" : tableSelectionReady ? "current" : ""
                    }
                    aria-current={!report && tableSelectionReady ? "step" : undefined}
                  >
                    <span>3</span>检查条件
                  </li>
                  <li className={planned ? "current" : ""} aria-current={planned ? "step" : undefined}>
                    <span>4</span>确认创建
                  </li>
                </ol>
                <fieldset className="wizard-section">
                  <legend>数据范围</legend>
                  {!tables.length && (
                    <Alert
                      type="warning"
                      showIcon
                      title="当前没有读取到数据表"
                      description={
                        <div className="template-empty-table-hint">
                          <span>这个项目包里应该有数据表，但当前弹窗拿到的项目快照里是空的。可以先重新读取；如果仍为空，再去“数据预览”确认项目数据是否已加载。</span>
                          <Button
                            size="small"
                            onClick={() => void reloadTables()}
                            loading={tablesRefreshing}
                          >
                            重新读取数据表
                          </Button>
                        </div>
                      }
                    />
                  )}
                  <label>
                    <span>
                      数据表 <em>必填，至少 {requiredTables} 张</em>
                    </span>
                    <Select
                      mode={multiTable ? "multiple" : undefined}
                      value={multiTable ? tableIds : tableIds[0]}
                      onChange={(value) =>
                        setTableIds(
                          Array.isArray(value) ? value : value ? [value] : [],
                        )
                      }
                      placeholder={multiTable ? "选择多张数据表" : "选择数据表"}
                      options={tables.map((item) => ({
                        value: item.id,
                        label: item.fileName || item.id,
                      }))}
                    />
                  </label>
                  <label>
                    <span>
                      主要 Sheet <em>必填</em>
                    </span>
                    <Select
                      value={sheet?.name}
                      onChange={setSheetName}
                      placeholder="选择 Sheet"
                      disabled={!primaryTable}
                      options={(primaryTable?.sheets || []).map((item) => ({
                        value: item.name,
                        label: item.name,
                      }))}
                    />
                  </label>
                  <label>
                    <span>
                      参与字段 <small>留空时使用全部字段</small>
                    </span>
                    <Select
                      mode="multiple"
                      value={fields}
                      onChange={setFields}
                      placeholder="选择字段，或保留为空"
                      disabled={!sheet}
                      options={(sheet?.headers || []).map((name) => ({
                        value: name,
                        label: name,
                      }))}
                    />
                  </label>
                  {contract?.requiresRelation && (
                    <label>
                      <span>
                        数据关系 <em>必填</em>
                      </span>
                      <Select
                        mode="multiple"
                        value={relationIds}
                        onChange={setRelationIds}
                        placeholder={
                          project.relations?.length
                            ? "选择已声明关系"
                            : "请先到“数据关系”创建"
                        }
                        status={
                          !project.relations?.length ? "warning" : undefined
                        }
                        options={(project.relations || []).map((item) => ({
                          value: item.id,
                          label: item.name,
                        }))}
                      />
                    </label>
                  )}
                </fieldset>
                {parameterEntries.length > 0 && (
                  <fieldset className="wizard-section">
                    <legend>业务配置</legend>
                    {(project.templatePresets || []).some(
                      (item) => item.templateId === selected.id,
                    ) && (
                      <label>
                        <span>参数预设</span>
                        <Select
                          allowClear
                          placeholder="选择已保存预设"
                          onChange={(id) => {
                            const preset = project.templatePresets?.find(
                              (item) => item.id === id,
                            );
                            if (preset) {
                              setParameters(preset.parameters);
                              setReport(undefined);
                              setPlanned(undefined);
                              announce(`已应用预设 ${preset.name}`);
                            }
                          }}
                          options={(project.templatePresets || [])
                            .filter((item) => item.templateId === selected.id)
                            .map((item) => ({
                              value: item.id,
                              label: item.name,
                            }))}
                        />
                      </label>
                    )}
                    {requiredParameterEntries.map(([name, schema]) => (
                      <label key={name}>
                        <span>
                          {parameterLabels[name] || name}
                          <em>必填</em>
                        </span>
                        {parameterControl(name, schema)}
                      </label>
                    ))}
                    {!!optionalParameterEntries.length && (
                      <details className="template-advanced-parameters">
                        <summary>高级参数 · {optionalParameterEntries.length} 项</summary>
                        <div>
                          {optionalParameterEntries.map(([name, schema]) => (
                            <label key={name}>
                              <span>{parameterLabels[name] || name}</span>
                              {parameterControl(name, schema)}
                            </label>
                          ))}
                        </div>
                      </details>
                    )}
                    <div className="preset-save">
                      <Input
                        value={presetName}
                        onChange={(event) => setPresetName(event.target.value)}
                        placeholder="预设名称"
                        aria-label="参数预设名称"
                      />
                      <Button
                        onClick={() => void savePreset()}
                        loading={busyAction === "preset"}
                        disabled={!presetName.trim()}
                      >
                        保存当前参数
                      </Button>
                    </div>
                  </fieldset>
                )}
                <div className="wizard-actions">
                  <Button
                    onClick={() => void analyze()}
                    loading={busyAction === "analyze"}
                    disabled={!tableSelectionReady}
                  >
                    检查可行性
                  </Button>
                  <Button
                    type="primary"
                    onClick={() => void preview()}
                    loading={busyAction === "preview"}
                    disabled={!tableSelectionReady}
                  >
                    预览生成内容
                  </Button>
                </div>
                {report && (
                  <section
                    className={`feasibility-panel ${report.status}`}
                    aria-label="可行性结果"
                    aria-live="polite"
                  >
                    <div className="feasibility-summary">
                      <div>
                        <strong>{statusLabel[report.status]}</strong>
                        <span>{report.summary}</span>
                      </div>
                      <b>
                        {report.score}
                        <small>/100</small>
                      </b>
                    </div>
                    <div className="feasibility-checks">
                      {report.checks
                        .filter((item) => item.status !== "passed")
                        .map((item) => (
                          <Alert
                            key={`${item.code}-${item.path}`}
                            type={
                              item.status === "failed" ? "error" : "warning"
                            }
                            showIcon
                            title={item.message}
                            description={
                              item.fix?.label
                                ? `建议：${item.fix.label}`
                                : item.path
                                  ? `定位：${item.path}`
                                  : undefined
                            }
                          />
                        ))}
                      {!report.checks.some(
                        (item) => item.status !== "passed",
                      ) && (
                        <Alert
                          type="success"
                          showIcon
                        title="所有检查均已通过"
                        />
                      )}
                    </div>
                    <details>
                      <summary>查看全部 {report.checks.length} 项检查</summary>
                      {report.checks.map((item) => (
                        <p key={`${item.code}-all`}>
                          <Tag
                            color={
                              item.status === "passed"
                                ? "green"
                                : item.status === "warning"
                                  ? "orange"
                                  : "red"
                            }
                          >
                            {item.status === "passed"
                              ? "通过"
                              : item.status === "warning"
                                ? "提醒"
                                : "阻止"}
                          </Tag>
                          {item.message}
                        </p>
                      ))}
                    </details>
                  </section>
                )}
                {planned && (
                  <section
                    className="generation-preview"
                    aria-label="生成内容预览"
                  >
                    <div>
                      <strong>确认生成内容</strong>
                      <p>
                        创建前不会修改项目；提交时将基于最新 revision 原子写入。
                      </p>
                    </div>
                    <div className="generation-counts">
                      <span>
                        <b>{planned.plan.summary.forms}</b> 表单
                      </span>
                      <span>
                        <b>{planned.plan.summary.workflows}</b> 流程
                      </span>
                      <span>
                        <b>{planned.plan.summary.outputs}</b> 输出
                      </span>
                      <span>
                        <b>{planned.plan.summary.tests}</b> 测试
                      </span>
                    </div>
                    {planned.plan.conflicts?.length ? (
                      <Alert
                        type="error"
                        showIcon
                      title={`发现 ${planned.plan.conflicts.length} 个资源冲突`}
                        description={planned.plan.conflicts
                          .map((item: any) => item.message)
                          .join("；")}
                      />
                    ) : (
                      <Button
                        type="primary"
                        size="large"
                        block
                        onClick={() => void apply()}
                        loading={busyAction === "apply"}
                      >
                        创建并运行校验
                      </Button>
                    )}
                  </section>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
