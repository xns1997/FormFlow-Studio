import React, { useEffect, useState } from "react";
import { Alert, Button, Tag } from "antd";
import type { ProjectStructure, TemplateInstance } from "../../project/types";
import {
  operationTemplateClient,
  TemplateConfirmationRequired,
  TemplateToolError,
  type TemplateInstanceDrift,
  type TemplateStatistics,
} from "../../services/templates/operationTemplateClient";
import { useAppInteraction } from "../../components/AppInteractionProvider";
import type { TemplateDiagnostic } from "./TemplateDiagnosticPanel";

export default function TemplateInstancesPanel({
  project,
  onChanged,
  onDiagnostic,
}: {
  project: ProjectStructure;
  onChanged(): Promise<void>;
  onDiagnostic(value?: TemplateDiagnostic): void;
}) {
  const { confirm, announce } = useAppInteraction();
  const [busyId, setBusyId] = useState<string>();
  const [drifts, setDrifts] = useState<Record<string, TemplateInstanceDrift>>(
    {},
  );
  const [statistics, setStatistics] = useState<TemplateStatistics>();
  useEffect(() => {
    operationTemplateClient
      .statistics(project.config.id)
      .then(setStatistics)
      .catch((error) =>
        onDiagnostic({
          title: "模板统计加载失败",
          error: error as Error,
          action: "load-template-statistics",
        }),
      );
  }, [
    project.config.id,
    project.templateInstances?.length,
    project.modelRuns?.length,
  ]);
  const inspect = async (instance: TemplateInstance) => {
    setBusyId(instance.id);
    onDiagnostic(undefined);
    try {
      const drift = await operationTemplateClient.inspectDrift(
        project.config.id,
        instance.id,
      );
      setDrifts((current) => ({ ...current, [instance.id]: drift }));
      announce(
        drift.drifted
          ? `${instance.templateId} 存在漂移`
          : `${instance.templateId} 未发现漂移`,
      );
    } catch (error) {
      onDiagnostic({
        title: "漂移检查失败",
        error: error as Error,
        action: "inspect-template-drift",
      });
    } finally {
      setBusyId(undefined);
    }
  };
  const detach = async (instance: TemplateInstance) => {
    if (
      !(await confirm({
        title: "脱离模板管理",
        message: `保留“${instance.templateId}”生成的资源，但停止漂移和升级管理？`,
        confirmLabel: "脱离管理",
      }))
    )
      return;
    setBusyId(instance.id);
    try {
      const revision = await operationTemplateClient.getRevision(
        project.config.id,
      );
      await operationTemplateClient.detachInstance(
        project.config.id,
        instance.id,
        revision,
        `template-detach-${crypto.randomUUID()}`,
      );
      await onChanged();
      announce("已脱离模板管理");
    } catch (error) {
      onDiagnostic({
        title: "脱离模板失败",
        error: error as Error,
        action: "detach-template",
      });
    } finally {
      setBusyId(undefined);
    }
  };
  const regenerate = async (instance: TemplateInstance) => {
    setBusyId(instance.id);
    onDiagnostic(undefined);
    try {
      const revision = await operationTemplateClient.getRevision(
        project.config.id,
      );
      const key = `template-regenerate-${crypto.randomUUID()}`;
      try {
        await operationTemplateClient.regenerateInstance(
          project.config.id,
          instance.id,
          revision,
          key,
        );
      } catch (error) {
        if (
          !(error instanceof TemplateToolError) ||
          error.code !== "TEMPLATE_INSTANCE_DRIFTED"
        )
          throw error;
        const approved = await confirm({
          title: "生成物包含手工修改",
          message: "重新生成会覆盖列出的手工修改。要继续吗？",
          detail: JSON.stringify(error.details),
          confirmLabel: "覆盖并重新生成",
          destructive: true,
        });
        if (!approved) return;
        try {
          await operationTemplateClient.regenerateInstance(
            project.config.id,
            instance.id,
            revision,
            key,
            true,
          );
        } catch (confirmation) {
          if (confirmation instanceof TemplateConfirmationRequired)
            await operationTemplateClient.regenerateInstance(
              project.config.id,
              instance.id,
              revision,
              key,
              true,
              confirmation.token,
            );
          else throw confirmation;
        }
      }
      await onChanged();
      setDrifts((current) => {
        const next = { ...current };
        delete next[instance.id];
        return next;
      });
      announce("模板已安全重新生成");
    } catch (error) {
      onDiagnostic({
        title: "重新生成失败",
        error: error as Error,
        action: "regenerate-template",
      });
    } finally {
      setBusyId(undefined);
    }
  };
  const upgrade = async (instance: TemplateInstance) => {
    setBusyId(instance.id);
    onDiagnostic(undefined);
    try {
      const revision = await operationTemplateClient.getRevision(
        project.config.id,
      );
      const key = `template-upgrade-${crypto.randomUUID()}`;
      let result;
      try {
        result = await operationTemplateClient.upgradeInstance(
          project.config.id,
          instance.id,
          revision,
          key,
        );
      } catch (error) {
        if (
          !(error instanceof TemplateToolError) ||
          error.code !== "TEMPLATE_INSTANCE_DRIFTED"
        )
          throw error;
        const approved = await confirm({
          title: "升级会覆盖手工修改",
          message: "先查看漂移差异；只有明确覆盖后才能升级此实例。",
          detail: JSON.stringify(error.details),
          confirmLabel: "覆盖并升级",
          destructive: true,
        });
        if (!approved) return;
        try {
          result = await operationTemplateClient.upgradeInstance(
            project.config.id,
            instance.id,
            revision,
            key,
            true,
          );
        } catch (confirmation) {
          if (confirmation instanceof TemplateConfirmationRequired)
            result = await operationTemplateClient.upgradeInstance(
              project.config.id,
              instance.id,
              revision,
              key,
              true,
              confirmation.token,
            );
          else throw confirmation;
        }
      }
      if (result.upgraded) {
        await onChanged();
        announce(`模板已从 ${result.fromVersion} 升级到 ${result.toVersion}`);
      } else announce(`当前已是最新版本 ${result.toVersion}`);
    } catch (error) {
      onDiagnostic({
        title: "模板升级失败",
        error: error as Error,
        action: "upgrade-template",
      });
    } finally {
      setBusyId(undefined);
    }
  };
  const remove = async (instance: TemplateInstance) => {
    if (
      !(await confirm({
        title: "删除模板生成物",
        message: `删除“${instance.templateId}”仍归属于模板的表单、流程、输出和测试？`,
        detail: "手工创建或已脱离归属的资源不会被删除。此操作不可撤销。",
        confirmLabel: "删除生成物",
        destructive: true,
      }))
    )
      return;
    setBusyId(instance.id);
    onDiagnostic(undefined);
    try {
      const revision = await operationTemplateClient.getRevision(
        project.config.id,
      );
      const key = `template-delete-${crypto.randomUUID()}`;
      try {
        await operationTemplateClient.deleteInstance(
          project.config.id,
          instance.id,
          revision,
          key,
        );
      } catch (error) {
        if (error instanceof TemplateConfirmationRequired)
          await operationTemplateClient.deleteInstance(
            project.config.id,
            instance.id,
            revision,
            key,
            error.token,
          );
        else throw error;
      }
      await onChanged();
      announce("模板生成物已删除");
    } catch (error) {
      onDiagnostic({
        title: "删除模板生成物失败",
        error: error as Error,
        action: "delete-template-instance",
      });
    } finally {
      setBusyId(undefined);
    }
  };
  const instances = project.templateInstances || [];
  return (
    <section className="template-instances" aria-labelledby="instances-heading">
      <div className="section-heading">
        <div>
          <h2 id="instances-heading">已安装模板实例</h2>
          <p>查看生成物、检查手工修改，并安全重新生成、升级、脱离或删除。</p>
        </div>
        <Tag>{instances.length} 个实例</Tag>
      </div>
      {statistics && (
        <section className="template-statistics" aria-label="模板使用统计">
          <div>
            <span>受管实例</span>
            <strong>{statistics.managed}</strong>
          </div>
          <div>
            <span>参数预设</span>
            <strong>{statistics.presets}</strong>
          </div>
          <div>
            <span>成功运行</span>
            <strong>{statistics.successfulRuns}</strong>
          </div>
          <div>
            <span>失败运行</span>
            <strong>{statistics.failedRuns}</strong>
          </div>
          {statistics.failureReasons.length > 0 && (
            <details>
              <summary>
                查看失败原因（
                {statistics.failureReasons.reduce(
                  (total, item) => total + item.count,
                  0,
                )}
                ）
              </summary>
              {statistics.failureReasons.slice(0, 8).map((item) => (
                <p key={`${item.code}-${item.message}`}>
                  <Tag color="red">{item.code}</Tag>
                  {item.message} · {item.count} 次
                </p>
              ))}
            </details>
          )}
        </section>
      )}
      {instances.length ? (
        <div className="instance-grid">
          {instances.map((instance) => {
            const drift = drifts[instance.id];
            const resources = instance.resources;
            return (
              <article className="instance-card" key={instance.id}>
                <div className="instance-card-heading">
                  <div>
                    <strong>{instance.templateId}</strong>
                    <span>版本 {instance.templateVersion}</span>
                  </div>
                  <Tag
                    color={instance.status === "managed" ? "blue" : "default"}
                  >
                    {instance.status === "managed" ? "受管理" : "已脱离"}
                  </Tag>
                </div>
                <p>
                  {resources.formIds.length} 表单 ·{" "}
                  {resources.workflowIds.length} 流程 ·{" "}
                  {resources.outputIds.length} 输出 · {resources.testIds.length}{" "}
                  测试
                </p>
                <small>
                  更新于 {new Date(instance.updatedAt).toLocaleString()}
                </small>
                {drift && (
                  <Alert
                    showIcon
                    type={drift.drifted ? "warning" : "success"}
                    title={
                      drift.drifted ? "检测到模板漂移" : "生成物与模板一致"
                    }
                    description={
                      drift.drifted
                        ? drift.checks
                            .filter((item) => item.status !== "unchanged")
                            .map((item) => `${item.id}：${item.message}`)
                            .join("；")
                        : undefined
                    }
                  />
                )}
                <div className="instance-actions">
                  <Button
                    onClick={() => void inspect(instance)}
                    loading={busyId === instance.id}
                  >
                    检查漂移
                  </Button>
                  {instance.status === "managed" && (
                    <Button
                      onClick={() => void regenerate(instance)}
                      disabled={Boolean(busyId)}
                    >
                      重新生成
                    </Button>
                  )}
                  {instance.status === "managed" && (
                    <Button
                      onClick={() => void upgrade(instance)}
                      disabled={Boolean(busyId)}
                    >
                      检查升级
                    </Button>
                  )}
                  {instance.status === "managed" && (
                    <Button
                      onClick={() => void detach(instance)}
                      disabled={Boolean(busyId)}
                    >
                      脱离管理
                    </Button>
                  )}
                  <Button
                    danger
                    onClick={() => void remove(instance)}
                    disabled={Boolean(busyId)}
                  >
                    删除生成物
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="template-empty-state">
          <strong>还没有安装模板</strong>
          <p>从模板库创建后，实例及其生成物会显示在这里。</p>
        </div>
      )}
    </section>
  );
}
