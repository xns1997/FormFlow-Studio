## [1.7.3](https://github.com/xns1997/FormFlow-Studio/compare/v1.7.2...v1.7.3) (2026-07-30)


### Bug Fixes

* **data-preview:** revert to client-side row model for reliable data display ([6d1785d](https://github.com/xns1997/FormFlow-Studio/commit/6d1785daad7de2efab4a156e2411555484252e01))

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

- 当前已发布版本：[`1.7.0`](./docs/changelog/v1.md)
- 开发中变更：[`Unreleased`](./docs/changelog/unreleased.md)

## 分卷导航

- [`docs/changelog/unreleased.md`](./docs/changelog/unreleased.md)
- [`docs/changelog/v1.md`](./docs/changelog/v1.md)
- [`docs/changelog/v0.md`](./docs/changelog/v0.md)

## 说明

- 根 `CHANGELOG.md` 继续作为仓库默认入口，便于发布工具与外部链接稳定指向。
- 历史明细按主版本拆分，避免根文件持续膨胀。
