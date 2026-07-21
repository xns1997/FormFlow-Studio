# [1.1.0](https://github.com/xns1997/FormFlow-Studio/compare/v1.0.0...v1.1.0) (2026-07-13)


### Features

* unify form configuration and control synchronization ([f7afb4a](https://github.com/xns1997/FormFlow-Studio/commit/f7afb4aa026d175cfc2202f3080418da70e27d2b))

# 1.0.0 (2026-07-13)


### Bug Fixes

* clean duplicate behavior rules + delete legacy style.css + update TODO ([7e4cbfe](https://github.com/xns1997/FormFlow-Studio/commit/7e4cbfe603f37729d28bd342105cffa9153bb64a)), closes [#1](https://github.com/xns1997/FormFlow-Studio/issues/1) [#2](https://github.com/xns1997/FormFlow-Studio/issues/2)
* condition-branch executor uses evaluateConfiguredExpression for richer scope, removes redundant variable, adds error logging, and adds false-branch test ([9f7cc46](https://github.com/xns1997/FormFlow-Studio/commit/9f7cc465438294a0e14d7ce91f0b232492016e8c))
* execute custom event code in form components ([5b5fe4d](https://github.com/xns1997/FormFlow-Studio/commit/5b5fe4d09d54fa9bc11b9903df27b302d4e2c33a))
* Monaco fullscreen button positioning and suggest widget clipping ([511895d](https://github.com/xns1997/FormFlow-Studio/commit/511895d648635ff076c59b43a48135a037452e9a))
* Monaco suggestions clipping and enable all node executors ([772242f](https://github.com/xns1997/FormFlow-Studio/commit/772242f2a568e090be1991c7929d619335674e67))
* onNodeFailure abort now stops execution in both sequential and parallel modes ([94c5cd4](https://github.com/xns1997/FormFlow-Studio/commit/94c5cd4fc76c03b67628eae3639b33578f9cb388))
* passive event warnings and full default outputs for all event nodes ([60e7950](https://github.com/xns1997/FormFlow-Studio/commit/60e79502fab7581a84ad0017617d44a20611d02c))
* redesign Monaco editor container to allow suggest widget overflow ([b9e88ed](https://github.com/xns1997/FormFlow-Studio/commit/b9e88eda72561f395f9898de3d536e2bb8e661db))
* revert Monaco overflow hacks causing button/suggestion misplacement ([0ca7d17](https://github.com/xns1997/FormFlow-Studio/commit/0ca7d17c6c82eb9c99dc0d38f53396280661b4dc))
* sanitize checkpoint id parameter to prevent path traversal attacks ([7ad3641](https://github.com/xns1997/FormFlow-Studio/commit/7ad364154acece319bb8b407a61fcac282e15a91))


### Features

* add 18 ML nodes with Python backend ([439f9f2](https://github.com/xns1997/FormFlow-Studio/commit/439f9f209bf6c45718d5c141e57481cbfb07c081))
* add 25 data processing nodes for complete ETL system ([6d0842a](https://github.com/xns1997/FormFlow-Studio/commit/6d0842a72a9ef5e8251eba34e8cd66c30c8d6c66))
* add debug option for variable snapshots in flow engine events ([876d8f7](https://github.com/xns1997/FormFlow-Studio/commit/876d8f7bd7f2c6bdb62572e73738323769898f9f))
* add default event code templates for form components ([57fc024](https://github.com/xns1997/FormFlow-Studio/commit/57fc0243f6ab2ec2198f0966d12c4dbb69f3ff15))
* add export and display nodes ([a6c7996](https://github.com/xns1997/FormFlow-Studio/commit/a6c7996cf7cb10221f33ca84def5e81ab36ff6f0))
* add generic-call-workflow node for sub-workflow invocation ([6641541](https://github.com/xns1997/FormFlow-Studio/commit/66415416f52e28ea211187fe50d24df46016290b))
* add generic-condition-branch node for flow control routing ([bc3a307](https://github.com/xns1997/FormFlow-Studio/commit/bc3a307cca7e09dd71cc889dbed08ceabd5039e6))
* add generic-for-each loop node for array iteration ([c2b0937](https://github.com/xns1997/FormFlow-Studio/commit/c2b0937e4e1979aa8beadef01154ac99ddcdfa13))
* add hover tooltips and search keywords to all nodes ([5749451](https://github.com/xns1997/FormFlow-Studio/commit/574945194f7301c49129c1faee63c3e5d51c1147))
* add isolatedScopes option for variable scope isolation in flow engine ([7537852](https://github.com/xns1997/FormFlow-Studio/commit/75378520889ea63c77f78c8d47363f174b6b6897))
* add onNodeFailure option to ExecuteFlowOptions ([dcccb6d](https://github.com/xns1997/FormFlow-Studio/commit/dcccb6d5ba8f3ef555a85319b42c7d8c30fb9092))
* add parallel execution option for flow engine nodes ([a33c3fb](https://github.com/xns1997/FormFlow-Studio/commit/a33c3fb5d097fc2eab5ed77931e791f1712e0c9b))
* add server-side checkpoint persistence API ([444670a](https://github.com/xns1997/FormFlow-Studio/commit/444670a94e042154065c98519ca9f9ecc3e1c46b))
* add transactionalSideEffects option for side effect rollback on failure ([6593d43](https://github.com/xns1997/FormFlow-Studio/commit/6593d43f6d268f5d3db6197987d66e1cb1a5e6f9))
* AG Grid dark theme + Playwright E2E tests ([126f696](https://github.com/xns1997/FormFlow-Studio/commit/126f696a528332e65359c4fad75d54b1609b66d0))
* complete all 18 TODO items - v0.3.0 ([4d762b8](https://github.com/xns1997/FormFlow-Studio/commit/4d762b857d90eaafc7946e1c72da55281f37c432)), closes [#4](https://github.com/xns1997/FormFlow-Studio/issues/4) [#7](https://github.com/xns1997/FormFlow-Studio/issues/7) [#9](https://github.com/xns1997/FormFlow-Studio/issues/9) [#13](https://github.com/xns1997/FormFlow-Studio/issues/13) [#16](https://github.com/xns1997/FormFlow-Studio/issues/16) [#18](https://github.com/xns1997/FormFlow-Studio/issues/18) [#8](https://github.com/xns1997/FormFlow-Studio/issues/8)
* complete form orchestration framework ([a2dbbb5](https://github.com/xns1997/FormFlow-Studio/commit/a2dbbb5df013c30d25820bc2f6d9a3a61ac0e937))
* debug mode + result persistence + error context + version history + minimap colors ([2505895](https://github.com/xns1997/FormFlow-Studio/commit/25058955e153ffc5bd88c283df173c4d0fce4fc6)), closes [#4](https://github.com/xns1997/FormFlow-Studio/issues/4) [#7](https://github.com/xns1997/FormFlow-Studio/issues/7) [#8](https://github.com/xns1997/FormFlow-Studio/issues/8) [#9](https://github.com/xns1997/FormFlow-Studio/issues/9) [#11](https://github.com/xns1997/FormFlow-Studio/issues/11) [#12](https://github.com/xns1997/FormFlow-Studio/issues/12) [#13](https://github.com/xns1997/FormFlow-Studio/issues/13) [#16](https://github.com/xns1997/FormFlow-Studio/issues/16) [#17](https://github.com/xns1997/FormFlow-Studio/issues/17) [#18](https://github.com/xns1997/FormFlow-Studio/issues/18)
* **flowEngine:** add timeoutMs and nodeTimeoutMs options ([589effe](https://github.com/xns1997/FormFlow-Studio/commit/589effe008c2ce2cb449c850ee1e3470ea719841))
* v0.2.0 - 全部节点真实可运行 + Range Selector Excel级 + 表单预览可交互 + Monaco浅色主题 ([77df53d](https://github.com/xns1997/FormFlow-Studio/commit/77df53dee784c406c27baea23fb511e5d040ff0b))
* v0.6.0 - UI 代码结构重构 + 全局文档系统 ([40681ae](https://github.com/xns1997/FormFlow-Studio/commit/40681aeabdbee370d51d26c789d9870af190a03a))
* v0.7.0 - 工作流I/O节点 + CRUD节点包 + 输入端口增强 + 阀门选型示例 ([4dced51](https://github.com/xns1997/FormFlow-Studio/commit/4dced517460a161ddb97c041e88c06d39c3b9eed))
* v0.7.1 - 设计器画布修复 + 文档样式优化 + 上海餐饮企业分析示例 ([72067ed](https://github.com/xns1997/FormFlow-Studio/commit/72067ed3a0285a71affe891131ccde0ad47dc329))

# Changelog

## [Unreleased]

### LLM Provider 与知识检索
- 新增独立 Python LLM Provider，提供 HTTP/gRPC、OpenAI 兼容适配、插件加载、运行记录与可选 PostgreSQL checkpoint
- 新增模型 Provider、Profile、Agent 与规则智能体配置管理，敏感密钥使用 AES-256-GCM 加密保存，并支持服务端健康检查
- 新增 PostgreSQL/pgvector 初始化、分块向量写入和带租户/项目过滤的相似度检索；向量扩展或索引不可用时提供明确降级状态
- Docker Compose 增加 PostgreSQL 与 LLM Provider 服务、健康检查和本地开发环境变量示例

### 七领域 MCP（破坏性升级）
- 将统一 MCP 替换为 `project`、`data`、`form`、`workflow`、`behavior`、`quality`、`delivery` 七个专职端点；stdio 启动必须指定角色
- 原 `/mcp`、`/api/ai/tools` 和无角色调用接口返回 410；新增角色化 MCP 与 HTTP 工具目录
- 移除跨领域 `project.apply_patch`，新增 `release.update`，并将项目智能体升级为协调者串行派发七类专家
- 统筹智能体新增显式 Plan/Execute 模式：先生成方案、验收、假设与风险，确认后才允许专职 MCP 执行
- 项目智能体执行过程统一封装为实时进度卡片，展示工具调用、领域校验、revision 交接、失败原因和破坏性确认状态

### 数据准备与安全写回
- 数据预览统一使用服务端搜索、筛选、排序和分页，增加 Key 定位、筛选标签与完整查询结果导出
- 新增稳定 rowKey、数据版本冲突检查和跨页批量新增/修改/删除；保存前校验字段类型、空主键和重复组合主键
- 数据准备页增加分组工具栏、未保存修改离开保护与对应 E2E 覆盖

### 低门槛表单开发
- 新增“从数据生成表单”向导，支持录入、查询修改、审批、详情、统计五种用途，并自动生成字段控件、统一绑定、分组/分页、保存流程和重置行为
- 支持把数据字段拖入设计器并自动推荐控件、生成选项和建立绑定，也可按数据表一键补齐缺失字段
- 属性面板改为任务式导航，增加就地规则配置、受控行为 DSL、中文业务语句转换、自然语言预览和安全表达式
- 新增可见方法库、开发任务总览、自动测试样例、即时诊断/修复、发布门禁与低门槛开发体验埋点

### 高阶流程能力
- 新增 10 个版本化宏节点，覆盖表单保存/校验/查询回填、级联与条件状态、派生字段、主数据关联、字段映射、匹配分支和错误补偿
- 新增 5 个流程配方，覆盖查询回填、校验保存、导入清洗、审批归档和 API 映射更新
- 流程画布增加配方插入、端口映射、节点复制、提取子流程和命令面板
- 节点包总数更新为 216，其中包含 79 个 SheetJS 方法节点

### 配置与控件同步
- 建立 27 类表单控件的 `propertyContract` 运行时契约，Schema 和默认属性均必须明确归属于渲染、校验、绑定、表达式、几何或元数据用途
- 设计画布、预览画布和 `FormRenderer` 共用控件属性归一化与 Ant Design 参数映射，修复输入、选择、开关、评分、按钮、标签页、分割线和表格等控件的部分属性只存储不生效问题
- 动态必填、行为必填与静态校验规则统一合并；表达式运行失败时保留上次有效值并输出调试诊断
- 表单宽高和通用尺寸改为几何属性事务，不再写入无效 `props`，支持单步撤销、画布同步和自动保存

### 统一数据绑定
- 新增可序列化 `DataBindingConfig`，统一表单字段、范围和按键定位的表格单元格数据源
- 支持 `dataToUi`、`uiToData`、`twoWay` 三种方向以及 `auto`、`firstCell`、`firstRow`、`column`、`table` 五种取值模式
- 兼容优先级固定为有效 `dataBinding` → `tableBinding` → `rangeRef` → 默认值；仅在用户应用新配置时写入新字段，不批量迁移旧 FormFlow v2 项目
- 双向写回在进入数据源前检查方向、字段校验、定位键与唯一性，失败时拒绝写入并保留原配置

### 属性编辑与预览事务
- 复杂属性 Modal 统一执行 `normalize → validate → commit`，取消不修改组件，一次应用只生成一条撤销记录
- 普通输入和属性粘贴统一执行 `PropDef.validation`，无效草稿不再覆盖有效配置
- 预览状态改为按组件 ID 和字段名增量协调：字段改名会迁移值，用户已输入的脏值保留，未编辑字段随默认值或绑定变化刷新

### 工程与测试
- 新增跨平台测试收集脚本，递归执行所有 `.test.ts`，修复之前 shell glob 遗漏测试的问题
- 新增属性契约、数据绑定、表达式依赖、正则 Worker、上传限制、兼容校验和复合样式测试
- 移除历史行业演示项目、生成脚本及大体积 ZIP；保留设备巡检负向项目作为结构、行为、权限和测试覆盖诊断的回归基线
- 游戏数据产品运行时测试改用仓库内的压缩 Mock 夹具，不再依赖开发机临时项目或上传目录
- `.gitignore` 排除模型密钥配置、智能体会话、上传文件、报表、工具导入缓存、Playwright 截图、Python 虚拟环境与字节码
- 截至 2026-07-21，TypeScript 类型检查与生产构建通过；Node 测试 361 通过、2 项 PostgreSQL 环境测试跳过，Python LLM Provider 测试 24 通过、1 项 PostgreSQL 环境测试跳过

## [0.9.0] - 2026-07-13

### 新增
- 新增仓库内置 skill [`formflow-project-editor`](./.codex/skills/formflow-project-editor/)，用于让智能体以紧凑 YAML 创建、编辑、校验和打包 FormFlow v2 项目
- 新增确定性 CLI [`scripts/formflow-project.mjs`](./.codex/skills/formflow-project-editor/scripts/formflow-project.mjs)，支持 `inspect`、`create`、`normalize`、`validate`、`pack` 和 `unpack`
- 新增冻结的 FormFlow v2 引用文档，覆盖作者输入格式、项目结构、规范化规则、引用完整性和节点端口校验
- 新增基于 skill 生成的示例项目 [`projects/skill-demo`](./projects/skill-demo/)，包含销售审批 YAML、CSV 数据、规范化目录与 ZIP 产物

### 校验与兼容性
- `create`/`normalize` 统一输出规范化目录结构、稳定排序和一致的 JSON 缩进，重复执行结果可复现
- 数据导入支持 Excel、CSV 和 JSON，并在生成阶段校验空 key、重复 key、字段推断和显示配置
- `validate` 增加对 schema、稳定 ID、跨文件引用、流程端口连接和项目交付门禁的机器可读结果输出
- 遇到未知字段或插件扩展字段时立即报错并列出路径，避免静默丢失信息

### 修复
- 修复通过 skill 生成项目时对 UTF-8 中文 CSV 的解析问题，确保示例数据和导入场景可稳定通过校验

## [0.8.0] - 2026-07-11

### 流程引擎核心改进

#### 新增执行选项
- **`onNodeFailure`**: 节点失败策略 — `'abort'`(默认，停止流程)、`'skip'`(跳过继续)、`'continue'`(同 skip)
- **`timeoutMs`**: 全局流程超时（毫秒），超时后立即终止流程
- **`nodeTimeoutMs`**: 单节点超时（毫秒），超时后该节点失败
- **`parallel`**: 并行执行选项，无依赖关系的节点同时执行（`Promise.all`）
- **`isolatedScopes`**: 变量作用域隔离，防止同名节点输出互相覆盖
- **`debug`**: 调试模式，debug 事件包含变量快照（输入/输出实际值）
- **`transactionalSideEffects`**: 事务性侧效果，流程失败时自动回滚已收集的侧效果

#### 新增流程控制节点
- **`generic-condition-branch`**: 条件分支节点，根据 JS 表达式路由到 true/false 分支
  - 支持 `value`、`inputs`、`record`、`context` 等表达式变量
  - 输出端口：`result`(boolean)、`trueBranch`(any)、`falseBranch`(any)
- **`generic-for-each`**: 遍历节点，遍历数组中的每个元素
  - 输出端口：`items`(数组)、`currentItem`(当前项)、`index`(索引)、`isLast`(是否最后一项)
- **`generic-call-workflow`**: 调用流程节点，配置子流程 ID 并传递输入数据
  - 属性：`workflowId`(流程 ID)
  - 输出端口：`result`(子流程结果)、`success`(是否成功)

#### 服务端改进
- **Checkpoint 持久化 API**: 新增 `/api/checkpoints` 端点（POST/GET/DELETE），支持服务端存储流程检查点
- **路径安全**: checkpoint ID 参数增加 `sanitizeId` 校验，防止路径遍历攻击

### 行为引擎增强

#### callApi 能力增强
- 支持 POST/PUT/PATCH/DELETE 请求体（`apiBody`）
- 支持 Bearer/API Key 认证（`apiAuthType` + `apiAuthValue`）
- 支持响应回写表单字段（`apiResponseMap`：`{ "responseField": "formField" }`）
- 支持可配置超时（`apiTimeoutMs`）和重试（`apiRetryCount` + 指数退避）

#### 条件求值增加流程上下文
- `ConditionConfig` 新增 `dataSource` 字段（`'form'`/`'flow'`/`'behavior'`）
- `dataSource='flow'` 时通过 `flowOutputField` 读取流程输出
- `dataSource='behavior'` 时通过 `behaviorName` 读取其他行为结果

#### 新增 runWorkflow 动作
- `ActionType` 新增 `'runWorkflow'`
- `ActionConfig` 新增 `workflowId` + `workflowParameters`
- 执行时通过 `context.runWorkflow` 回调调用流程引擎
- 流程输出自动回写表单字段

### 表单-流程-行为联动改进

#### 流程输出自动回写
- 流程执行成功后，自动将 `workflow:export` 的输出字段匹配并回写到表单
- `autoWriteFlowOutput` 选项（默认 `true`），值比对后只对变化的字段触发 `setValue`

#### 可配置执行顺序
- `ExecuteFlowOptions` 新增 `executionOrder` 选项，默认 `['linkage', 'script', 'flow']`
- 用户可自定义执行顺序（如 `['flow', 'linkage', 'script']`）

#### 联动规则 runWorkflow 输出回写
- `formLinkage.ts` 的 `runWorkflow` 动作增加流程输出自动回写表单字段

### 移动端适配
- 新增 `responsive.css` 响应式样式（768px/1024px 断点 + 触摸优化 + 打印样式）

### 安全修复
- 修复 `onNodeFailure: 'abort'` 未实际停止执行的问题（现在会 break 循环）
- 修复 checkpoint API 路径遍历漏洞（`sanitizeId` 校验）

### 工程改进
- 节点总数从 144 增加到 **147** 个
- 所有新选项默认 `undefined`（禁用），完全向后兼容
- TypeScript 类型检查通过，28/28 单元测试通过

---

## [0.7.1] - 2026-07-09

### 设计器画布修复
- 修复画布初始化尺寸为 0x0 的问题（`requestAnimationFrame` + 重试机制）
- `syncGraphSize` 在容器尺寸为 0 时添加 50ms 重试，最多 20 次

### 文档样式优化
- `docs-card-list` 改为 CSS Grid 布局，最小列宽 360px
- `docs-card-title` 改为垂直布局，strong 和 code 各占一行
- `docs-table-row` 添加左边框 hover 指示器和背景色变化
- `docs-table-key` 的 code 和 span 样式优化
- Modal 中卡片列表适配更小空间（minmax 300px）

### 新增示例项目
- `example_shanghai_catering`（上海餐饮企业分析）: 覆盖 16 个区 × 42 个月月度数据 + 预测数据 + 年度汇总
  - 5 个表单：数据录入、数据修改、统计分析、预测分析、年度汇总
  - 4 个工作流：录入、修改、统计分析、预测分析
  - 672 条月度数据 + 96 条预测数据 + 64 条年度汇总

### 节点包更新
- 新增 8 个节点包：behavior-compose-message、behavior-upsert-table-row、generic-array-enrich、generic-array-lookup、generic-choice-input、generic-field-classifier、generic-file-source、generic-record-transform、generic-score-records
- 删除 6 个冗余节点：func-checkbox-input、func-radio-input、func-select-input、generic-boolean-switch、generic-file-picker、generic-number-input、generic-text-input、generic-variable-input、generic-worksheet-select

### 工程改进
- 新增 `ui/src/services/layout/` 自动布局模块
- 新增 `ui/src/services/config/scriptRuntime.ts` 脚本运行时
- 新增 `ui/src/services/data/tableEditor.ts` 表格编辑器
- 新增 `ui/src/components/ComponentDocPlayground.tsx` 组件文档 Playground
- 新增 `ui/src/components/DebugDrawer.tsx` 调试抽屉
- 新增 `ui/src/style/button-system.css` 按钮系统样式
- 服务器端新增 debug 路由和日志服务

---

## [0.7.0] - 2026-07-08

### 工作流 I/O 节点
- **流程导入节点** (`workflow:import`): 流程级统一入口，按自定义字段向下游输出表单触发数据
- **流程导出节点** (`workflow:export`): 流程级统一出口，按自定义字段收集流程结果
- 支持 `port-definition` 属性类型，通过表格或 JSON 编辑端口定义

### CRUD 节点包（6 个新节点）
- `behavior-set-values`: 批量赋值节点，支持对象输入或多键值对配置，一次性设置多个表单字段
- `behavior-query-list`: 列表查询节点，从数据表查询多条记录，支持筛选条件和字段映射
- `behavior-next-sequence`: 自动编号节点，读取数据表最大编号并生成下一个序号
- `behavior-fill-form`: 表单回填节点，根据查询条件加载记录并回填到表单字段
- `behavior-require-fields`: 必填校验节点，检查指定字段是否已填写，未通过则阻止提交
- `behavior-reset-form`: 表单重置节点，清空所有字段值并聚焦首个字段，用于连续录入场景

### 数据处理节点（2 个新节点）
- `generic-criteria-filter`: 多条件筛选节点，支持 `contains/equals/gt/lt/gte/lte/startsWith/endsWith/isEmpty/isNotEmpty` 等操作符，多个条件可选 AND/OR 组合
- `generic-pick-record`: TopN 记录选取节点，支持升序/降序排序并取前 N 条记录

### 输入端口增强
- **多连接支持**: 输入端口可接收多条连接，通过 `__inputSelections` 选择使用哪条连接的数据
- **输入覆盖** (`__inputOverrides`): 可直接在节点属性中配置输入值，无需连接上游节点
- **项目数据表绑定**: 支持从项目数据表直接绑定到节点输入端口，自动提取表头和预览数据
- 去重逻辑：连接边自动去重，防止重复连接
- 输入收集逻辑重构：按端口分组处理，支持边选择和属性覆盖优先级

### 新增示例项目
- `example_valve_selection_v2`（阀门二代选型）: 使用高阶推荐节点实现"多条件筛选 + 候选选取 + 批量回填"的选型推荐流程
- `example_valve_selection_v3`（阀门三代选型）: 按业务阶段重构为"受理 → 技术画像 → 候选生成 → 评分排序 → 提案确认 → 案例归档"的多流程样板

### 工程改进
- **统一初始化脚本**: 新增 `scripts/init-env.sh` (macOS/Linux) 和 `scripts/init-env.ps1` (Windows)，统一管理 Node、pnpm、Python venv 和依赖安装
- **PortTableEditor 增强**: 支持表格/JSON 双模式编辑，新增端口描述字段
- 节点总数从 134 增加到 **144** 个
- 示例生成脚本重构：提取 `workflowNode`、`workflowEdge`、`portDefs` 等工具函数，支持更复杂的示例场景
- 所有示例项目的工作流数据更新，集成新节点

### 新增文件
- `ui/nodes/behavior-set-values/schema.json` — 批量赋值节点
- `ui/nodes/behavior-query-list/schema.json` — 列表查询节点
- `ui/nodes/behavior-next-sequence/schema.json` — 自动编号节点
- `ui/nodes/behavior-fill-form/schema.json` — 表单回填节点
- `ui/nodes/behavior-require-fields/schema.json` — 必填校验节点
- `ui/nodes/behavior-reset-form/schema.json` — 表单重置节点
- `ui/nodes/generic-criteria-filter/schema.json` — 多条件筛选节点
- `ui/nodes/generic-pick-record/schema.json` — TopN 记录选取节点
- `ui/src/services/engine/crudHelpers.ts` — CRUD 节点公共辅助函数
- `ui/src/services/engine/workflowIo.ts` — 工作流 I/O 脚手架生成
- `scripts/init-env.sh` — macOS/Linux 初始化脚本
- `scripts/init-env.ps1` — Windows 初始化脚本
- `projects/data/example_valve_selection_v2.formflow/` — 阀门二代选型项目
- `projects/data/example_valve_selection_v3.formflow/` — 阀门三代选型项目

---

## [0.6.0] - 2026-07-07

### UI 代码结构重构
- **services/ 目录分组**: 55 个文件按功能域归入 5 个子目录：`engine/`(流程/行为引擎)、`io/`(数据读写/API)、`display/`(展示/编辑辅助)、`data/`(数据处理)、`config/`(配置/类型/模板)
- **pages/ 目录归位**: 16 个页面组件移入 `home/`、`editor/`、`doc/` 子目录，消除平铺结构
- **designer/ 大文件拆分**: `PropertyPanel.tsx`(1884行) 拆为 5 个子组件；`useDesigner.tsx`(1117行) 拆为 5 个 hooks + utils
- **behaviorDocs.ts 拆分**: 931 行拆为 `types.ts`、`shared.ts`、`event-docs-script.ts`、`event-docs-control.ts`、`topic-docs.ts`
- **CSS 文件拆分**: `designer.css`(3031行)→10 文件、`form-renderer.css`(1745行)→17 文件、`components.css`(1297行)→5 文件、`pages.css`(1342行)→7 文件
- 清理空目录 `main/`、`preload/`、`renderer/` 和无引用的 `project/context.tsx`

### 文档系统增强
- **模糊搜索**: 多关键词空格分隔、加权匹配（eventName > title > tags > category > summary）
- **标签过滤**: 为 31 个事件文档添加 `tags` 字段，支持 pill 形状多选过滤
- **快捷导航**: 详情页增加 `DocSidebar` 目录组件（IntersectionObserver 自动高亮）、面包屑导航、上/下一篇导航
- **全局文档弹窗**: 导航栏「文档」按钮改为打开 `DocModal` 模态框，保留 `/docs` 独立路由
- **补充示例**: 为缺少示例的事件补充实用代码示例
- **样式增强**: 事件卡片化、代码块头部、标签过滤栏、搜索图标、section 分隔线、Modal 内滚动适配

### 全局文档系统
- **文档首页**: 新增 `/docs` 全局文档首页，分区卡片 + 全局搜索 + 热门文档
- **5 大文档分区**: 梗概(概述/快速入门/项目结构)、行为(31事件+3主题)、表单设计(26控件)、流程节点(8分组)、后端(9 API模块)
- **分区页面**: 每个分区支持索引+详情双模式，复用 `SectionPage` 通用组件
- **数据来源**: 表单设计文档从控件注册表提取，流程节点文档从节点注册表提取，后端 API 文档从路由模块提取
- **路由升级**: `/docs`→首页、`/docs/behavior/:slug`→行为详情、`/docs/form-design/:slug`→控件详情、`/docs/flow-nodes/:slug`→节点详情、`/docs/backend/:slug`→API详情

### 右侧面板样式优化
- 全局右侧面板宽度变量缩小：`340-420px` → `280-340px`
- 设计器属性面板统一使用 CSS 变量（移除硬编码 `400-460px`）
- antd 控件最小高度降低：`34px` → `28px`
- 控件圆角缩小：`12px` → `8px`，阴影简化
- 字段间距、输入框内边距、textarea 高度全面收紧

---

## [0.5.0] - 2026-07-06

### 使用模式页面
- 新增独立「使用模式」页面（`/projects/:id/usage`），数据预览 + 表单预览弹窗
- 数据预览：AG Grid 只读表格 + 列详情 + 新增/删除/编辑行 + 保存到后端
- 表单预览：侧边栏表单列表，点击打开大弹窗，内嵌设计器 PreviewCanvas（空间布局、控件可交互）
- 项目列表每个卡片增加「使用模式」入口按钮

### 后端数据 API 改造
- 新增项目作用域数据 API：`POST /api/projects/data/query|add|update|delete`
- 后端直接读写 `.formflow` 包中的 `srcTable[].sheets[].preview` 数据
- `project-package-store.ts` 新增 `getTableSheetData` / `updateTableSheetData` 函数
- 前端 `UsagePage` 和 `DataPreviewPage` 全部切换到新 API

### 表单→工作表同步
- PreviewCanvas 新增防抖同步钩子：表单字段变更时自动写回对应工作表
- 通过 `tableBinding`（tableId/sheetName/keyField/keyValue/column）定位目标单元格
- 500ms 防抖批量提交，调用 `persistProject` 持久化到 `.formflow` 包

### 表单设计器优化
- 工具栏新增表单切换下拉菜单，可直接切换当前编辑的表单
- 切换表单时先清空画布再加载新设计（`clearDesign` 方法）
- 控件配置面板性能优化：`SchemaField` 使用 `React.memo`，`updateProp` / `currentProps` / `tables` 等全部 `useMemo` / `useCallback` 稳定化，避免单字段修改触发整体重渲染

### 自定义 JS 流程节点
- 新增 `generic-custom-js` 节点包：自定义输入/输出端口 + Monaco 代码编辑器
- 端口定义使用表格化 UI（PortTableEditor），支持添加/删除行、名称/标签/类型配置
- 代码编辑器使用 Monaco，支持全屏、语法高亮、行号
- CanvasPage 新增 `port-definition` 和 `code` 属性类型渲染

### 日期选择器修复
- DatePicker 隐藏原生 input 移除 `pointerEvents: 'none'`，`showPicker()` 可正常工作
- `onInput` 全部改为 `onChange`（React 标准事件）
- DatePicker / DateRange / TimePicker 统一修复

### 项目列表视觉优化
- 卡片封面改为 Mesh Gradient（多层 radial-gradient + 椭圆形色块 + rgba 半透明融合）
- 移除 emoji 图标，卡片封面为纯渐变色带
- 8 组低饱和度清爽配色

### 示例项目修复
- `generate_industry_examples.ts` 的 `writeBackFieldMap` 从 `$form.字段名` 修正为 `字段名`
- 重新生成 `example_employee_mgmt` / `example_student_info` / `example_check_valve_selection` / `example_renewable_generation`

### 移除
- 删除 `TestPage.tsx`（762 行），功能已整合到使用模式页面
- 移除 `/workspace/test` 路由

---

## [0.4.0] - 2026-07-03

### FormFlow v2 项目架构
- 项目持久化从单文件 `<id>.json` 改为 `projects/data/<id>.formflow/` 目录包
- `project.json` 使用 `kind: formflow-project` 与 `formatVersion: 2` 进行严格识别，不再接受旧项目 JSON
- 表单、数据源、流程、行为和输出分别存入独立目录/文件，后端读取时统一组装为运行时项目模型
- 项目创建、更新、复制、删除及流程/行为 API 全部接入目录包存储层
- 前端移除旧 JSON 导入导出；磁盘目录使用 `.formflow`，分发包使用 `.zip`，并通过包内 `project.json` 严格识别
- 删除原有项目数据，新增“销售订单审批”完整 v2 示例及可导入 ZIP

### 仓库目录重构
- 前端统一迁入 `ui/`，包含应用源码、节点包、Vite 配置、TypeScript 配置和 Playwright 测试
- Express 后端整理为 `server/src/`，运行数据集中到 `server/data/`
- Python 数据分析与 ML 能力整理为 `python-service/`，源码与环境安装文件分离
- 示例项目和服务端项目持久化数据集中到 `projects/` 与 `projects/data/`
- 新增 `server/src/config/paths.ts`，统一管理仓库、服务数据、项目和 Python 服务路径
- 更新开发、构建、测试、E2E 和服务启动命令以适配新结构

### Vite 8 与节点包自动发现
- 升级到 Vite 8.1 和 `@vitejs/plugin-react` 6，构建配置切换到 `build.rolldownOptions`
- 使用 `import.meta.glob` 按目录约定自动发现节点 schema 和执行器，移除注册表中的手写节点目录清单
- 提炼节点 ID 标准化、schema 转换、执行器加载等通用方法
- 节点执行器改为动态导入，生产构建按 `assets/nodes/<节点包>-<hash>.js` 独立分块
- 自动注册表覆盖 133 个唯一节点；验证 136 个节点执行入口均有对应独立 chunk

### 工程质量
- 新增节点包发现测试并更新目录感知型注册表测试
- 补齐 `@playwright/test` 开发依赖和 `test:e2e` 命令
- 更新 E2E 路由断言和可访问性定位器，5 项浏览器流程全部通过
- 当前验证基线：95 项单元测试、5 项 E2E、TypeScript 类型检查、Vite 生产构建、后端 API 冒烟测试和 Python 语法检查

---

## [0.3.0] - 2026-07-01

### 交互体验优化 — 降低填表感
- **智能行切换器**: 可搜索下拉行选择器，显示前 3 列摘要，支持关键词模糊搜索，↑↓ 快捷键导航，行进度条
- **自动聚焦与键盘流**: 行切换后自动聚焦首个可编辑字段，Enter 跳下一字段，Shift+Enter 跳上一字段，Ctrl+Enter 提交，底部快捷键提示条
- **即时校验与引导**: 必填项进度条（3/7），字段 blur 后内联校验，校验通过绿色对勾动画，数字字段范围提示
- **情感化反馈**: 提交成功 toast 通知，dirty 字段左侧橙色竖条标记，变更数量 badge
- **分步向导模式**: 可编辑字段 > 6 个时自动启用，步骤条导航，slide 过渡动画，上一步/下一步按钮
- **卡片式布局**: layout="card" 模式，每 4 个字段自动分组为圆角卡片，带阴影和 hover 效果

### 行为定义系统完善
- **补全动作执行器**: 新增 setRequired, setOptional, switchTab, submitData, callApi, refreshData, navigate 7 个动作
- **行为模板库**: 14 个预置模板（联动/计算/校验/查询/提交/UI），一键插入
- **可视化规则构建器**: 触发器/条件/动作 UI，与代码双向同步，自然语言预览
- **行为测试与调试**: 测试面板，模拟数据输入，运行测试，执行日志展示
- **行为导入导出**: JSON 格式导入/导出/下载，支持批量操作

### 行为事件扩展（12 个新事件）
- `onFormReady`: 表单完全加载就绪后触发
- `onFormReset`: 表单重置时触发
- `onBeforeSubmit`: 提交前触发（可拦截）
- `onFieldKeyDown`: 字段内按键时触发
- `onFieldPaste`: 粘贴内容到字段时触发
- `onFieldClear`: 清空字段时触发
- `onRowAdd`: 新增数据行时触发
- `onRowDelete`: 删除数据行时触发
- `onRowSelect`: 选择数据行时触发
- `onDataImport`: 数据导入时触发
- `onDataExport`: 数据导出时触发
- `onValueChange`: 任意字段值变化时触发

### 新增文件
- `src/services/behaviorTemplates.ts` — 行为模板库
- `src/services/behaviorIO.ts` — 行为导入导出服务
- `src/components/RuleBuilder.tsx` — 可视化规则构建器
- `src/components/BehaviorTestPanel.tsx` — 行为测试面板

### 改动文件
- `src/services/behaviorEngine.ts` — TriggerType 扩展到 24 个，补全 7 个动作执行器
- `src/pages/TestPage.tsx` — RowSwitcher 组件、toast、键盘快捷键、新事件触发器
- `src/pages/BehaviorPage.tsx` — 模板按钮、导入导出、可视化/代码模式切换、测试面板
- `src/components/FormRenderer.tsx` — autoFocus、wizardMode、layout、onKeyDown/onPaste/onClear
- `src/style/form-renderer.css` — RowSwitcher、toast、wizard、card、键盘提示条样式

---

## [0.2.0] - 2026-06-30

### 全部节点执行器真实可运行
- **133 个节点**全部有真实执行逻辑，无 stub
- `generic:database-query`: fetch API 调用 + SQL 解析回退（SELECT/WHERE/LIMIT 对项目数据查询）
- `generic:websocket`: 真实 WebSocket 连接配置 + 发送/断开状态管理
- `generic:pdf-report`: HTML 报告生成 + 浏览器下载/打印
- `generic:email-send`: mailto: 链接打开 + SMTP 配置提示
- `func-form-validate`: 完整规则引擎（required/minLength/maxLength/min/max/pattern/email/phone）
- `func-apply-style`: 真实样式应用到 XLSX 单元格
- `func-conditional-format`: 条件过滤（contains/equals/gt/lt/gte/lte/isEmpty/isNotEmpty）
- `func-data-validation`: 校验逻辑（list/whole/decimal/date/textLength）
- `func-add-comment`: 批注写入 XLSX
- `func-merge-cells`: 真实合并单元格
- `func-find-replace`: 真实查找替换 + 计数
- `func-remove-duplicates`: 真实去重
- `func-create-chart`: SVG 图表生成（bar/pie/line）
- `func-sheet-operation`: add/delete/rename/copy 工作表
- `func-copy-range`: 真实范围复制
- `func-protect-sheet/workbook`: 密码保护配置

### Range Selector Excel 级增强
- **Name Box**: 显示/编辑当前选区地址，输入地址跳转（如 B3、D5:H10）
- **Formula Bar**: 显示当前单元格内容或选区摘要
- **键盘导航**: 方向键移动、Shift+方向键扩展、Tab/Enter 切换、Ctrl+A 全选、Home/End
- **拖拽自动滚动**: 拖拽到边缘时自动滚动，速度与距离成正比
- **多区域选择**: Ctrl+拖拽选多个不连续区域
- **超 Z 列号**: colName() 支持 AA, AB, ... ZZ+
- **选区边框**: 绿色选区边框 + 底部拖拽角手柄
- **Active Cell**: 蓝色轮廓高亮当前活动单元格
- **右键菜单**: 选择整行、选择整列、复制单元格地址
- **列宽调整**: 拖拽列边框调整宽度，双击自适应内容

### 表单设计器预览模式
- 预览模式下控件**不可拖拽但可交互**（输入、选择、点击、切换）
- X6 图表禁用平移/缩放/选择/键盘
- CSS `pointer-events` 精确控制：X6 节点不可拖拽，表单元素可交互
- Switch / Rating / Radio / Checkbox 在预览模式下支持点击交互
- Select 控件在预览模式下渲染为真实 `<select>` 元素
- Button 控件在预览模式下显示 pointer cursor

### 表单可填 + 行为引擎触发
- TestPage 导入项目按钮（离线可用）
- 设计器组件名从 `fieldBinding` 映射（非 `props.name`）
- `numberInput` 类型映射修复
- 行为规则事件名自动映射（onFieldChange → fieldChange）
- 脚本沙箱新增 `formData` getter、`setField` alias、`originalData`
- 表单加载后自动触发 fieldChange（让计算规则执行）
- `setProject` / `initProject` 离线兼容（服务器离线不阻塞）

### Monaco 编辑器浅色主题
- 自定义 `formflow-light` 主题（defineTheme API）
- 完整 Suggest Widget 配色（背景/前景/选中行/高亮/描述/状态栏/文档侧栏）
- Hover Widget 样式
- 语法高亮（keyword/purple, string/green, number/blue, comment/gray）
- 对象/数组类型输入自动使用 Monaco
- 输出预览 Modal 原始数据视图使用只读 Monaco

### 输出端口展开弹窗
- 每个 output-port-row 添加展开按钮 (⤢)
- 点击打开 Modal 显示完整数据
- 根据数据类型定制展示（表格 / JSON / HTML / 工作表）

### 连接端口显示来源信息
- 已连接端口显示来源节点名称（← XLSX读取）
- 已运行时显示传入的实际值（绿色背景 monospace）
- 对象/数组显示 JSON 内容

### 滚动修复
- `.canvas-inspector` / `.schema-config` / `.result-box` 添加 `min-height: 0` + `overflow: auto`
- `.output-port-value` 添加 `max-height: 300px`
- 流程节点预览 `onWheel` 停止传播（防止 React Flow 拦截）
- `overscroll-behavior: contain` 防止滚动链
- `touch-action: manipulation` 应用到所有可滚动容器

### 被动事件监听器修复
- TabBar `onWheel` 改为原生 `addEventListener` + `{ passive: true }`
- X6 容器元素添加 `touch-action: manipulation`
- 预览模式 CSS 锁定阻止 X6 底层拖拽

### 示例项目 proj_new
- 2 个数据表：销售记录（20 行 × 6 列）、员工档案（10 行 × 7 列）
- 4 个流程：数据清洗与聚合、回归分析、图表绘制、信息录入与修改
- 1 个表单设计：员工信息录入表单（11 个组件）
- 1 个行为规则：薪资计算脚本（绩效 ≥ 90 奖金 20%，否则 10%）

---

## [0.1.0] - 2026-06-29

### 初始版本
- 数据预览（AG Grid + 字段类型推断）
- 流程编排（节点画布 + 131 节点）
- 表单设计器（14 种控件 + X6 画布）
- 行为定义（脚本编辑器 + 行为引擎）
- 测试运行（表单预览 + 变更记录 + 导出）
- Monaco 代码编辑器
- Range Selector 基础功能
- Express 后端 + Python ML 后端
