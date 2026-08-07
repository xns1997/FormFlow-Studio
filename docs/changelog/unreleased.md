# Unreleased

## Schema 编辑器双模式升级（1.17.0）

- 表单设计、流程、数据表配置、项目设置四个实体新增整文档 JSON 编辑模式：左侧列表项标题旁 hover 浮现「JSON」按钮，点击后主工作区切换为 JSON 页签，与可视化编辑双向共存。
- Monaco JSON 编辑器按实体 JSON Schema（`shared/schemas/`）提供结构 lint 与补全；另加语义层校验（控件类型、节点 specId、ID 唯一、连线端点、字段/表引用、主键与排序列等）以 warning 提示。
- JSON 采用草稿 + 结构校验门禁：可视化改动实时推送 JSON；JSON 通过结构校验后才能应用或切回可视化；提供「应用 / 放弃修改」。
- 属性级复杂配置（`ComplexPropertyEditor`、`StructuredSchemaEditor`）源码模式从通用补全升级为 schema 驱动 lint/补全。
- 修复编辑器 URL mode 同步竞态：store 更新触发的过期 `mode=design` 回写不再覆盖刚切换的工作区模式。

## 全局按钮风格统一（1.17.0）

- 以 `button-system.css` 为唯一事实来源：统一基础样式、悬停/激活/焦点/禁用状态、primary/success/danger/subtle/ghost/icon 变体与 xs/sm/lg 尺寸。
- 收编散落按钮类为同一视觉语言的别名：`toolbar-btn`、`agent-btn`、`behavior-toolbar-btn`、`unified-add-btn`、`lg-btn`、`onboarding-btn`、`card-mode-btn`、`btn-primary/btn-secondary` 与上下文 `button.primary`。
- 删除 8 个 CSS 文件中重复的按钮定义，修复运行时表单提交/重置按钮无样式、卡片操作按钮字重 550、`button { font: inherit }` 压过按钮系统字号字重等不一致。
- Ant Design 按钮对齐全局语言（字重 600、圆角、主按钮渐变）。

## 全样式/交互/动效统一规范（1.17.0）

- 新增 [docs/design-system.md](../design-system.md)：设计令牌、交互状态、动效阶梯、组件配方与校验命令的唯一规范来源。
- 动效令牌（时长/缓动/spring）迁入 `variables.css` 单一归属；`--duration-fast` 对齐全应用事实标准 0.15s，新增 `--ease-linear`。
- 全量清理 transition/animation 中的裸时长与裸缓动（约 430 处）改引令牌；删除 6 组重复 `@keyframes`（modal-*/dropdown-*/spin 以 `animations-enhanced.css` 为准）。
- 新增 `controls-base.css`：裸 input/select/textarea 统一外观、聚焦光圈与禁用态，覆盖全应用 150+ 裸输入控件。

## 交互动效补齐（1.17.0）

- 工作区模式切换：中间内容区按 `editMode` 复用 `page-fade-in` 淡入，复用既有关键帧接线，消除硬切。
- 项目智能体抽屉：进入 300ms `--spring-snappy`（translateY+scale 从触发侧长出）、退场 200ms，退场播完再卸载；内部 `agent-menu` 与项目范围卡改为 150ms `popover-in`（`transform-origin: right top`）。
- 流程单步调试节点：`debug-active` 增加一次性 `flow-node-pulse` 光晕脉冲（`--duration-slower`），不再硬跳。
- 设计画布新增控件：挂载 150ms `control-enter`（scale 0.97 + 淡入），只作用于新建控件。
- 调试抽屉展开/收起：宽度/高度 300ms `--ease-out` 过渡 + 内容 150ms 淡入（唯一 width/height 例外，见代码注释）。
- 数据预览筛选芯片：150ms 对称进出场，删除先播离场再移除；筛选编辑弹层从所点芯片 150ms `popover-in`（`transform-origin: left top`）。
- 设计器属性分组与工具箱数据表/Sheet：`interpolate-size` + `::details-content` 150ms `block-size` 过渡（渐进增强，不支持的浏览器保持瞬时）。
- 表单/流程/表配置/项目设置四个 JSON 面板：挂载 150ms `page-fade-in`；JSON/可视化分段开关激活态 150ms 颜色过渡。
- 智能体错误横幅：150ms 淡入 + 4px 下落，仅入场。
- 全部新增动效使用 `variables.css` 动效令牌，`prefers-reduced-motion` 由全局折叠兜底；关键帧保持全局唯一。
