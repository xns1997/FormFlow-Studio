# FormFlow Studio — TODO

> 基于 v0.2.0 状态，按优先级排列

---

## P0 · 必须修复

### 1. Monaco Suggest Widget 文字颜色
- **问题**: 用户反馈 suggest 弹框有框但文字白色不可见
- **根因**: Monaco 内部 CSS (`monaco-icon-label`, `.label-name`) 优先级高于自定义 CSS；`defineTheme` 的 `editorSuggestWidget.foreground` 可能未覆盖所有子元素
- **方案**: 
  - 在 `handleMount` 中通过 `instance._themeService` 或 DOM 查询强制注入颜色
  - 或注册 Monaco `ICodeEditorService` 自定义 token colorization
  - 或降级方案：用 `editor.onDidCreateSuggestWidget` 直接操作 DOM

### 2. 测试套件为空
- **问题**: 13 个 `.test.ts` 文件全部报 "No test suite found"
- **方案**: 为核心模块补充测试用例
  - `flowEngine.test.ts` — 流程拓扑排序 + 节点执行
  - `rangeResolver.test.ts` — Range 解析 + 地址转换
  - `behaviorEngine.test.ts` — 规则触发 + 条件判断
  - `scriptSandbox.test.ts` — 沙箱上下文 + setValue/getValue
  - `executor-registry.test.ts` — 注册 + 执行
  - `port-types.test.ts` — 类型检查 + 兼容性

---

## P1 · 重要增强

### 3. 流程执行结果持久化
- 节点执行后 outputs 存在 React state 中，刷新丢失
- 方案: 执行结果写入 `node.data.outputs` 并随项目保存
- 需要: `saveWorkflow` 时包含 outputs

### 4. 表单设计器 → 测试运行数据打通
- 设计器预览模式的表单值不传递到 TestPage
- 方案: 设计器预览模式的 formValues 写入 sharedDataStore
- TestPage 读取并初始化

### 5. 节点执行错误处理增强
- 部分节点执行失败时 error 信息不够详细
- 方案: 每个 executor 添加 try-catch + 上下文信息
- 错误显示在节点上的 `.flow-node-error` 区域

### 6. 流程调试模式
- 逐步执行节点、查看每个节点的输入/输出
- 方案: CanvasPage 添加「单步执行」按钮
- 高亮当前执行节点 + 显示中间结果

### 7. 表单控件事件 → 流程触发完善
- `flowTriggers` 配置已存在但未完整测试
- 方案: 确保每个控件事件都能正确触发绑定的流程
- 添加触发日志到行为面板

---

## P2 · 体验优化

### 8. AG Grid 暗色主题适配
- 当前只有浅色主题
- 方案: 检测系统主题或添加主题切换

### 9. 数据预览大文件优化
- 超过 10000 行的 Excel 加载缓慢
- 方案: 虚拟滚动 + 分页加载 + Web Worker 解析

### 10. 流程画布小地图增强
- MiniMap 节点颜色应匹配 category
- 方案: 自定义 MiniMap nodeColor 回调

### 11. 节点搜索结果排序优化
- 拼音搜索已支持但结果排序可优化
- 方案: 精确匹配 > 前缀匹配 > 包含匹配

### 12. 表单设计器撤销/重做完善
- 当前 undo/redo 基于 X6 History
- 方案: 确保属性面板修改也纳入撤销栈

### 13. 导出功能增强
- 支持导出为 HTML 单文件（嵌入表单 + 数据 + 行为）
- 支持导出为 React 组件代码
- 方案: 新增 `exportToHtml()` 和 `exportToReact()` 

---

## P3 · 技术债

### 14. CSS 模块化收尾
- `src/style.css` 仍存在但未导入（遗留文件）
- 方案: 删除 `src/style.css`

### 15. 重复行为规则
- `behavior.ts` 中 `behavior-set-value`、`behavior-set-visible` 等注册了两次
- 方案: 删除重复注册

### 16. 类型安全增强
- 部分 `as any` 类型断言可收紧
- 方案: 逐步替换为具体类型

### 17. E2E 测试
- 当前无 Playwright 测试用例
- 方案: 为关键流程编写 E2E 测试
  - 导入项目 → 数据预览 → 流程执行 → 表单填写 → 提交

---

## 进度追踪

| # | 任务 | 状态 | 负责 |
|---|------|------|------|
| 1 | Monaco Suggest 文字颜色 | ⬜ 待开始 | |
| 2 | 测试套件补充 | ⬜ 待开始 | |
| 3 | 流程执行结果持久化 | ⬜ 待开始 | |
| 4 | 设计器→测试数据打通 | ⬜ 待开始 | |
| 5 | 节点执行错误处理 | ⬜ 待开始 | |
| 6 | 流程调试模式 | ⬜ 待开始 | |
| 7 | 控件事件→流程触发 | ⬜ 待开始 | |
| 8 | AG Grid 暗色主题 | ⬜ 待开始 | |
| 9 | 大文件优化 | ⬜ 待开始 | |
| 10 | MiniMap 颜色 | ⬜ 待开始 | |
| 11 | 搜索排序优化 | ⬜ 待开始 | |
| 12 | 撤销/重做完善 | ⬜ 待开始 | |
| 13 | 导出功能增强 | ⬜ 待开始 | |
| 14 | CSS 清理 | ⬜ 待开始 | |
| 15 | 重复规则清理 | ⬜ 待开始 | |
| 16 | 类型安全增强 | ⬜ 待开始 | |
| 17 | E2E 测试 | ⬜ 待开始 | |
