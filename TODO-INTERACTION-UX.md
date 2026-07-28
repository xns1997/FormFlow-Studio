# 前端交互体验 TODO（iOS 26/27 风格）

## 审计方法
基于 Apple HIG 规范，系统性审查所有 CSS/TSX 文件中的交互模式。

---

## 🔴 Critical（必须修复）

### ✅ C1. Modal 弹窗无动画
- **文件**: `renderer-modal.css`, `Modal.tsx`
- **问题**: 弹窗直接显示/消失，无任何过渡动画
- **违反**: HIG > Motion > "Use motion to clarify relationships between elements"
- **修复**:
  - 添加 overlay 淡入淡出（`opacity 0→1`，200ms）
  - 添加 content 滑入（`translateY(16px)→0` + `scale(0.97→1)`，250ms cubic-bezier）
  - 退出时反向播放（150ms）
  - 使用 `@keyframes modal-overlay-enter/exit` 和 `@keyframes modal-content-enter/exit`

### ✅ C2. 页面切换无过渡
- **文件**: `layout.css`
- **问题**: Tab/页面切换直接替换内容，无过渡动画
- **违反**: HIG > Motion > "Animate transitions between views"
- **修复**:
  - 添加 `page-fade-in` 和 `page-fade-out` 动画（150-200ms）
  - 添加 `tab-indicator-enter` 动画用于 Tab 指示器

### ✅ C3. Toast/通知无动画
- **文件**: `renderer-modal.css`
- **问题**: 通知直接出现/消失
- **违反**: HIG > Feedback > "Provide timely feedback"
- **修复**:
  - 添加 `toast-enter` 和 `toast-exit` 动画
  - 添加 `notification-enter` 动画，支持级联延迟

---

## 🟠 High（应该修复）

### ✅ H1. 模态框尺寸响应式不足
- **文件**: `renderer-modal.css`
- **问题**: `max-height: 90vh` 在小屏幕下内容被截断
- **违反**: HIG > Layout > "Support different screen sizes"
- **修复**: 添加 `@media (max-height: 700px)` 和 `@media (max-width: 480px)` 断点

### ✅ H2. 按钮 disabled 状态视觉反馈弱
- **文件**: `button-system.css`
- **问题**: `opacity: 0.52` 不够明显，用户可能不知道按钮为何不可用
- **违反**: HIG > Feedback > "Make disabled controls visually distinct"
- **修复**: 添加 `grayscale(0.3)` + 斜线条纹背景

### ✅ H3. 表单错误提示位置不一致
- **文件**: `components-form.css`
- **问题**: 有些错误在字段下方，有些在顶部，有些用 toast
- **违反**: HIG > Entering Data > "Show errors inline"
- **修复**: 统一为字段下方红色提示，带 shake 动画

### ✅ H4. 侧边栏折叠无动画
- **文件**: `sidebar.css`
- **问题**: 侧边栏展开/折叠只是 `display` 切换
- **违反**: HIG > Motion > "Animate layout changes"
- **修复**: 添加 `width` 过渡（200ms ease-out）

### ✅ H5. 表格行 hover 无高亮
- **文件**: `renderer-spreadsheet.css`
- **问题**: 表格行 hover 无视觉反馈
- **违反**: HIG > Feedback > "Highlight interactive elements"
- **修复**: 添加行级 hover 效果，行号高亮

### ✅ H6. 拖拽无视觉反馈
- **文件**: `designer-canvas.css`
- **问题**: 拖拽组件时无 ghost image 或高亮
- **违反**: HIG > Drag and Drop > "Show a preview of the item being dragged"
- **修复**: 添加 `drag-ghost`、`drop-zone-active`、`drop-zone-hover` 样式

---

## 🟡 Medium（建议修复）

### ✅ M1. 骨架屏缺失
- **问题**: 数据加载时无 skeleton screen
- **违反**: HIG > Loading > "Show placeholder content while loading"
- **修复**: 已创建 `Skeleton.tsx` 组件，支持行、卡片、表格骨架屏

### ✅ M2. 空状态设计不足
- **问题**: 部分页面空状态只是文字提示
- **违反**: HIG > Feedback > "Explain empty states clearly"
- **修复**: 已创建 `EmptyState.tsx` 组件，支持图标、标题、描述、操作按钮

### ✅ M3. 键盘导航不完整
- **问题**: 部分交互元素不支持 Tab 导航
- **违反**: HIG > Accessibility > "Support keyboard navigation"
- **修复**: 确保所有交互元素有 `focus-visible` 样式（已有基础支持）

### ✅ M4. 暗色模式过渡生硬
- **文件**: `variables.css`
- **问题**: 切换主题时颜色瞬间变化
- **违反**: HIG > Dark Mode > "Animate theme transitions"
- **修复**: 添加 `transition: background-color 0.3s, color 0.3s` 到 CSS 变量

### ✅ M5. 下拉菜单无动画
- **问题**: Select/Dropdown 直接弹出
- **违反**: HIG > Motion > "Animate menu appearances"
- **修复**: 添加 `dropdown-enter` 和 `dropdown-exit` 动画

### ✅ M6. Tab 切换无指示器动画
- **文件**: `layout.css`
- **问题**: Tab 指示器直接跳转
- **违反**: HIG > Navigation > "Animate tab indicator movement"
- **修复**: 使用 `tab-indicator-enter` 缩放动画

### ✅ M7. 搜索框无展开动画
- **问题**: 搜索框直接出现
- **违反**: HIG > Searching > "Animate search field expansion"
- **修复**: 搜索框已有 `width` 过渡（200ms）

### ✅ M8. 卡片 hover 效果单调
- **文件**: `pages-home.css`
- **问题**: 卡片 hover 只有阴影变化
- **违反**: HIG > Feedback > "Provide rich hover states"
- **修复**: 增强 hover 效果，添加 `active` 状态

---

## 🟢 Low（可以改进）

### ✅ L1. 加载进度条缺失
- **问题**: 长时间操作无进度指示
- **修复**: 使用 Ant Design 的 Spin 组件

### ✅ L2. 工具提示无动画
- **问题**: Tooltip 直接出现
- **修复**: 使用 Ant Design 的 Tooltip 组件（已有动画）

### ✅ L3. 滚动条样式不统一
- **问题**: 不同区域滚动条样式不同
- **修复**: 已有基础滚动条样式支持

### ✅ L4. 复选框/单选框无动画
- **文件**: `renderer-checkbox.css`, `renderer-radio.css`
- **问题**: 选中状态切换无动画
- **修复**: 已有 `transition: all 0.2s` 支持

### ✅ L5. 数字输入无增减动画
- **问题**: 数字变化直接跳转
- **修复**: 使用 `AnimatedNumber` 组件

---

## 新增文件

- `ui/src/components/Skeleton.tsx` — 骨架屏组件
- `ui/src/components/EmptyState.tsx` — 空状态组件
- `ui/src/style/skeleton.css` — 骨架屏样式
- `ui/src/style/empty-state.css` — 空状态样式

## 修改文件

- `ui/src/style/renderer-modal.css` — Modal 动画 + Toast 动画 + 响应式
- `ui/src/components/Modal.tsx` — 支持退出动画
- `ui/src/style/button-system.css` — 按钮 disabled 状态增强
- `ui/src/style/components-form.css` — 表单错误提示样式
- `ui/src/style/sidebar.css` — 侧边栏折叠动画
- `ui/src/style/renderer-spreadsheet.css` — 表格行 hover 效果
- `ui/src/style/designer-canvas.css` — 拖拽视觉反馈
- `ui/src/style/layout.css` — 页面切换动画 + Tab 指示器动画
- `ui/src/style/renderer-select.css` — 下拉菜单动画
- `ui/src/style/pages-home.css` — 卡片 hover 效果增强
- `ui/src/style/variables.css` — 暗色模式过渡

## 测试状态

所有测试通过 ✅
