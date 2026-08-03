# [1.9.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.8.0...v1.9.0) (2026-08-02)


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
