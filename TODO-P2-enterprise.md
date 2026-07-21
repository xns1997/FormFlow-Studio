# FormFlow Studio 阶段三：企业级（P2）

**目标**：面向企业级场景，补齐流式处理、高级治理、多租户、生态社区等能力。
**前置条件**：阶段一（P0）+ 阶段二（P1）完成
**预估周期**：6-8 周
**涉及模块**：server/、ui/nodes/、ui/src/pages/、ui/src/services/、python-service/

---

## 1. 流式处理

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 57 | 新增 WebSocket 数据源节点（实时数据接入） | `ui/nodes/generic-websocket-source/`, `server/src/services/websocket-relay.ts` | 4d |
| 58 | 新增 SSE 实时推送节点 | `ui/nodes/generic-sse-source/` | 3d |
| 59 | 新增流式聚合节点（滑动窗口/会话窗口/Tumbling 窗口） | `ui/nodes/generic-stream-aggregate/` | 5d |

---

## 2. 高级数据治理

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 60 | 实现敏感数据自动识别（PII/PHI 检测引擎） | `python-service/src/sensitivity.py`, `ui/nodes/generic-sensitive-detect/` | 4d |
| 61 | 实现数据脱敏规则引擎（动态脱敏 + 静态脱敏） | `python-service/src/masking.py`, `ui/nodes/generic-data-masking/` | 4d |
| 62 | 实现主数据管理（MDM 实体定义 + 匹配/合并/冲突解决） | `server/src/routes/mdm.ts`, `ui/src/pages/editor/MDMPage.tsx`, `python-service/src/mdm.py` | 5d |

---

## 3. 企业级部署 ⏸️ 暂缓执行

| # | TODO | 状态 | 涉及文件 | 预估工时 |
|---|------|------|---------|---------|
| 63 | 实现多租户架构（租户隔离 + 资源配额 + 数据隔离） | ✅ 已实现 | `server/src/middleware/tenant.ts`, `server/src/services/tenant-store.ts` | 5d |
| 64 | 实现水平扩展（无状态服务 + PostgreSQL 会话存储） | ⏸️ 暂缓 | `server/src/config/session.ts`, `docker-compose.yml` 改造 | 3d |
| 65 | 集成监控（Prometheus metrics + Grafana dashboard） | ⏸️ 暂缓 | `server/src/middleware/metrics.ts`, `monitoring/` 目录 | 4d |
| 66 | 集成日志聚合（结构化日志 + Loki/ELK 接入） | ⏸️ 暂缓 | `server/src/services/logger.ts`, `logging/` 配置 | 3d |

---

## 4. 生态与社区

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 67 | 创建模板市场（发布/订阅/评分/搜索 + 前端页面） | `server/src/routes/marketplace.ts`, `ui/src/pages/marketplace/` | 5d |
| 68 | 编写贡献指南 + 开发者文档 | `CONTRIBUTING.md`, `docs/developer-guide.md` | 2d |
| 69 | 创建示例节点包仓库（5+ 行业模板） | `examples/` 目录, `scripts/generate-examples.ts` | 3d |
| 70 | TypeScript 类型定义导出（公开 API 类型） | `ui/src/types/public.d.ts`, `package.json` exports 字段 | 1d |

---

## 5. 协作增强 ⏸️ 暂缓执行

| # | TODO | 状态 | 涉及文件 | 预估工时 |
|---|------|------|---------|---------|
| 71 | 实现实时协作编辑（CRDT/OT 算法 + WebSocket 同步） | ⏸️ 暂缓 | `server/src/services/collaboration.ts`, `ui/src/hooks/useCollaboration.ts` | 8d |
| 72 | 实现单元格/节点级评论和批注 | ✅ 已实现 | `server/src/routes/comments.ts`, `ui/src/components/CommentThread.tsx` | 4d |
| 73 | 实现审批工作流设计器（条件路由 + 并行审批 + 超时处理） | ✅ 已实现 | `ui/src/pages/editor/ApprovalWorkflowPage.tsx`, `server/src/services/approval.ts` | 5d |
| 74 | 移动端自适应 UI（响应式布局 + 触摸交互优化） | ✅ 已实现 | `ui/src/style/` 响应式改造, 关键页面适配 | 5d |

---

## 阶段三总计

| 类别 | 项数 | 预估总工时 |
|------|------|-----------|
| 流式处理 | 3 | 12d |
| 高级数据治理 | 3 | 13d |
| 企业级部署 | 4 | 15d |
| 生态与社区 | 4 | 11d |
| 协作增强 | 4 | 22d |
| **合计** | **18** | **~73d（约 15 周，单人）** |

> 注：阶段三原计划 14 项，其中 TODO-62 主数据管理因复杂度较高拆分为独立项，实际为 18 项。
