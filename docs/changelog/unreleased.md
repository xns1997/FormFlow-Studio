# Unreleased

## 文档

- 完成仓库**文档全量审查与勘误**：
  - 按 `ui/nodes/*/schema.json` 重新核验节点数量：219 个节点包（140 个业务/场景节点 + 79 个 XLSX 方法节点）、11 个版本化高阶宏、5 个流程配方，并重写概览中的节点分类表；
  - 数据导入格式补充 TSV、XML、Parquet 与外部数据源直连（MySQL / PostgreSQL / API）；
  - 修正 FormFlow v2 项目包结构说明：`global-behaviors.json`、各作用域 `<id>.behaviors.json`、`testing/testing.json`、`release.json`，移除不存在的 `behaviors/` 目录描述；
  - 修正 `CLAUDE.md` / `CODEX.md` 中已移除的旧接口（`/mcp`、`/api/ai/tools`、`project.apply_patch`、`release.apply`），统一为七领域角色化 MCP 与 `release.update/preview`；
  - 对齐 `/api/health` 与 `/api/ready` 的实际返回结构与 readiness 语义；
  - 补全 `docs/changelog/v1.md` 缺失的 1.3.0–1.8.0 版本记录与 1.9.0 发布记录，操作模板目录补充「主从详情」「多表批量更新」；
  - 为历史设计/分析文档（低操作开发计划、编辑器模式切换、GRILL 重写分析）补充当前落地状态说明，避免旧快照被当作现状。
