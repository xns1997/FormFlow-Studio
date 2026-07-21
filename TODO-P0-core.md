# FormFlow Studio 阶段一：核心完善（P0）

**目标**：补齐完备数据处理框架的核心缺失，使框架具备基本可用性。
**预估周期**：4-6 周
**涉及模块**：server/、ui/nodes/、ui/src/pages/、ui/src/services/、python-service/

---

## 1. 数据源连接能力

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 01 | 实现 ODBC/JDBC 通用数据库连接器（`mysql2`/`pg`/`mssql` 驱动） | `server/src/routes/data.ts`, 新增 `server/src/services/db-connector.ts` | 3d |
| 02 | 新增 `db-connect` 节点，支持连接字符串配置、认证、测试连接 | `ui/nodes/generic-db-connect/` | 2d |
| 03 | 新增 `db-query` 节点，支持 SQL 编辑器 + 结果预览 | `ui/nodes/generic-db-query/`, `ui/src/components/CodeEditor` | 3d |
| 04 | 新增 `db-write` 节点，支持批量 INSERT/UPSERT 写入目标表 | `ui/nodes/generic-db-write/` | 2d |
| 05 | 新增 `rest-api` 节点，支持 GET/POST/PUT/DELETE + OAuth2/API Key + 分页 | `ui/nodes/generic-rest-api/` | 3d |
| 06 | 新增 `graphql-query` 节点，支持 GraphQL 查询构建 + 变量绑定 | `ui/nodes/generic-graphql-query/` | 2d |

---

## 2. 调度与后台执行

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 07 | 实现任务调度引擎（`node-cron` + PostgreSQL 队列），支持 Cron 表达式 | `server/src/services/scheduler.ts`, `package.json` | 4d |
| 08 | 实现异步任务队列，支持后台执行 + 状态轮询 | `server/src/services/task-queue.ts`, `server/src/routes/tasks.ts` | 3d |
| 09 | 新增 `schedule-trigger` 节点，支持定时触发工作流 | `ui/nodes/behavior-schedule-trigger/` | 2d |
| 10 | 新增任务执行状态追踪 UI（执行历史、耗时、错误日志） | `ui/src/pages/editor/TaskMonitorPage.tsx`, 新增路由 | 3d |
| 11 | 实现任务依赖管理（DAG 调度 + 条件分支 + 重试策略） | `server/src/services/scheduler.ts`, `ui/src/services/engine/flowEngine.ts` | 4d |

---

## 3. 认证与权限

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 12 | 实现 JWT 认证中间件（Express 层） | `server/src/middleware/auth.ts`, `server/src/index.ts` | 2d |
| 13 | 新增用户管理模块（注册/登录/角色分配） | `server/src/routes/users.ts`, `server/src/services/user-store.ts` | 3d |
| 14 | 实现 RBAC 权限模型（管理员/编辑者/查看者） | `server/src/middleware/rbac.ts`, `server/src/services/permission.ts` | 3d |
| 15 | 实现项目级别权限控制（谁能查看/编辑/运行） | `server/src/routes/projects.ts` 改造 | 2d |
| 16 | 新增登录页面 UI（登录表单 + 会话管理） | `ui/src/pages/auth/LoginPage.tsx`, `ui/src/services/io/api.ts` 改造 | 3d |

---

## 4. 大文件处理

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 17 | 实现前端流式解析（Web Worker + Streaming Reader），支持 100K+ 行 | `ui/src/services/data/streamingParser.worker.ts`, 新增 Worker | 4d |
| 18 | 实现服务端分页查询 API（`/api/data/paginated`） | `server/src/routes/data.ts` 新增端点 | 2d |
| 19 | AG Grid 虚拟滚动优化 + 分页控件 | `ui/src/components/DataPreview.tsx` 改造 | 2d |

---

## 5. 仪表盘

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 20 | 新增仪表盘页面（拖拽式布局 + 多组件组合） | `ui/src/pages/editor/DashboardPage.tsx`, `ui/src/components/DashboardGrid.tsx` | 5d |
| 21 | 新增更多图表类型（桑基图/热力图/雷达图/漏斗图/地图/树图） | `ui/src/components/charts/` 目录扩展 | 4d |
| 22 | 实现图表间联动筛选（点击筛选 + 联动刷新） | `ui/src/services/display/dashboardInteractions.ts` | 3d |

---

## 6. Docker 容器化

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 23 | 编写 Dockerfile（多阶段构建，前端 + 后端 + Python 服务） | 项目根目录 `Dockerfile` | 2d |
| 24 | 编写 docker-compose.yml（一键启动所有服务） | 项目根目录 `docker-compose.yml` | 1d |
| 25 | 环境变量配置模板 | `.env.example`, `server/src/config/env.ts` | 1d |

---

## 7. 多人协作基础

| # | TODO | 涉及文件 | 预估工时 |
|---|------|---------|---------|
| 26 | 实现多用户项目共享（项目列表显示共享状态） | `server/src/routes/projects.ts`, `ui/src/pages/home/ProjectsListPage.tsx` | 2d |
| 27 | 实现基础锁机制（防止并发编辑冲突） | `server/src/services/project-lock.ts` | 2d |
| 28 | 新增操作日志（谁在什么时候修改了什么） | `server/src/routes/audit.ts`, `server/src/services/audit-store.ts` | 2d |

---

## 阶段一总计

| 类别 | 项数 | 预估总工时 |
|------|------|-----------|
| 数据源连接 | 6 | 15d |
| 调度与后台 | 5 | 16d |
| 认证与权限 | 5 | 13d |
| 大文件处理 | 3 | 8d |
| 仪表盘 | 3 | 12d |
| Docker 容器化 | 3 | 4d |
| 多人协作基础 | 3 | 6d |
| **合计** | **28** | **~74d（约 15 周，单人）** |

---

## 完成状态（2026-07-11）

| # | 状态 | 实现证据 |
|---|---|---|
| 01 | ✅ | `server/src/services/db-connector.ts`、`server/src/routes/database.ts` |
| 02 | ✅ | `ui/nodes/generic-db-connect/schema.json` |
| 03 | ✅ | `ui/nodes/generic-db-query/schema.json`、通用执行器 |
| 04 | ✅ | `ui/nodes/generic-db-write/schema.json`、500 行批量 INSERT/UPSERT |
| 05 | ✅ | `ui/nodes/generic-rest-api/schema.json`，支持四种方法、API Key、Bearer、OAuth2 与分页 |
| 06 | ✅ | `ui/nodes/generic-graphql-query/schema.json` |
| 07 | ✅ | `server/src/services/scheduler.ts`，Cron + PostgreSQL `SKIP LOCKED`/lease 队列 |
| 08 | ✅ | `server/src/services/task-queue.ts`、`server/src/routes/tasks.ts` |
| 09 | ✅ | `ui/nodes/behavior-schedule-trigger/schema.json` |
| 10 | ✅ | `ui/src/pages/editor/TaskMonitorPage.tsx` |
| 11 | ✅ | DAG 依赖、条件与逐步骤重试由 `task-queue.ts` 执行 |
| 12 | ✅ | `server/src/middleware/auth.ts` |
| 13 | ✅ | `server/src/routes/users.ts`、`server/src/services/user-store.ts` |
| 14 | ✅ | `server/src/middleware/rbac.ts`、`server/src/services/permission.ts` |
| 15 | ✅ | 项目路由 ACL 与成员权限接口 |
| 16 | ✅ | `ui/src/pages/auth/LoginPage.tsx`、前端会话客户端 |
| 17 | ✅ | `streamingParser.worker.ts` 使用 File Stream + TextDecoder 分批解析 |
| 18 | ✅ | `POST /api/data/paginated` |
| 19 | ✅ | AG Grid 虚拟化、分页控件与服务端分页数据源 |
| 20 | ✅ | `DashboardPage.tsx`、`DashboardGrid.tsx`，布局可拖拽并持久化 |
| 21 | ✅ | `AdvancedChart.tsx`：桑基、热力、雷达、漏斗、地图、树图 |
| 22 | ✅ | `dashboardInteractions.ts` 与图表点击联动 |
| 23 | ✅ | 根目录多阶段 `Dockerfile` |
| 24 | ✅ | `docker-compose.yml`（应用 + PostgreSQL + 持久卷） |
| 25 | ✅ | `.env.example`、`server/src/config/env.ts` |
| 26 | ✅ | 项目 ACL 共享与项目列表共享状态 |
| 27 | ✅ | `server/src/services/project-lock.ts` 与锁 API/写入校验 |
| 28 | ✅ | `server/src/services/audit-store.ts`、`server/src/routes/audit.ts` |
