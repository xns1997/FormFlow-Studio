# FormFlow Studio

![Version](https://img.shields.io/badge/version-1.14.0-4f46e5)
![License](https://img.shields.io/badge/license-MIT-22c55e)
![CI](https://github.com/xns1997/FormFlow-Studio/actions/workflows/ci.yml/badge.svg)
![Release](https://github.com/xns1997/FormFlow-Studio/actions/workflows/release.yml/badge.svg)
![Node](https://img.shields.io/badge/Node-22-339933?logo=nodedotjs&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Monaco](https://img.shields.io/badge/Monaco-0.55-1e1e1e?logo=visualstudiocode&logoColor=white)

> 把 Excel 表格变成「会响应的表单」不难；难的是让这些响应可以被编译、被证明、被审计，并且被 AI 安全地改写。—— 本仓库围绕这个「难」字展开。

**Abstract（摘要）** —— FormFlow Studio 是一个面向「表格数据 → 交互表单」的编排框架。它将行为规则 DSL 作为语义核心，配合流程节点端口契约审计与事件契约单一事实来源，把「表单如何响应」建模为可编译、可验证、可被语言服务辅助编辑的一等对象；并在此之上提供七领域 MCP 智能体平台，使 AI 在 revision、幂等与形式化验证构成的门禁内参与表单、规则与流程的构建。

**Keywords（关键词）**：数据驱动表单生成 · 行为 DSL · 流程编排 · 有界模型检查 · 端口契约 · 编辑器语言服务 · 智能体

---

## 1. 问题与动机

表格是信息的载体，表单是信息的交互界面；二者之间的转换成本长期由手工承担。当规则数量增长，「表单如何响应」便从实现问题退化为可信问题：

- 规则缺少形式语义：行为难以证明终止性，迁移也可能存在歧义；
- 流程节点之间的连线依赖端口契约，schema 漂移往往到运行期才暴露；
- AI 参与编辑时，写入动作缺少可验证的边界。

FormFlow 的应对是把规则、契约与事件 API 统一建模为事实来源，再让编辑器（Monaco）与智能体（MCP）站在同一份事实上工作，而不是各自发明一套。

## 2. 系统架构

四层结构，由内向外：

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 共享领域核心 | `shared/formflow-core` | 行为 DSL 文法（Chevrotain）、解析与静态分析、有界模型检查、事件契约、字段推断、表单脚手架 |
| 服务端 | `server` | Express API、七领域 MCP（project / data / form / workflow / behavior / quality / delivery）、项目包校验、oxfmt 代码格式化 |
| 客户端 | `ui` | React 19 + Vite；表单设计器（X6）、流程画布、Monaco 语言服务（DSL / 事件 JS）、数据工作台（AG Grid） |
| 智能体平台 | `server` agent 模块 | 单循环 V4：`batchReads`、`replan`、artifact 转存、回归测试门禁、模型自审、运行指标 |

## 3. 核心机制

### 3.1 行为 DSL 与形式化验证

- 语法层：Chevrotain 可执行文法为单一事实来源，旧正则实现保留为差分对拍基线（GAST 生成 + 变异模糊），保证「新实现只增不减、不拒绝旧实现接受的行」。
- 静态层：跨规则回写环（FFR304）、`watch` 覆盖（FFR305）、表达式类型（FFR306）、条件不可满足（FFR309）；结构诊断含缺 `->`（FFR105）与括号不闭合（FFR106）。
- 形式层：`rule_verify.model` 对携带 DSL 的表单做有界显式状态模型检查，验证事件触发链终止与迁移确定性；反例路径回灌智能体修复。

### 3.2 端口契约审计

- 每个节点包 schema 的外露端点、执行器消费与产出必须全部声明；服务端参考目录与客户端注册表、节点包三方同步。
- 动态端口（`workflow:import` / `workflow:export` / `generic:custom-js`）按完整运行时类型系统解析，未知类型才归一化为 `any`。
- 常驻审计：真实项目全部工作流连线可被 schema 采纳，且成功路径执行器返回键覆盖声明输出。

### 3.3 编辑器语言服务（Monaco）

- 规则 DSL：悬停文档、参数提示、快速修复、大纲与折叠、全量格式化、规则驱动内联补全、语义高亮——全部在自定义 Provider 层实现，不引入 LSP。
- 事件 JS：TS worker 提供类型底座（按事件契约自动生成的 `.d.ts` + 中文 JSDoc），自定义增强覆盖字符串参数内上下文补全、ghost text、`await`/引用修复。

### 3.4 事件契约单一事实来源

`FORM_EVENT_CONTRACT` 一份清单同时驱动运行时别名、编辑器补全与参考文档；新增任一 API 不会在其他表面静默遗漏。

### 3.5 智能体与 MCP

七领域角色化 MCP；写操作强制 revision + 幂等键 + 破坏性确认；发布仅 `release.preview`，`release.apply` 永远不可用；写任务完成前必须通过回归测试与模型自审，确定性门禁不因任何确认放宽。

## 4. 质量与工程

- 验证流水线：`pnpm typecheck`（ui / server / tests 三份 tsconfig）→ `pnpm test`（node:test，含 DSL 差分、属性与一致性测试）→ `pnpm test:dsl-gates` → `pnpm build`。
- CI：ubuntu-latest · Node 22 · pnpm 11 · Python 3.12；语义化版本 + semantic-release 自动发版。
- 版本约定：补丁 `0.0.x`，特性/重构 `0.x.0`（详见 [`CODEX.md`](./CODEX.md)）。

## 5. 快速开始

```bash
bash scripts/init-env.sh   # Node + pnpm + Python venv + 依赖
pnpm dev:all              # 前端 + 后端
pnpm verify               # typecheck + tests + dsl-gates + build
```

Windows 请改用 `powershell -ExecutionPolicy Bypass -File scripts/init-env.ps1`。更完整的安装与使用见 [`docs/readme/getting-started.md`](./docs/readme/getting-started.md) 与 [`docs/readme/beginner-tutorial.md`](./docs/readme/beginner-tutorial.md)。

## 6. 文档导航

| 入口 | 内容 |
| --- | --- |
| [`docs/readme/overview.md`](./docs/readme/overview.md) | 功能概览、能力边界、节点与数据流 |
| [`docs/readme/ai-project-editing.md`](./docs/readme/ai-project-editing.md) | 七领域 MCP、Codex skill、离线项目包编辑 |
| [`docs/readme/project-layout.md`](./docs/readme/project-layout.md) | 技术栈、目录结构与项目包格式 |
| [`docs/behavior-rule-syntax.md`](./docs/behavior-rule-syntax.md) | 规则 DSL 语法与 lint 编号 |
| [`docs/behavior-event-reference.md`](./docs/behavior-event-reference.md) | 事件与上下文 Reference |
| [`docs/llm-tools-mcp.md`](./docs/llm-tools-mcp.md) | MCP / HTTP 工具说明 |
| [`docs/project-creation-spec.md`](./docs/project-creation-spec.md) | 项目编排规范 |
| [`docs/llm-provider.md`](./docs/llm-provider.md) · [`docs/pgvector.md`](./docs/pgvector.md) | 大模型 Provider 与向量检索 |
| [`docs/readme/mermaid-flowchart-guidelines.md`](./docs/readme/mermaid-flowchart-guidelines.md) | Mermaid 流程图规范 |

## 7. 局限性与后续工作

出于诚实，列出当前已知边界：

- DSL 为行级语法，跨表单与跨项目的规则引用尚未建模；
- 内联补全目前为规则驱动，尚未接入模型续写（AI 生成仍走确认式提案）；
- 事件 JS 上下文按契约静态建模，运行时动态键（如 `ctx.controls` 别名）依赖人工校验；
- 自动生成的 `CHANGELOG.md` 保留了一段 2.x 历史线，尚未与 1.x 分卷归档对齐。

## 参考

[1] [`docs/behavior-rule-syntax.md`](./docs/behavior-rule-syntax.md) — 规则 DSL 语法、运算符与 lint 编号

[2] [`docs/behavior-event-reference.md`](./docs/behavior-event-reference.md) — 事件上下文与控件句柄

[3] [`docs/llm-tools-mcp.md`](./docs/llm-tools-mcp.md) — MCP / HTTP 工具契约

[4] [`docs/project-creation-spec.md`](./docs/project-creation-spec.md) — 项目编排规范

[5] [`CODEX.md`](./CODEX.md) — 工具调用、revision、幂等与发布门禁

## License

MIT
