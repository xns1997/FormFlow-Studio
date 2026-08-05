# [1.14.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.13.0...v1.14.0) (2026-08-05)


### Bug Fixes

* CI 样例项目审计门槛与实际入库样例数对齐 ([531ac70](https://github.com/xns1997/FormFlow-Studio/commit/531ac706dde7d8e6234e1572221227c5f9bf4d07))
* 删除通用节点中的行业定制字段（schema + 执行器逻辑） ([1cdeb38](https://github.com/xns1997/FormFlow-Studio/commit/1cdeb3869d9f2bb437bcb153eb9a7771224df877))
* 流程画布 Monaco 空模型崩溃——本地装配 monaco + 每实例独立 model path ([f56412e](https://github.com/xns1997/FormFlow-Studio/commit/f56412e99038c217f9aaef95dbdf87f7b88a81f1))
* 清理节点中无法传入传出/无法编辑且不参与运行的无用字段 ([b665c38](https://github.com/xns1997/FormFlow-Studio/commit/b665c38a75e697fa9faaba5ee63ffb5f01d8ede2))


### Features

* DSL 与事件 JS 编辑器升级为 IDE 级 Monaco 辅助编程 ([53b16ac](https://github.com/xns1997/FormFlow-Studio/commit/53b16ac0b6252708705115452cdf5e51a7795065))
* 流程节点端口契约全量审计加固与动态端口类型对齐 ([dbc49c3](https://github.com/xns1997/FormFlow-Studio/commit/dbc49c362f076a6c2042bba026bc55cc4af3879e))

# [1.13.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.12.2...v1.13.0) (2026-08-05)


### Features

* 全量审计并修复流程节点端口契约与连线类型校验 ([c5e2d96](https://github.com/xns1997/FormFlow-Studio/commit/c5e2d9632e25bea343f7e6e34a423ddaba8cfe1b))

## [1.12.2](https://github.com/xns1997/FormFlow-Studio/compare/v1.12.1...v1.12.2) (2026-08-05)


### Bug Fixes

* 模态框内 antd 下拉改挂载到模态容器并逐级 Esc，浮层点击不再误关；网格销毁后不再调用 AG Grid API ([19e0c24](https://github.com/xns1997/FormFlow-Studio/commit/19e0c240edb4b8e3d7b75daa4c65eec1da0f4720))

## [1.12.1](https://github.com/xns1997/FormFlow-Studio/compare/v1.12.0...v1.12.1) (2026-08-05)


### Bug Fixes

* 筛选器按数据类型提供专用输入与快捷操作，运算类型下拉不再关闭筛选弹窗 ([eb0cde7](https://github.com/xns1997/FormFlow-Studio/commit/eb0cde7589a6e9717de3fd71237e84e47fabcc4d))

# [1.12.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.11.2...v1.12.0) (2026-08-05)


### Features

* 筛选入口移入列头，顶栏仅展示/编辑/删除已有筛选且无筛选时隐藏 ([ec56d11](https://github.com/xns1997/FormFlow-Studio/commit/ec56d114f5a5a242fc06465ad230f84ce01c2a96))

## [1.11.2](https://github.com/xns1997/FormFlow-Studio/compare/v1.11.1...v1.11.2) (2026-08-05)


### Bug Fixes

* 添加筛选弹窗锚定到筛选栏，避免掉到表格区域下方 ([7595834](https://github.com/xns1997/FormFlow-Studio/commit/7595834258d6e511337dc5891f95b512cdfadb14))

## [1.11.1](https://github.com/xns1997/FormFlow-Studio/compare/v1.11.0...v1.11.1) (2026-08-05)


### Bug Fixes

* 数据预览恢复并增强整行/整列选择与拖拽框选 ([6c08e6c](https://github.com/xns1997/FormFlow-Studio/commit/6c08e6cab6c6a453128b4249f753b9d0417c0b52))

# [1.11.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.10.0...v1.11.0) (2026-08-05)


### Features

* 数据工作台编辑自由度与右键菜单升级；同步智能体 V4 增强、列表动效与文档修订 ([9caaaeb](https://github.com/xns1997/FormFlow-Studio/commit/9caaaeba007dfcaac536937c569b03bd022610e8))

# [1.10.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.9.0...v1.10.0) (2026-08-04)


### Features

* 智能体 V4 单循环重写与执行稳定性增强，新增一步建表工具与全量工具示例 ([f542f78](https://github.com/xns1997/FormFlow-Studio/commit/f542f780a7f438f4ca004610c1ba311c1087b8b3))

# [1.9.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.8.0...v1.9.0) (2026-08-02)

# [2.6.0](https://github.com/xns1997/FormFlow-Studio/compare/v2.5.0...v2.6.0) (2026-08-04)

### Features

* 新增一步建表 MCP 工具 `data_table.create`：columns + keyFields + 可选 rows 一次完成，内部自动配置主键与列枚举，支持类型别名，并带可照抄示例。
* 全部工具补充调用示例；核心工具补充成功返回形状与常见错误码，并渲染进「可用工具」提示词与 skill 文档（决策提示词工具目录、skill 运行时工具目录、调用示例）。
* 设置页「内置 skill 预览」截断从 1200 提升到 12000 字符，完整展示运行时工具目录与调用示例。
* 智能体执行稳定性：只读硬拦截（连续只读拒绝）、创建/配置类任务交付物自动验收、表单/规则/流程任务自动兜底（按任务指令自动执行真实工具）、强制写任务按计划顺序、系统统一注入稳定幂等键、执行期注入项目现状快照。
* 修正 Behavior Rule DSL 示例为合法语法（`require/range/validate` 参数是字段引用或数值），工作流示例改用真实端口（`behavior-log` 作终点）。

### Bug Fixes

* 修复任务交付物校验：规则/表单/流程任务指令未写资源前缀时也能正确核对；最终质量门禁不再因未规划回归测试而误拦（非测试类阻塞项清空即通过）。


# [2.5.0](https://github.com/xns1997/FormFlow-Studio/compare/v2.4.1...v2.5.0) (2026-08-04)

### Features

* 智能体暂停提问交互优化：需要用户补充时，问题卡片带上下文（当前任务、最近失败原因、同类阻塞次数）与一键回复选项（「继续，使用合理默认值」「暂停，我来补充」），回答后自动继续；旧线程无结构化问题时保持原文回退。


# [2.4.1](https://github.com/xns1997/FormFlow-Studio/compare/v2.4.0...v2.4.1) (2026-08-04)

### Bug Fixes

* 智能体证据与事件流水渲染：对象/JSON 摘要不再显示 `[object Object]`，改为可读单行摘要 + 可展开完整详情；重复证据自动折叠为「×N」并带证据类型徽标。


# [2.4.0](https://github.com/xns1997/FormFlow-Studio/compare/v2.3.0...v2.4.0) (2026-08-03)

### Features

* 智能体执行期形式化验证：新增 `rule_verify.model` 工具（有界显式状态模型检查），对携带 Behavior Rule DSL 的表单验证事件触发链终止与迁移确定性；写任务完成与线程最终门禁自动运行，静态错误、疑似无限触发链或确定性不一致阻止完成，反例路径回灌智能体修复。


# [2.3.0](https://github.com/xns1997/FormFlow-Studio/compare/v2.2.0...v2.3.0) (2026-08-03)

### Features

* 表单模板选择与使用：新增共享模板元数据层（`shared/form-templates.ts`），`catalog.form_templates.list/get` 供智能体与调用方发现模板，`form.create` 与 `form.generate_from_table` 支持 `templateId`（决定默认表单模式并记录 `templateKey`）。


### Bug Fixes

* comprehensive error hardening — no error can crash frontend or backend ([b217c40](https://github.com/xns1997/FormFlow-Studio/commit/b217c4041d70034031988b62a5c21565ee075540))
* **docs:** reset playground state when switching controls ([9f942d0](https://github.com/xns1997/FormFlow-Studio/commit/9f942d0e5e6fd74bffec1aa791ea844646b24f9c))
* **docs:** restore playground in control documentation page ([12b7f00](https://github.com/xns1997/FormFlow-Studio/commit/12b7f005495c3d129f587ddf9e3573ac2b5a97a9))
* **dsl-editor:** restore inline editor after fullscreen close ([5cccb3b](https://github.com/xns1997/FormFlow-Studio/commit/5cccb3b00d689be8e1d3d70781d9bb535000fc87))
* **editor:** wire error management, fix review findings, add backend error API ([63386f5](https://github.com/xns1997/FormFlow-Studio/commit/63386f53e3d613d772179dd3087bed11e22bbe4a))
* **frontend:** harden all remaining unprotected error paths ([92830f9](https://github.com/xns1997/FormFlow-Studio/commit/92830f981c4bcec5d4eae72485b4a3f4415f339d))
* **runtime:** allow scrollbar in runtime form content area ([4fc9a04](https://github.com/xns1997/FormFlow-Studio/commit/4fc9a045b28a61aa30cabb45d94291fb588543b6))
* **types:** replace any types with proper TypeScript types ([734cb41](https://github.com/xns1997/FormFlow-Studio/commit/734cb4174ebf67eaa5daea37e31930f92ddcec97))
* **ui:** add bottom padding to docs tree/toc scroll areas ([f802eff](https://github.com/xns1997/FormFlow-Studio/commit/f802eff9abce96027bb70095300b09d4b36dceb4))
* **ui:** add side margins to docs shell ([09c65e4](https://github.com/xns1997/FormFlow-Studio/commit/09c65e451b3d4f6e423d29e2c813e14b9f49379a))
* **ui:** docs layout flex chain — shell 100% height, columns min-height:0 ([70c8a34](https://github.com/xns1997/FormFlow-Studio/commit/70c8a3427fa814fcd7d20c280068a830d1d2c517))
* **ui:** docs scroll-root overflow-y:auto for home page scrolling ([c177e7d](https://github.com/xns1997/FormFlow-Studio/commit/c177e7d6657f05e39de3decd60d19996e751395d))
* **ui:** docs shell full width ([ce95aa5](https://github.com/xns1997/FormFlow-Studio/commit/ce95aa5bdb3ea68486ee6a463e769b221165e168))
* **ui:** docs shell height 100% inherits from parent ([efb17bc](https://github.com/xns1997/FormFlow-Studio/commit/efb17bc8da20cf8d311cc8905c63e61723d7b6cf))
* **ui:** docs three columns scroll independently, outer shell fixed ([5949717](https://github.com/xns1997/FormFlow-Studio/commit/5949717abd0924d00d1ae366c519cb01c1a23fe4))
* **ui:** docs tree/toc — wrap list in scroll container, aside is flex column ([5acbce4](https://github.com/xns1997/FormFlow-Studio/commit/5acbce4bc23ccd6ab35bd5a278a9bcc93a688684))
* **ui:** remove sticky/scroll from docs sidebar columns, page scrolls as one ([f6503cc](https://github.com/xns1997/FormFlow-Studio/commit/f6503ccee76f6b874a320bd86994448e1a45f1de))
* **ui:** widen docs article area from 760px to flexible width ([f72350b](https://github.com/xns1997/FormFlow-Studio/commit/f72350b5c80f978d06ef7afe3de0ea9f83b4d340))
* **ui:** widen docs shell to 1680px max ([48070da](https://github.com/xns1997/FormFlow-Studio/commit/48070da3d075f8e9c1937cd2533a451e1710536e))


### Features

* add jsonrepair package to enhance JSON parsing capabilities ([eca01a2](https://github.com/xns1997/FormFlow-Studio/commit/eca01a22dca8a7faeff081b9e25f15dd7a138e20))
* **docs:** add per-step Playwright illustrations ([ba25612](https://github.com/xns1997/FormFlow-Studio/commit/ba256123826786f11e452624bc446b0e6cf5ef83))
* **docs:** multi-scenario playgrounds + event cross-references ([f95e73f](https://github.com/xns1997/FormFlow-Studio/commit/f95e73f192889d362c35630aa212958ab7203f7c))
* **editor:** build guidance & debugging UX — diagnostic panel, component inspector, data flow tracer, onboarding guide ([33c61e5](https://github.com/xns1997/FormFlow-Studio/commit/33c61e5012208d2f466cd0891de469b50e8e68a1))
* **editor:** empty state guidance + flow field reference panel ([2d61f5f](https://github.com/xns1997/FormFlow-Studio/commit/2d61f5f77fe390e9ed327337e5228a211fc38cff))
* **editor:** mode switching optimization - naming, context, field ref, shortcuts ([2714ec6](https://github.com/xns1997/FormFlow-Studio/commit/2714ec6962529badd822db26d4e27b29af6b0432))
* harden frontend recovery and server supervision ([5911c00](https://github.com/xns1997/FormFlow-Studio/commit/5911c00313c9e5eab30c05af38243097ede492fc))
* integrate jsonrepair — all JSON parsing now auto-repairs malformed input ([6f0e032](https://github.com/xns1997/FormFlow-Studio/commit/6f0e032d17a18f5412b1932fed31ac11f43d8843))
* **ui:** docs center design audit — unified tokens, animations, spacing ([247dd39](https://github.com/xns1997/FormFlow-Studio/commit/247dd39d5ddcb12530c8d4ab5499a64ac22a23e4)), closes [#2563eb](https://github.com/xns1997/FormFlow-Studio/issues/2563eb) [#0f766e](https://github.com/xns1997/FormFlow-Studio/issues/0f766e) [#0f172a](https://github.com/xns1997/FormFlow-Studio/issues/0f172a)
* **ui:** improve docs table styling + add code syntax highlighting ([69c9172](https://github.com/xns1997/FormFlow-Studio/commit/69c9172ce86d8a49fbb76f3c7af4fe9746854644))

## [1.8.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.7.2...v1.8.0) (2026-07-31)


### Features

* **docs:** 多场景 Playground 与事件交叉引用 ([f95e73f](https://github.com/xns1997/FormFlow-Studio/commit/f95e73f))
  - 每个控件支持 2-4 个场景切换（如 input: 基础文本/密码输入/带前后缀/搜索框）
  - 控件文档自动关联事件文档，显示可点击的事件跳转链接
  - Playground 场景切换时自动重置 Props/Values JSON
* **ui:** 文档中心设计审计与交互增强 ([247dd39](https://github.com/xns1997/FormFlow-Studio/commit/247dd39))
  - 统一设计令牌：Playground 颜色 #2563eb → var(--accent)，徽章用 --success/--danger
  - 新增缺失 CSS 变量：--font-mono, --surface, --surface-secondary, --hover-bg
  - 新增动画：fadeIn 文章进入、slideUp 卡片交错入场、scaleIn 按压反馈
  - 侧边栏 hover 缩进 + 活跃项蓝色指示条
  - 代码块引入 highlight.js 语法高亮（JSON/JS）
* **types:** 替换 any 类型为精确 TypeScript 类型 ([734cb41](https://github.com/xns1997/FormFlow-Studio/commit/734cb41))
  - 节点执行器数据数组 any[] → Record<string, unknown>[]
  - 端口类型检查器 any → Record<string, unknown>
  - XLSX 工作表类型引入 XLSX.WorkSheet / XLSX.WorkBook


### Bug Fixes

* **docs:** 控件文档 Playground 在 DocsPlatformPage 中恢复显示 ([12b7f00](https://github.com/xns1997/FormFlow-Studio/commit/12b7f00))
* **docs:** 切换控件时 Playground 状态正确重置 ([9f942d0](https://github.com/xns1997/FormFlow-Studio/commit/9f942d0))
* **ui:** 文档三栏布局修复，tree/toc/article 各自独立滚动 ([f802eff](https://github.com/xns1997/FormFlow-Studio/commit/f802eff))
* **ui:** 文档首页滚动修复 ([c177e7d](https://github.com/xns1997/FormFlow-Studio/commit/c177e7d))
* **ui:** 文档表格行样式重设计，字段名用代码徽章高亮 ([69c9172](https://github.com/xns1997/FormFlow-Studio/commit/69c9172))


## [1.7.2](https://github.com/xns1997/FormFlow-Studio/compare/v1.7.1...v1.7.2) (2026-07-30)


### Bug Fixes

* **data-preview:** refresh server-side datasource after setting it ([9996e24](https://github.com/xns1997/FormFlow-Studio/commit/9996e24f9ea81a66922fc7a79d9924247eb2cd6f))

## [1.7.1](https://github.com/xns1997/FormFlow-Studio/compare/v1.7.0...v1.7.1) (2026-07-30)


### Bug Fixes

* **data-preview:** set server-side datasource on grid ready ([4012ddf](https://github.com/xns1997/FormFlow-Studio/commit/4012ddfc5953dd29115b2bb6dfa911669ce8e833))

# [1.7.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.6.0...v1.7.0) (2026-07-30)


### Features

* **data-preview:** 增强数据预览功能 ([de1213b](https://github.com/xns1997/FormFlow-Studio/commit/de1213b4))
  - 新增 TSV、XML、Parquet 文件解析支持
  - 新增外部数据源服务（MySQL/PostgreSQL/API 直连），加密存储连接配置
  - AG Grid 切换到 Server-Side Row Model + 虚拟滚动，新增服务端索引/缓存
  - 新增 FilterBar 筛选条组件，筛选类型纯中文显示，按数据类型分组
  - 概览页自动生成洞察式摘要，新增 7 种图表可视化
  - 配置面板重组，新增列宽变更追踪和重置功能


# [1.6.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.5.0...v1.6.0) (2026-07-30)


### Bug Fixes

* **test:** add workflow field to project settings test ([ea6dc97](https://github.com/xns1997/FormFlow-Studio/commit/ea6dc97fff83e3827ec3e7aba5b2edb0e7a7519d))
* **ui:** correct switch handle size in settings page ([afc93dd](https://github.com/xns1997/FormFlow-Studio/commit/afc93dd882fe878943d11f9a037e7d07b0710099))
* **ui:** improve spacing between settings components ([a6dbd2b](https://github.com/xns1997/FormFlow-Studio/commit/a6dbd2bce3871e66ed92930cad8efcef13ddd56b))


### Features

* **settings:** add appearance and workflow preferences ([8d54615](https://github.com/xns1997/FormFlow-Studio/commit/8d546152dcf94df4324fee2b0f077894b7335e9f))


### Documentation

* **docs:** add versioning constraints for Codex and Claude ([e79dcb](https://github.com/xns1997/FormFlow-Studio/commit/e79dcbbe))

# [1.5.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.4.0...v1.5.0) (2026-07-30)


### Bug Fixes

* **agent:** resolve TypeScript compilation errors ([9d717fc](https://github.com/xns1997/FormFlow-Studio/commit/9d717fcf0df42aeae72f7aebf4614bbd10786f14))
* **ui:** iOS 27 HIG compliance for all form controls ([c81c7ba](https://github.com/xns1997/FormFlow-Studio/commit/c81c7bad6d363fcbf88c0f959476451273792b8b))
* **ui:** remove white background on antd Select focus-within ([1105482](https://github.com/xns1997/FormFlow-Studio/commit/110548221514b841eb42fbe3bd9dbd45b9610a7c))


### Features

* **agent:** extract orchestration into modular agent subsystem ([42faf53](https://github.com/xns1997/FormFlow-Studio/commit/42faf53e988d0236b32c1091391a0d736688f062))

# [1.4.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.3.0...v1.4.0) (2026-07-30)


### Features

* add comprehensive animation system with anime.js v4 ([ffbcaeb](https://github.com/xns1997/FormFlow-Studio/commit/ffbcaeb35c3238a6d4988840a5ea1dec32da446b))

# [1.3.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.2.0...v1.3.0) (2026-07-29)


### Features

* update docs platform and split repository docs ([ae9d05d](https://github.com/xns1997/FormFlow-Studio/commit/ae9d05d2565c1cd3bbaec45c8fcb9c4ab9ddec1c))

# [1.2.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.1.0...v1.2.0) (2026-07-29)


### Bug Fixes

* Apple HIG design improvements for doc system ([8d1cf44](https://github.com/xns1997/FormFlow-Studio/commit/8d1cf4406162f78373e87da8faf6c17eb3653dc6))
* approve protobufjs build in pnpm ([cca71a5](https://github.com/xns1997/FormFlow-Studio/commit/cca71a5d651ce9b5f808385ee250d024af471148))
* make release smoke test self-contained ([e91f6d7](https://github.com/xns1997/FormFlow-Studio/commit/e91f6d743445c59c9ac1b30a70cdb6802671092d))
* provision Python runtime in CI ([a248dd7](https://github.com/xns1997/FormFlow-Studio/commit/a248dd7f9e8ca839b70291ab6bee1f5a789cca82))
* provision trusted CI runtimes ([f21795f](https://github.com/xns1997/FormFlow-Studio/commit/f21795fc6d6d5a87d5851e9c9f459e22ce3a7041))


### Features

* add specialist MCP and agent platform ([85ec0ae](https://github.com/xns1997/FormFlow-Studio/commit/85ec0aedafea7cae3b1381d934ebae2f0460c8c9))
* deepen FormFlow architecture and binding runtime ([f72a0bf](https://github.com/xns1997/FormFlow-Studio/commit/f72a0bfbb6f1e659f9c32915691f42e099d3e8a2))
* Phase 1 文档系统基础体验改造 ([4f1e977](https://github.com/xns1997/FormFlow-Studio/commit/4f1e977b407df6669c65852199b70170c7471666))
* Phase 2 Flow Nodes complete docs and interactive features ([85d17b4](https://github.com/xns1997/FormFlow-Studio/commit/85d17b48ea977a25ab91af3ae4428470e4408eee))
* Phase 3 advanced interaction and intelligence ([450c420](https://github.com/xns1997/FormFlow-Studio/commit/450c4206171c1ee4df4a81cba2bc083fdaf97aab))

# Changelog

根目录仅保留版本入口与最近状态，详细历史已拆分到 `docs/changelog/`。

## 当前状态

- 当前已发布版本：[`1.9.0`](./docs/changelog/v1.md)
- 开发中变更：[`Unreleased`](./docs/changelog/unreleased.md)

### Unreleased 摘要

- 完成仓库文档全量审查与勘误：按源码复核并修正节点/宏数量、项目包结构、数据导入格式、MCP/LLM 端点与 `/api/health` 语义；补全分卷 changelog 缺失的 1.3.0–1.8.0 版本与操作模板目录；同步修正 CLAUDE.md / CODEX.md 中已移除的旧接口（`/mcp`、`/api/ai/tools`、`project.apply_patch`、`release.apply`）。

更多开发中明细见 [`docs/changelog/unreleased.md`](./docs/changelog/unreleased.md)。

## 分卷导航

- [`docs/changelog/unreleased.md`](./docs/changelog/unreleased.md)
- [`docs/changelog/v1.md`](./docs/changelog/v1.md)
- [`docs/changelog/v0.md`](./docs/changelog/v0.md)

## 说明

- 根 `CHANGELOG.md` 继续作为仓库默认入口，便于发布工具与外部链接稳定指向。
- 历史明细按主版本拆分，避免根文件持续膨胀。
# [2.0.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.9.0...v2.0.0) (2026-08-03)

### ⚠️ Breaking changes

* 项目智能体彻底重写为类 Codex 单一主循环架构（V4）。
  * 旧 `/api/ai/project-agent/v2` 与 V1 端点已删除，新 API 挂载于 `/api/ai/project-agent/v4`（`/threads` 资源集 + 计划确认/拒绝 + 操作确认 + 控制/转向 + SSE 事件）。
  * 会话模型改为线程（thread）+ 单一活跃计划；不再有协调器/七角色专家双轨与 gRPC 专家运行时，不再使用 `StartAgentRun`/`ResumeAgentRun`。
  * 七个领域专家蒸馏为系统 skill（领域规范 + 运行时工具目录），能力包 agents 降级为作用域配置（指令 + 工具白名单 + 知识）。
  * 旧 `project-agent-*` 服务端模块与 `server/src/agent/*`、旧 `ProjectAgent*` 前端组件全部移除，旧会话数据保留但不再读写。

### Features

* 单一主循环：一个智能体持有完整上下文，自行决定下一步调用哪个 MCP 角色作用域的工具，观察→验证→反思→再决策。
* 确定性门禁：写任务通过前必须 `project.validate`，线程完成需结构校验 + 计划包含的质量/交付预检；`release.apply` 永远不可调用。
* Codex 终止语义：连续两步无进展暂停提问、同一阻塞条件连续三次标记 blocked、决策步预算超限暂停。
* 计划支持拒绝并携带反馈重新规划；执行中支持 steer 转向、暂停、停止、重试。
* 前端智能体界面同步重写为对话 + 计划清单 + 审批卡 + 进度反馈，设置页支持作用域 skill 配置编辑。
# [2.1.0](https://github.com/xns1997/FormFlow-Studio/compare/v2.0.0...v2.1.0) (2026-08-03)

### Features

* 智能体 UI 按 Apple HIG 重设计为三栏桌面工作台：左侧线程列表（搜索/筛选/分组/管理）、中间精简卡片流（表层一行摘要）、右侧详情层（单击表层条目以浮动 sheet 形态查看完整详情）。
* 视觉统一为语义令牌 + 系统材质（毛玻璃侧栏/工具栏）、明暗双模式、克制动效；正文对比度 ≥4.5:1，支持字号缩放与 reduced-motion。
* 状态与进度：顶部状态条（阶段徽标 + 文案 + 任务进度条）、计划卡内进度、SSE 实时更新；等待 LLM 时显示生成中状态而非空白。
* 交互与无障碍：Esc 关闭详情、`/` 聚焦线程搜索、⌘/Ctrl+Enter 发送、行内菜单聚焦、审批内联卡 + 高对比危险按钮、本地自动确认显示「已自动确认」徽标。
* 设置页智能体部分维持 macOS 偏好设置风格（左侧作用域列表 + 右侧编辑详情），与工作台共用语义令牌。
* 新增两种执行模式：**计划模式**（生成目标契约、用户确认后执行）与**目标模式**（自主走一步看一步，计划自动确认后立即执行，可持续转向）；线程可随时切换，`PATCH /threads/:id {mode}` 或随 turn 覆盖。
* 执行控制补齐：状态条提供 暂停 / 打断（聚焦输入框即时转向）/ 继续 / 停止 / 重试，安全边界生效，两模式通用。
