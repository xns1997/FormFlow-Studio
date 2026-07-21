# 通用大模型 Provider

## 规则语法智能体

规则编辑器使用受控智能体协调代码编辑、语法检查、隔离测试和表单状态读取。Express 负责会话、权限、工具执行与最终写入；Provider 只运行模型节点和声明式图，不访问项目数据库。

内置工具为 `form_state.read`、`rule_syntax.lint`、`rule_test.run` 和 `rule_reference.search`。工具参数可使用 `{"$path":"input.code"}` 读取 Agent state，模型 prompt 可使用 `{{input.code}}` 等受控占位符；两者都不执行任意 Python。

表单运行状态在浏览器中自动脱敏后按次提交，不写入会话或 checkpoint。规则提案使用源码 SHA-256 检测并发修改；应用时 Express 会重新 lint、重新编译，并在一次项目包写入中同步更新 `ruleCode` 和控件 `linkageRules`。

FormFlow 的模型运行时位于独立的 `llm-provider/` 服务。前端只访问 Express；Express 保存配置、租户权限和审计信息，通过 gRPC 调用 Provider。Provider 不读取 FormFlow 项目数据，也不持久化 API Key。

## 服务边界

- Express：Provider、模型 Profile、Agent 定义、加密凭据、项目覆盖、业务工具执行。
- Python Provider：模型协议适配、LangGraph 调用图、Embedding、流式输出、声明式 Agent、管理员插件和 PostgreSQL checkpoint。
- Flask：等价 HTTP/SSE 接口以及 `/healthz`、`/readyz`、`/metrics`。
- gRPC：Express 默认使用的内部协议，定义在 `llm-provider/proto/llm_provider.proto`。

支持 `openai`、`openai_compatible`、`anthropic`、`gemini`、`ollama` 和 `lmstudio`。LM Studio 使用 OpenAI-compatible 协议。

## 系统设置

管理员可从左侧导航进入 **系统设置 → 大模型** 完成全局配置，无需直接编辑配置文件：

1. 在“模型 Provider”中新建云端或本地连接，填写 Base URL、API Key 和请求超时，并使用“测试”验证连接。已保存的密钥只显示是否配置，编辑页不会回显明文；API Key 留空保存会保留现有密钥。
2. 在“模型 Profile”中声明业务所需能力、默认 Temperature、最大输出 Token，并配置主路由及有序 Fallback。业务代码引用 Profile，而不是直接引用密钥或供应商。
3. “Provider 服务”展示 Python 运行时与 PostgreSQL checkpoint 状态。Provider 暂时离线不会阻止管理员编辑 Express 中保存的连接与 Profile。

系统设置创建的是 `global` 配置。租户级和项目级覆盖仍通过 Express 管理 API 管理，并在请求上下文中按项目 → 租户 → 全局的顺序解析。云端模式下该页面对应的管理接口仅管理员可访问。

## 本地启动

```bash
# 首次安装 Python 依赖
python3 -m venv llm-provider/.venv
llm-provider/.venv/bin/pip install -r llm-provider/requirements.txt

# 一键启动 Provider、Express 和前端
npm run dev:all
```

只启动模型服务可运行 `npm run dev:provider`。脚本依次使用 `LLM_PROVIDER_PYTHON`、`PYTHON_EXECUTABLE`、`llm-provider/.venv/bin/python`、`.venv-provider/bin/python` 或系统 `python3`。Express 本地默认连接 `127.0.0.1:50051`，避免部分系统将 `localhost` 优先解析为未监听的 IPv6 `::1`。

默认端口为 HTTP `5001`、gRPC `50051`。本地默认服务令牌是 `formflow-provider-development-token`；Express 会基于共享 secret 为每次调用签发 60 秒短期 token。生产环境必须显式设置随机 secret、`LLM_CONFIG_MASTER_KEY` 和 mTLS 证书。

也可以使用 `docker compose up --build` 同时启动 Express、Provider 和 PostgreSQL。Compose 中 Express 任务队列与 Agent checkpoint 共用 PostgreSQL 实例，但使用独立数据表。

PostgreSQL 配置：

- Express：`FORMFLOW_DATABASE_URL`
- 生产环境强制要求任务存储：`FORMFLOW_DATABASE_REQUIRED=true`
- 本地自动初始化与启动：`FORMFLOW_DATABASE_AUTO_START=true`
- 本地托管数据目录：`FORMFLOW_POSTGRES_DATA_DIR`；`initdb`/`pg_ctl` 不在 PATH 时通过 `FORMFLOW_POSTGRES_BIN_DIR` 指定其目录
- Provider：`LLM_PROVIDER_DATABASE_URL`
- checkpoint namespace：`LLM_PROVIDER_CHECKPOINT_NAMESPACE`
- 生产环境强制要求持久化存储：`LLM_PROVIDER_CHECKPOINT_STORE_REQUIRED=true`

Provider 会自动创建 `formflow_llm_agent_runs`，Express 会自动创建 `formflow_tasks`。对应的可审计初始化脚本位于 `llm-provider/sql/001_agent_runs.sql` 和 `server/sql/001_tasks.sql`。Agent run 的 `expires_at` 由 `LLM_PROVIDER_RUN_TTL_SECONDS` 控制，保存运行时会自动清理过期记录。

Express 队列通过 `FOR UPDATE SKIP LOCKED` 抢占任务，并使用 30 秒 lease 和 10 秒心跳；进程异常退出后，其他实例只会接管 lease 已过期的任务。启动时会将旧的本地 `server/data/tasks/tasks.json` 记录幂等导入 PostgreSQL。

Express 启动时先执行基础设施自检：连接目标数据库；目标库不存在时通过 `postgres` maintenance database 创建；localhost PostgreSQL 未运行且允许自动启动时，使用 `initdb` 初始化本地数据目录并通过 `pg_ctl` 启动。远程或容器数据库只探测、不由应用进程控制。

AI Provider 不作为 Express 的启动前置条件。Express 启动时立即执行一次 gRPC Health，此后按 `FORMFLOW_HEALTH_INTERVAL_MS` 周期探测。`GET /api/health` 返回缓存的数据库与 AI 状态以及 `capabilities.ai`；`GET /api/ready` 仅以数据库是否可用决定 readiness；`GET /api/ai/health` 触发实时 AI 探测。AI 服务恢复后 flag 会自动恢复为 `true`。

从旧部署升级时，应先停止创建新的 Agent run，并处理完仍处于 `waiting_tool` 的运行。旧 Redis checkpoint 不会自动复制；升级后设置上述两个数据库 URL，启动 PostgreSQL，再启动 Provider 和 Express。通过 `/readyz` 中的 `checkpoint_store: "postgresql"` 和系统设置页的“PostgreSQL checkpoint 已连接”确认切换完成。

Flask HTTP 入口在生产环境应位于 TLS 反向代理之后；Express 到 Provider 的 gRPC 链路可通过 `LLM_PROVIDER_REQUIRE_MTLS=true` 强制双向证书校验。

## Express 管理 API

- `GET/POST/PUT/DELETE /api/ai/providers`
- `POST /api/ai/providers/:id/test`
- `GET /api/ai/providers/:id/models`
- `GET/POST/PUT/DELETE /api/ai/profiles`
- `GET/POST/PUT/DELETE /api/ai/agents`
- `POST /api/ai/agents/:id/runs`
- `GET /api/ai/runs/:runId`
- `POST /api/ai/runs/:runId/resume`
- `GET /api/ai/plugins`

云端模式下管理接口仅管理员可用。配置支持 `global`、`tenant`、`project`，项目配置只在对应项目上下文中可见。

## 推理 API

现有 `/api/ai/chat`、`query`、`insight` 保持兼容，并新增：

- `POST /api/ai/chat/stream`
- `POST /api/ai/embeddings`

请求使用 `profileId` 选择模型 Profile；旧的 `provider: "openai" | "local"` 分别映射到 `default-cloud` 与 `default-local`。浏览器传入的 `baseUrl` 和 `apiKey` 会被忽略。

## Agent 与插件

声明式 Agent 节点只允许 `model`、`router`、`tool`、`subgraph`、`plugin`、`end`。外部工具节点会暂停运行并产生 `tool_call`；Express 校验并执行已注册工具后恢复 checkpoint。

Python 插件目录结构：

```text
plugins/example/
  plugin.json
  plugin.py
```

`plugin.json` 必须声明 `id`、`version`、`entry`。插件 ID 还必须出现在 `LLM_PROVIDER_PLUGIN_ALLOWLIST` 中。API 不提供上传或安装 Python 代码的能力。
