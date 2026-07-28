import React, { useEffect, useState } from "react";
import { Alert, Button, Input, Select, Tag } from "antd";
import type { DataRelation, ProjectStructure } from "../../project/types";
import {
  operationTemplateClient,
  TemplateConfirmationRequired,
  type RelationDraft,
  type RelationSuggestion,
} from "../../services/templates/operationTemplateClient";
import { useAppInteraction } from "../../components/AppInteractionProvider";
import type { TemplateDiagnostic } from "./TemplateDiagnosticPanel";

const safeId = (value: string) => {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return (
    normalized ||
    `relation_${crypto.randomUUID().split("-").join("").slice(0, 12)}`
  );
};

function emptyRelation(project: ProjectStructure): RelationDraft {
  const left = project.srcTable[0];
  const right = project.srcTable[1] || project.srcTable[0];
  return {
    id: "",
    name: "",
    left: {
      tableId: left?.id || "",
      sheetName: left?.sheets[0]?.name || "",
      fields: [],
    },
    right: {
      tableId: right?.id || "",
      sheetName: right?.sheets[0]?.name || "",
      fields: [],
    },
    cardinality: "many-to-one",
    defaultJoinType: "left",
    integrity: "checked",
    onDelete: "restrict",
  };
}

export default function DataRelationsPanel({
  project,
  onChanged,
  onDiagnostic,
}: {
  project: ProjectStructure;
  onChanged(): Promise<void>;
  onDiagnostic(value?: TemplateDiagnostic): void;
}) {
  const { confirm, announce } = useAppInteraction();
  const [draft, setDraft] = useState<RelationDraft>(() =>
    emptyRelation(project),
  );
  const [validation, setValidation] = useState<{
    valid: boolean;
    checks: Array<{ code: string; status: string; message: string }>;
  }>();
  const [suggestions, setSuggestions] = useState<RelationSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const table = (id: string) => project.srcTable.find((item) => item.id === id);
  const sheet = (side: "left" | "right") =>
    table(draft[side].tableId)?.sheets.find(
      (item) => item.name === draft[side].sheetName,
    ) || table(draft[side].tableId)?.sheets[0];
  useEffect(() => {
    let active = true;
    setSuggestionsLoading(true);
    operationTemplateClient
      .suggestRelations(project.config.id)
      .then((result) => {
        if (active) setSuggestions(result);
      })
      .catch((error) => {
        if (active)
          onDiagnostic({
            title: "关系建议加载失败",
            error: error as Error,
            action: "suggest-relations",
          });
      })
      .finally(() => {
        if (active) setSuggestionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project.config.id, project.relations?.length, project.srcTable.length]);

  const selectExisting = (relation: DataRelation) => {
    setDraft(relation);
    setValidation(undefined);
  };
  const useSuggestion = (suggestion: RelationSuggestion) => {
    setDraft({
      id: "",
      name: `${suggestion.left.tableId} 与 ${suggestion.right.tableId}`,
      left: suggestion.left,
      right: suggestion.right,
      cardinality: suggestion.cardinality,
      defaultJoinType: "left",
      integrity: "checked",
      onDelete: "restrict",
    });
    setValidation(undefined);
    announce(
      `已采用关系建议，置信度 ${Math.round(suggestion.confidence * 100)}%`,
    );
  };
  const changeSide = (
    side: "left" | "right",
    patch: Partial<RelationDraft["left"]>,
  ) =>
    setDraft((current) => ({
      ...current,
      [side]: { ...current[side], ...patch },
    }));
  const selectTable = (side: "left" | "right", tableId: string) => {
    const firstSheet = table(tableId)?.sheets[0];
    changeSide(side, {
      tableId,
      sheetName: firstSheet?.name || "",
      fields: [],
    });
    setValidation(undefined);
  };

  const validate = async () => {
    setBusy(true);
    onDiagnostic(undefined);
    try {
      const result = await operationTemplateClient.validateRelation(
        project.config.id,
        draft,
      );
      setValidation(result);
      announce(result.valid ? "关系校验通过" : "关系校验未通过");
      return result.valid;
    } catch (error) {
      onDiagnostic({
        title: "关系校验失败",
        error: error as Error,
        action: "validate-relation",
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (
      !draft.name.trim() ||
      !draft.left.fields.length ||
      !draft.right.fields.length
    ) {
      setValidation({
        valid: false,
        checks: [
          {
            code: "REQUIRED",
            status: "failed",
            message: "请填写关系名称并选择两侧关联字段。",
          },
        ],
      });
      return;
    }
    setBusy(true);
    onDiagnostic(undefined);
    try {
      const relation = { ...draft, id: safeId(draft.id || draft.name) };
      const report = await operationTemplateClient.validateRelation(
        project.config.id,
        relation,
      );
      setValidation(report);
      if (!report.valid) return;
      const revision = await operationTemplateClient.getRevision(
        project.config.id,
      );
      await operationTemplateClient.saveRelation(
        project.config.id,
        relation,
        revision,
        `relation-save-${crypto.randomUUID()}`,
      );
      await onChanged();
      setDraft(emptyRelation(project));
      setValidation(undefined);
      announce(`已保存关系 ${relation.name}`);
    } catch (error) {
      onDiagnostic({
        title: "保存关系失败",
        error: error as Error,
        action: "save-relation",
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (relation: DataRelation) => {
    if (
      !(await confirm({
        title: "删除数据关系",
        message: `删除“${relation.name}”？`,
        detail: "被模板实例引用时，系统会阻止删除并指出引用位置。",
        confirmLabel: "删除关系",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    onDiagnostic(undefined);
    try {
      const revision = await operationTemplateClient.getRevision(
        project.config.id,
      );
      const key = `relation-delete-${crypto.randomUUID()}`;
      try {
        await operationTemplateClient.deleteRelation(
          project.config.id,
          relation.id,
          revision,
          key,
          false,
        );
      } catch (error) {
        if (error instanceof TemplateConfirmationRequired)
          await operationTemplateClient.deleteRelation(
            project.config.id,
            relation.id,
            revision,
            key,
            false,
            error.token,
          );
        else throw error;
      }
      await onChanged();
      setDraft(emptyRelation(project));
      announce(`已删除关系 ${relation.name}`);
    } catch (error) {
      onDiagnostic({
        title: "删除关系失败",
        error: error as Error,
        action: "delete-relation",
      });
    } finally {
      setBusy(false);
    }
  };

  const sideEditor = (side: "left" | "right", title: string) => (
    <fieldset className="relation-side">
      <legend>{title}</legend>
      <label>
        <span>数据表</span>
        <Select
          value={draft[side].tableId}
          onChange={(value) => selectTable(side, value)}
          options={project.srcTable.map((item) => ({
            value: item.id,
            label: item.fileName || item.id,
          }))}
        />
      </label>
      <label>
        <span>Sheet</span>
        <Select
          value={draft[side].sheetName}
          onChange={(value) =>
            changeSide(side, { sheetName: value, fields: [] })
          }
          options={(table(draft[side].tableId)?.sheets || []).map((item) => ({
            value: item.name,
            label: item.name,
          }))}
        />
      </label>
      <label>
        <span>关联字段</span>
        <Select
          mode="multiple"
          value={draft[side].fields}
          onChange={(value) => changeSide(side, { fields: value })}
          placeholder="按相同顺序选择"
          options={(sheet(side)?.headers || []).map((name) => ({
            value: name,
            label: name,
          }))}
        />
      </label>
    </fieldset>
  );

  return (
    <div className="template-management-layout">
      <section
        className="template-management-list"
        aria-labelledby="relations-heading"
      >
        <div className="section-heading">
          <div>
            <h2 id="relations-heading">数据关系</h2>
            <p>统一管理 Join 与主从写入所依赖的关系。</p>
          </div>
          <Button
            onClick={() => {
              setDraft(emptyRelation(project));
              setValidation(undefined);
            }}
          >
            新建关系
          </Button>
        </div>
        {project.relations?.length ? (
          <div className="management-card-list">
            {project.relations.map((relation) => (
              <article className="management-card" key={relation.id}>
                <button
                  type="button"
                  className="management-card-main"
                  onClick={() => selectExisting(relation)}
                >
                  <strong>{relation.name}</strong>
                  <span>
                    {relation.left.tableId}.{relation.left.fields.join("+")} →{" "}
                    {relation.right.tableId}.{relation.right.fields.join("+")}
                  </span>
                  <small>
                    {relation.cardinality} · {relation.defaultJoinType}
                  </small>
                </button>
                <Button
                  danger
                  type="text"
                  onClick={() => void remove(relation)}
                  disabled={busy}
                >
                  删除
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="template-empty-state">
            <strong>还没有数据关系</strong>
            <p>创建关系后，跨表查询、主从录入和分表更新模板才可使用。</p>
          </div>
        )}
        <details className="relation-suggestions">
          <summary>
            {suggestionsLoading
              ? "正在分析关系线索…"
              : `发现 ${suggestions.length} 条关系建议`}
          </summary>
          {!suggestionsLoading && !suggestions.length && (
            <p>没有找到兼具名称、类型或样本值证据的关系。</p>
          )}
          {suggestions.map((item) => (
            <article className="relation-suggestion" key={item.id}>
              <div>
                <strong>
                  {item.left.tableId}.{item.left.fields[0]} ↔{" "}
                  {item.right.tableId}.{item.right.fields[0]}
                </strong>
                <span>
                  置信度 {Math.round(item.confidence * 100)}% ·{" "}
                  {item.reasons.join("；")}
                </span>
              </div>
              <Button size="small" onClick={() => useSuggestion(item)}>
                采用建议
              </Button>
            </article>
          ))}
        </details>
      </section>
      <section className="template-management-editor" aria-label="关系编辑器">
        <h2>{draft.id ? "编辑关系" : "新建关系"}</h2>
        <label>
          <span>
            关系名称 <em>必填</em>
          </span>
          <Input
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="例如：教师与科目"
          />
        </label>
        <div className="relation-sides">
          {sideEditor("left", "来源表")}
          {sideEditor("right", "关联表")}
        </div>
        <div className="relation-options">
          <label>
            <span>基数</span>
            <Select
              value={draft.cardinality}
              onChange={(value) =>
                setDraft((current) => ({ ...current, cardinality: value }))
              }
              options={[
                "one-to-one",
                "one-to-many",
                "many-to-one",
                "many-to-many",
              ].map((value) => ({ value, label: value }))}
            />
          </label>
          <label>
            <span>默认 Join</span>
            <Select
              value={draft.defaultJoinType}
              onChange={(value) =>
                setDraft((current) => ({ ...current, defaultJoinType: value }))
              }
              options={[
                { value: "left", label: "左连接" },
                { value: "inner", label: "内连接" },
              ]}
            />
          </label>
          <label>
            <span>删除策略</span>
            <Select
              value={draft.onDelete}
              onChange={(value) =>
                setDraft((current) => ({ ...current, onDelete: value }))
              }
              options={[
                { value: "restrict", label: "阻止删除" },
                { value: "set-null", label: "置空" },
                { value: "cascade", label: "级联" },
              ]}
            />
          </label>
        </div>
        {validation && (
          <div className="relation-validation" role="status">
            {validation.checks.map((check) => (
              <Alert
                key={check.code}
                showIcon
                type={
                  check.status === "failed"
                    ? "error"
                    : check.status === "warning"
                      ? "warning"
                      : "success"
                }
                    title={check.message}
              />
            ))}
          </div>
        )}
        <div className="management-actions">
          <Button onClick={() => void validate()} loading={busy}>
            检查关系
          </Button>
          <Button
            type="primary"
            onClick={() => void save()}
            loading={busy}
            disabled={!draft.name.trim()}
          >
            保存关系
          </Button>
        </div>
      </section>
    </div>
  );
}
