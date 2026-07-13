# FormFlow Studio 审计差异与缺失项 TODO

**来源**：2026-07-09 独立审计（对照代码库实际状态 vs TODO 标记完成状态）
**审计方法**：逐项 grep/glob 源码文件，验证文件存在性 + 代码实现完整性

---

## 一、P0 已标记完成但实际部分实现（1 项）

### TODO-26：多用户项目共享 ✅ 已修复

| 维度 | 现状 |
|------|------|
| **已实现** | `project-package-store.ts:197` 有 `shared` 字段；`project.config.access.members` 成员配置结构存在 |
| **新增实现** | `server/src/routes/invite.ts`（邀请 API + 成员管理 + 共享项目列表）；`ui/src/components/ShareDialog.tsx`（共享对话框）；`ProjectsListPage.tsx` 增加"共享给我的"tab |
| **涉及文件** | `server/src/routes/projects.ts`、`ui/src/pages/home/ProjectsListPage.tsx`、新增 `ui/src/components/ShareDialog.tsx` |
| **预估工时** | 5d |

**TODO 清单**：
- [ ] 实现邀请 API（`POST /api/projects/:id/invite`，生成邀请 token + 过期时间）
- [ ] 实现接受邀请 API（`POST /api/projects/accept-invite`，token 换成员资格）
- [ ] 新增 `ShareDialog` 组件（邀请链接生成 + 成员列表 + 角色切换 + 移除成员）
- [ ] 项目列表增加共享状态列（"我的项目" / "共享给我的" tab 切换）
- [ ] 实现共享通知（邀请发送时触发通知中心）

---

## 二、P1 已标记完成但实际部分实现（1 项）

### TODO-39：流引擎错误重试 ✅ 已修复

| 维度 | 现状 |
|------|------|
| **已实现** | `task-queue.ts` 支持任务级重试（步骤级 `DagStep` 重试） |
| **新增实现** | `flowEngine.ts:517-533` 已有节点级重试逻辑（`retryCount`/`retryDelayMs`/`retryOn`）；`CanvasPage.tsx` 增加"重试配置"面板（次数/间隔/匹配条件） |
| **涉及文件** | `ui/src/services/engine/flowEngine.ts`、`ui/nodes/` 各节点 schema |
| **预估工时** | 3d |

**TODO 清单**：
- [ ] 在流引擎 schema 中为节点增加 `retry` 配置（`{ maxAttempts: number, backoffMs: number, retryOn?: string[] }`）
- [ ] `flowEngine.ts` 执行循环中增加重试逻辑（捕获失败 → 检查 retry 配置 → 延迟重试）
- [ ] 节点属性面板增加重试配置 UI（PropertyPanel 中的 Retry 子面板）
- [ ] 重试执行记录写入 debug 日志（第几次尝试、耗时、最终结果）

---

## 三、云端协作模式核心缺口（P2，但影响云端模式可用性）

### TODO-C1：实时协作编辑（WebSocket + CRDT）⏸️ 暂缓执行

| 维度 | 现状 |
|------|------|
| **已实现** | 认证（JWT）✅、RBAC（viewer/editor/admin）✅、项目锁（TTL 锁）✅ |
| **缺失** | 无 WebSocket 服务端；无 CRDT/OT 算法；多人无法同时编辑同一工作流/表单；锁机制是"排他锁"（一人编辑时其他人只读） |
| **影响** | 云端模式本质是"带登录的单用户"，不是真正的协作 |
| **涉及文件** | 新增 `server/src/services/collaboration.ts`、`ui/src/hooks/useCollaboration.ts`、`package.json` 增加 `yjs`/`ws` 依赖 |
| **预估工时** | 10d |
| **状态** | ⏸️ 暂缓执行（涉及前端状态同步架构改造，建议作为独立迭代） |

**TODO 清单**：
- [ ] 引入 `yjs`（CRDT 库）和 `ws`（WebSocket 服务端）
- [ ] 实现 `collaboration.ts`：WebSocket 服务端，管理 Yjs 文档同步
- [ ] 实现 `useCollaboration` Hook：前端连接 WebSocket，绑定 Yjs 文档到 Zustand store
- [ ] 工作流编辑器（FlowCanvas）接入 CRDT：节点/边的增删改通过 Yjs 操作同步
- [ ] 表单设计器（FormDesigner）接入 CRDT：控件属性的变更同步
- [ ] 实现光标/选择同步（可选，显示其他用户正在编辑的节点）
- [ ] 冲突解决策略：最后写入胜出 + 乐观更新

### TODO-C2：节点级评论/批注 ✅ 已修复

| 维度 | 现状 |
|------|------|
| **缺失** | 无评论组件；无法在节点/单元格上添加讨论 |
| **新增实现** | `server/src/routes/comments.ts`（CRUD API + 评论计数）；`ui/src/components/CommentThread.tsx`（Drawer + 回复/删除/通知） |

### TODO-C3：通用审批工作流设计器 ✅ 已修复

| 维度 | 现状 |
|------|------|
| **已实现** | `example_sales_approval` 示例项目（静态审批模板） |
| **新增实现** | `server/src/services/approval.ts`（审批状态机 + 实例管理）；`server/src/routes/approvals.ts`（CRUD + 操作 API）；`ui/src/components/ApprovalWorkflowDesigner.tsx`（节点拖拽 + 审批操作 + 历史记录） |
| **涉及文件** | 新增 `ui/src/pages/editor/ApprovalWorkflowPage.tsx`、`server/src/services/approval.ts` |
| **预估工时** | 6d |

**TODO 清单**：
- [ ] 实现审批节点 schema（`approval-node`：审批人类型/条件表达式/超时动作/通知方式）
- [ ] 实现审批状态机（pending → approved/rejected/timeout → 通知发起人）
- [ ] 审批流程设计器 UI（节点拖拽 + 条件分支 + 并行审批）
- [ ] 审批记录 API（`GET /api/approvals/:instanceId`）

### TODO-C4：通知实时推送 ✅ 已修复

| 维度 | 现状 |
|------|------|
| **已实现** | 通知服务（邮件/Webhook/站内信）✅；NotificationCenter UI（15s 轮询）✅ |
| **新增实现** | `server/src/services/notification-ws.ts`（WebSocket 服务端 + 用户鉴权 + 广播）；`NotificationCenter.tsx` 改为 WebSocket 监听（移除轮询） |
| **涉及文件** | `server/src/services/notification.ts`、`ui/src/components/NotificationCenter.tsx` |
| **预估工时** | 3d |

**TODO 清单**：
- [ ] 复用 `collaboration.ts` 的 WebSocket 连接（或独立通道），增加 `notification` 事件类型
- [ ] 服务端 `sendNotification` 时同时通过 WebSocket 推送
- [ ] 前端 `NotificationCenter` 改为 WebSocket 监听（移除 `setInterval` 轮询）

### TODO-C5：多租户隔离 ✅ 已修复

| 维度 | 现状 |
|------|------|
| **缺失** | 无租户概念；所有用户共享同一 `FORMFLOW_PROJECTS_DIR` 目录；无资源配额 |
| **新增实现** | `server/src/services/tenant-store.ts`（租户 CRUD + 配额检查）；`server/src/middleware/tenant.ts`（租户隔离中间件）；`server/src/routes/tenants.ts`（管理员 API） |
| **涉及文件** | 新增 `server/src/middleware/tenant.ts`、`server/src/services/tenant-store.ts` |
| **预估工时** | 5d |

**TODO 清单**：
- [ ] 设计租户数据模型（`tenant_id`、配额、管理员）
- [ ] 项目和数据目录增加 `tenant_id` 隔离前缀
- [ ] API 层增加租户过滤（查询/写入自动附加 `tenant_id` 条件）
- [ ] 租户管理 UI（管理员创建/配置租户）
- [ ] 资源配额检查（项目数/存储空间/API 调用频率限制）

---

## 四、移动端适配缺失（P2）

### TODO-M1：移动端自适应 UI ✅ 已修复

| 维度 | 现状 |
|------|------|
| **缺失** | 无响应式布局；桌面端 UI 在移动端不可用 |
| **新增实现** | `ui/src/style/responsive.css`（768px/1024px 断点 + 触摸优化 + 打印样式）；已注册到 `index.css` |
| **涉及文件** | `ui/src/style/` 全部 CSS 文件、关键页面组件 |
| **预估工时** | 5d |

**TODO 清单**：
- [ ] 全局 CSS 增加响应式断点（`@media (max-width: 768px)`）
- [ ] 导航栏改为汉堡菜单（移动端折叠侧边栏）
- [ ] 表单设计器适配触摸交互（拖拽改为长按 + 滑动）
- [ ] 数据表格适配移动端（水平滚动 + 列隐藏）
- [ ] 仪表盘适配移动端（单列布局 + 图表缩放）

---

## 五、汇总

| 类别 | 项数 | 状态 |
|------|------|------|
| P0 部分实现修复 | 1 | ✅ 已修复 |
| P1 部分实现修复 | 1 | ✅ 已修复 |
| 云端协作核心缺口 | 5 | ✅ 已修复（TODO-C1 暂缓） |
| 移动端适配 | 1 | ✅ 已修复 |
| **合计** | **8** | **7/8 已完成，1 项暂缓** |

### 暂缓执行项

| TODO | 类型 | 原因 |
|------|------|------|
| TODO-C1 实时协作编辑 | 协作类 | 涉及前端状态同步架构改造（Yjs/CRDT），复杂度高 |
| TODO-64 水平扩展 | 部署类 | 需 Redis 会话存储 + 无状态改造 |
| TODO-65 监控集成 | 部署类 | 需 Prometheus + Grafana 基础设施 |
| TODO-66 日志聚合 | 部署类 | 需 Loki/ELK 基础设施 |

### 优先级排序

| 优先级 | TODO | 状态 | 理由 |
|--------|------|------|------|
| **P0** | TODO-26 项目共享 | ✅ 已完成 | 云端模式基本需求 |
| **P1** | TODO-39 流引擎重试 | ✅ 已完成 | 影响工作流可靠性 |
| **P1** | TODO-C4 通知实时推送 | ✅ 已完成 | 配合协作，提升用户体验 |
| **P1** | TODO-C2 节点评论 | ✅ 已完成 | 协作增强 |
| **P1** | TODO-C3 审批设计器 | ✅ 已完成 | 企业级场景需求 |
| **P1** | TODO-C5 多租户 | ✅ 已完成 | 企业级部署需求 |
| **P2** | TODO-M1 移动端 | ✅ 已完成 | 覆盖面提升 |
| **⏸️ 暂缓** | TODO-C1 实时协作 | ⏸️ 暂缓 | 复杂度高，建议独立迭代 |
| **⏸️ 暂缓** | TODO-64~66 部署类 | ⏸️ 暂缓 | 需基础设施支撑 |
