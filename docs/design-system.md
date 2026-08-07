# FormFlow 统一设计规范（Design System）

> 状态：v1 · 2026-08-07
>
> 本文档是全应用样式、交互与动效的唯一规范来源。新增/修改 UI 时，先读本文档；
> 任何与本文档冲突的实现都视为缺陷。对应代码位置：
>
> - 设计令牌：`ui/src/style/variables.css`
> - 按钮组件：`ui/src/style/button-system.css`
> - 动效库：`ui/src/style/animations-enhanced.css`（仅动画关键帧与过渡应用层）
> - 表单控件基底：`ui/src/style/controls-base.css`

---

## 1. 设计令牌（Design Tokens）

所有可复用的样式值都必须定义为 CSS 变量，且**只允许在 `variables.css` 的 `:root` 中定义**。
其他文件一律通过 `var(--token)` 引用；不得在组件 CSS 中硬编码颜色、圆角、间距、阴影或动效参数。

### 1.1 颜色（语义化）

| 用途 | Token |
|------|-------|
| 页面背景 / 面板 / 抬升面板 / 弱面板 / 静音面板 | `--bg`、`--panel`、`--panel-elevated`、`--panel-soft`、`--panel-muted` |
| 玻璃材质（仅功能性浮层） | `--panel-glass`、`--panel-glass-heavy`、`--material-regular`、`--material-thick` |
| 填充 / 悬浮底色 | `--fill`、`--fill-secondary`、`--fill-tertiary`、`--hover-bg`（=`--fill-secondary` 别名） |
| 边框 | `--line`、`--line-strong`、`--border`、`--border-subtle` |
| 文本 | `--text`、`--text-secondary`、`--text-tertiary`、`--muted`（=`--text-secondary` 别名） |
| 品牌主色 | `--accent`、`--accent-hover`、`--accent-soft`、`--accent-line` |
| 语义色 | `--danger`、`--warning`、`--success`、`--scenario`、`--excel`、`--paused`（均配套 `-soft`） |
| 阴影 | `--shadow`、`--shadow-sm`、`--shadow-md`、`--shadow-lg`、`--card-shadow`、`--card-shadow-hover` |

规则：
- 深浅主题只允许在 `:root`、`:root[data-theme="dark"]` 与 `@media (prefers-color-scheme: dark)` 中切换令牌，组件不做主题分支。
- 语义色必须表达含义而非字面颜色：错误用 `--danger`，成功用 `--success`，禁用用透明度而非新颜色。

### 1.2 几何与排版

| 分类 | Token |
|------|-------|
| 圆角 | `--radius-sm: 8px`、`--radius: 10px`、`--radius-md: 12px`、`--radius-lg: 16px`、`--radius-xl: 22px`、`--radius-pill: 999px`（=`--radius-full` 别名） |
| 间距 | `--space-xs: 4px`、`--space-sm: 8px`、`--space-md: 12px`、`--space-lg: 16px`、`--space-xl: 24px`、`--space-2xl: 32px`、`--space-3xl: 48px` |
| 控件高度 | `--control-height-sm: 28px`、`--control-height: 36px`、`--control-height-lg: 44px` |
| 字体 | 系统字体栈（`variables.css` `:root`）、等宽 `--font-mono`；正文 13px，控件 12px，辅助 11px |

### 1.3 层级（z-index）

`--z-dropdown: 100` → `--z-modal: 1400` → `--z-toast: 2000` → `--z-tooltip: 3000`。
弹窗必须覆盖漂浮工作台（项目智能体抽屉 1199）；不得在组件中手写 2000+ 裸值。

### 1.4 动效令牌

时长阶梯与缓动曲线只允许引用以下令牌（定义于 `variables.css`）：

| 时长 | 值 | 适用 |
|------|-----|------|
| `--duration-instant` | 0.1s | 按下回弹、微反馈 |
| `--duration-fast` | 0.15s | 悬停、边框/背景/颜色变化、按钮 |
| `--duration-normal` | 0.3s | 面板展开、卡片悬浮、常规过渡 |
| `--duration-slow` | 0.45s | 大型浮层、页面切换 |
| `--duration-slower` | 0.6s | 长时间强调、加载指示 |

| 缓动 | 值 | 适用 |
|------|-----|------|
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | 交互反馈、进场（默认） |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | 退场 |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | 大范围位移动画 |
| `--ease-linear` | `linear` | 旋转/进度条 |
| `--spring-bounce` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 弹性强调（图标、徽标） |
| `--spring-smooth` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | 平顺弹簧 |
| `--spring-snappy` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | 快捷弹簧 |
| `--spring-gentle` | `cubic-bezier(0.4, 0, 0.2, 1)` | 与 `--ease-in-out` 等价，保留兼容 |

**硬性规则**：`transition:` / `animation:` 中不得出现裸时长（`0.15s`）或裸缓动关键字（`ease`），
一律使用令牌。动画关键帧名全局唯一，命名带模块前缀（如 `agent-*`、`docs-*`），避免重名覆盖。

---

## 2. 交互状态（Interaction States）

所有可交互元素统一四态，除非有明确的可达性理由：

| 状态 | 规范 |
|------|------|
| 默认 | 面板底 + 1px `--line` 边框 + `--radius`；文本 `--text` |
| `:hover:not(:disabled)` | 边框转 `--accent-line`，底色 `--panel-elevated`/`--accent-soft`，文字转 `--accent`；轻抬升 `translateY(-1px)`（按钮） |
| `:active:not(:disabled)` | 回落 `translateY(0)`；按钮可 `scale(0.98)` |
| `:focus-visible` | 统一 `box-shadow: 0 0 0 3px var(--accent-soft)`，不使用 `outline`（历史遗留的 `outline: 2px solid var(--accent)` 应迁移） |
| 行/卡片焦点（补充） | 列表行、卡片、工具项沿用统一硬环 `outline: 2px solid var(--accent)`（含 `outline-offset`），作为“行焦点”范式；控件一律用软光圈 |
| `:disabled` | `opacity: .52`、`cursor: not-allowed`、去色、无阴影；按钮附斜纹遮罩 |

输入控件（`input` / `select` / `textarea`）基底见 `controls-base.css`：
`min-height: var(--control-height)`、1px `--line` 边框、`--radius`、聚焦 `--accent` 边框 +
3px `--accent-soft` 光圈。`prefers-reduced-motion: reduce` 下所有位移/过渡关闭。

---

## 3. 动效规范（Motion）

1. **时长语义化**：悬停/微交互 ≤ `--duration-fast`；浮层/面板 `--duration-normal`；页面级过渡 `--duration-slow`。
2. **缓动语义化**：交互反馈用 `--ease-out`；退场用 `--ease-in`；循环动画用 `--ease-linear`；
   需要活泼手感才用 spring 系列，且只用于非核心内容。
3. **关键帧唯一**：新动画命名 `<模块>-<动作>`（如 `agent-panel-in`、`docs-fade`）；禁止与全局同名。
4. **减少动态**：所有位移/尺寸动画必须能被 `prefers-reduced-motion` 关闭（`transform: none !important; transition-duration: 0.01ms !important`）。

---

## 4. 组件规范（Component Recipes）

### 4.1 按钮

唯一实现：`button-system.css`。类名即语义：
- 基底：`.ui-btn`（无 class 的裸 `<button>` 同款）；兼容别名 `toolbar-btn / agent-btn / behavior-toolbar-btn / unified-add-btn / lg-btn / onboarding-btn / card-mode-btn / btn-primary / btn-secondary / button.primary`。
- 变体：`ui-btn-primary / success / danger / subtle / ghost / icon`。
- 尺寸：`ui-btn-xs / sm / lg`。
- 不再新增按钮类；新代码一律 `.ui-btn + 变体 + 尺寸`。

### 4.2 输入控件

基底 `controls-base.css`，antd 输入类（`ant-input` 等）通过主题 token 对齐；禁止组件内重复定义输入外观。

### 4.3 卡片

`--panel` 底 + `--card-shadow`；悬浮 `--card-shadow-hover` + `translateY(-2px)`；选中/交互用
`--card-border-gradient` 描边。悬浮位移必须响应 reduced-motion。

### 4.4 弹窗 / Toast / 下拉

- 弹窗：遮罩 `modal-overlay-*`，内容 `modal-content-*`（`animations-enhanced.css` 为准）。
- Toast：`toast-slide-in / toast-slide-out`；通知：`notification-pop`。
- 下拉：`dropdown-enter / dropdown-exit`。
- 以上关键帧只允许在 `animations-enhanced.css` 定义一份，禁止在模块内复制同名动画。

### 4.5 加载 / 空状态

- 旋转：`--ease-linear` + `--duration-slower`（如 `spin`）。
- 骨架：`skeleton-pulse`；脉冲：`pulse`；进度条：`progress-fill / progress-indeterminate`。

---

## 5. 校验（Verification）

新增/修改 CSS 后执行以下审计，全部通过才算完成：

```bash
# 1) transition/animation 不得出现裸时长（0.05–0.6s 或 ms 值）或裸缓动关键字
#    （reduced-motion 的 0.01ms 与 >0.6s 的强调脉冲/延迟为有意值，可带注释保留）
rg -n -g '*.css' "transition:[^;]*\b0\.[1-6][0-9]s\b|[0-9]+ms|animation:[^;]*\b0\.[1-6][0-9]s\b|[0-9]+ms" ui/src/style
rg -n -P -g '*.css' "transition:[^;]*(?<![\w-])ease(?![\w-])|animation:[^;]*(?<![\w-])ease(?![\w-])" ui/src/style
# 2) 动画关键帧名全局唯一
rg -o -g '*.css' "@keyframes [a-z0-9_-]+" ui/src/style | sed 's/.*@keyframes //' | sort | uniq -d  # 期望无输出
# 3) 令牌只定义于 variables.css
rg -n -g '*.css' -- "--(duration|ease|spring)-[a-z-]+:" ui/src/style | grep -v variables.css  # 期望无输出
```

另跑 `npm run typecheck && npm test && npm run build` 与关键 e2e（`schema-json-mode`、`flow-canvas`、`data-preview`）。

---

## 6. 落地状态

- [x] 按钮：`button-system.css` 单一实现，8+ 类收编为别名（2026-08-07）。
- [x] 动效令牌迁移至 `variables.css`；transition/animation 裸值全面替换为令牌。
- [x] 重复关键帧清理（`modal-*`、`dropdown-*`、`spin` 以 `animations-enhanced.css` 为准）。
- [x] 输入控件基底 `controls-base.css`（裸 input/select/textarea 统一外观与聚焦态）。
- [x] 本文档作为统一规范。
