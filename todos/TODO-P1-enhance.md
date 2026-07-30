# FormFlow Studio 阶段二：能力增强（P1）

**目标**：补齐数据治理、AI 集成、增量处理、高级可视化等能力，提升框架竞争力。
**前置条件**：阶段一（P0）完成
**预估周期**：4-6 周
**涉及模块**：server/、ui/nodes/、ui/src/pages/、ui/src/services/、python-service/

---

## 1. 数据质量与治理

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 29 | 新增 `data-quality` 节点，支持规则定义（非空/范围/格式/唯一性检查） | `ui/nodes/generic-data-quality/` | 3d |
| 30 | 新增数据质量报告（质量分数 + 问题分布 + 趋势图） | `ui/src/pages/editor/DataQualityPage.tsx`, `python-service/src/quality.py` | 4d |
| 31 | 新增数据血缘可视化（字段级追溯 + 影响分析 DAG） | `ui/src/components/DataLineage.tsx`, `ui/src/services/data/lineage.ts` | 5d |
| 32 | 新增数据字典/元数据管理（字段描述 + 类型标注 + 标签） | `ui/src/pages/editor/MetadataPage.tsx`, `server/src/routes/metadata.ts` | 3d |

---

## 2. AI/LLM 集成

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 33 | 新增 `ai-query` 节点（自然语言转 SQL/分析指令） | `ui/nodes/generic-ai-query/`, `python-service/src/llm_query.py` | 4d |
| 34 | 新增 `ai-insight` 节点（自动洞察生成 + 异常解释） | `ui/nodes/generic-ai-insight/`, `python-service/src/auto_insight.py` | 4d |
| 35 | 集成 LLM API（支持 OpenAI/本地模型），新增 AI 助手面板 | `server/src/routes/ai.ts`, `ui/src/components/AiAssistant.tsx` | 4d |
| 36 | 新增 `auto-feature` 节点（自动特征工程 + 交叉特征） | `ui/nodes/ml-auto-feature/`, `python-service/src/auto_feature.py` | 3d |

---

## 3. 增量处理与错误恢复

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 37 | 实现增量同步节点（基于时间戳/版本号的变更检测） | `ui/nodes/generic-incremental-sync/` | 3d |
| 38 | 实现工作流检查点（断点续跑 + 状态持久化到磁盘） | `ui/src/services/engine/flowEngine.ts`, 新增 `checkpoint.ts` | 4d |
| 39 | 实现错误重试机制（可配置重试次数/间隔/条件） | `ui/src/services/engine/flowEngine.ts` 改造 | 2d |
| 40 | 实现数据回滚机制（事务性写入 + 失败回滚） | `server/src/services/transaction-manager.ts` | 3d |

---

## 4. 高级可视化

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 41 | 新增 OLAP 交叉表节点（多维分析 + 钻取 + 切片/切块） | `ui/nodes/generic-olap-crosstab/` | 4d |
| 42 | 新增报表导出为 PDF（服务端渲染 + PDF 生成） | `server/src/routes/export.ts`, `python-service/src/pdf_export.py` | 3d |
| 43 | 新增图表导出为图片（SVG/PNG） | `ui/src/services/display/chartExport.ts` | 2d |

---

## 5. 通知系统

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 44 | 实现通知服务（邮件/Webhook/站内信） | `server/src/services/notification.ts`, `server/src/routes/notifications.ts` | 3d |
| 45 | 新增通知触发器节点（任务完成/失败时发送通知） | `ui/nodes/behavior-notify/` | 2d |
| 46 | 新增通知中心 UI（通知列表 + 已读/未读 + 设置） | `ui/src/components/NotificationCenter.tsx` | 2d |

---

## 6. 插件系统与 CLI

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 47 | 设计插件 API 规范（节点注册/生命周期/配置/持久化） | `docs/plugin-api-spec.md` | 2d |
| 48 | 实现插件加载器（动态发现 + 热加载） | `ui/src/services/config/pluginLoader.ts`, `ui/nodes/registry.ts` 改造 | 4d |
| 49 | 新增 CLI 工具（`formflow init/create/run/deploy`） | 新增 `cli/` 目录, `bin/formflow` | 4d |
| 50 | OpenAPI 规范文档（交互式 API 文档） | `server/src/swagger.ts`, `server/public/swagger.json` | 2d |

---

## 7. 审计与合规

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 51 | 实现操作审计日志（谁/什么时间/做了什么） | `server/src/services/audit-logger.ts`（阶段一基础之上增强） | 2d |
| 52 | 实现数据访问审计（谁访问了哪些数据） | `server/src/middleware/data-audit.ts` | 2d |
| 53 | CORS 策略白名单化（可配置） | `server/src/config/cors.ts`, `.env` 配置 | 1d |

---

## 8. CI/CD 与版本管理

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 54 | 编写 GitHub Actions 工作流（测试 + 构建 + 部署） | `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` | 3d |
| 55 | 实现项目备份/恢复功能（一键导出/导入） | `server/src/routes/backup.ts` | 2d |
| 56 | 版本发布自动化（semantic-release + Changelog） | `package.json`, `.releaserc`, `CHANGELOG.md` | 1d |

---

## 阶段二总计

| 类别 | 项数 | 预估总工时 |
|------|------|-----------|
| 数据质量与治理 | 4 | 15d |
| AI/LLM 集成 | 4 | 15d |
| 增量处理与错误恢复 | 4 | 12d |
| 高级可视化 | 3 | 9d |
| 通知系统 | 3 | 7d |
| 插件系统与 CLI | 4 | 12d |
| 审计与合规 | 3 | 5d |
| CI/CD 与版本管理 | 3 | 6d |
| **合计** | **28** | **~81d（约 16 周，单人）** |

---

## 完成状态（2026-07-11）

| # | 状态 | 实现证据 |
|---|---|---|
| 29 | ✅ | `generic-data-quality` 节点：非空、范围、正则、唯一性规则 |
| 30 | ✅ | `DataQualityPage.tsx`、`python-service/src/quality.py` |
| 31 | ✅ | `DataLineage.tsx`、`lineage.ts` 字段血缘与下游影响分析 |
| 32 | ✅ | `MetadataPage.tsx`、`server/src/routes/metadata.ts` |
| 33 | ✅ | `generic-ai-query`、`python-service/src/llm_query.py` |
| 34 | ✅ | `generic-ai-insight`、`python-service/src/auto_insight.py` |
| 35 | ✅ | OpenAI/Ollama 兼容 API、`AiAssistant.tsx` |
| 36 | ✅ | `ml-auto-feature`、`python-service/src/auto_feature.py` |
| 37 | ✅ | `generic-incremental-sync` 时间戳/版本游标 |
| 38 | ✅ | `checkpoint.ts` 与流程引擎断点续跑 |
| 39 | ✅ | 节点级次数、间隔、错误条件重试 |
| 40 | ✅ | `transaction-manager.ts` 提交与失败恢复 |
| 41 | ✅ | `generic-olap-crosstab` 多维聚合、切片与钻取明细 |
| 42 | ✅ | PDF API 与 ReportLab 服务端生成，中文渲染已验收 |
| 43 | ✅ | `chartExport.ts` SVG/PNG 导出 |
| 44 | ✅ | 邮件、Webhook、站内信通知服务与 API |
| 45 | ✅ | `behavior-notify` 完成/失败触发节点 |
| 46 | ✅ | `NotificationCenter.tsx` 列表、已读状态与设置 |
| 47 | ✅ | `docs/plugin-api-spec.md` |
| 48 | ✅ | 插件发现、注册、远程执行器、存储与开发态热刷新 |
| 49 | ✅ | `formflow init/create/run/deploy` CLI |
| 50 | ✅ | OpenAPI 3.1 规范与 Swagger UI |
| 51 | ✅ | 结构化变更审计、请求关联、IP 摘要 |
| 52 | ✅ | `data-audit.ts` 数据访问审计 |
| 53 | ✅ | 环境变量驱动的 CORS 白名单 |
| 54 | ✅ | CI、容器部署和发布 GitHub Actions |
| 55 | ✅ | 全量 ZIP 备份与路径安全恢复 API |
| 56 | ✅ | semantic-release、Changelog 与 GitHub Release 自动化 |

## 运行模式

- `npm run dev:all` / `pnpm dev:all`：本地模式，不要求登录。
- `npm run dev:cloud` / `pnpm dev:cloud`：协作模式，前端登录门禁与服务端 JWT 强制鉴权同时启用。
