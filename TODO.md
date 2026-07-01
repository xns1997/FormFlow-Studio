# FormFlow Studio — TODO

> v0.2.1 状态，按优先级排列

---

## P0 · 必须修复

### ~~1. 测试套件为空~~ ✅ 已解决
- 原因：测试用 `node:test` 编写，但用 `vitest` 运行导致 "No test suite found"
- 正确命令：`npx tsx --test src/**/*.test.ts`
- 65 个测试全部通过（13 个文件）

### ~~2. 重复行为规则清理~~ ✅ 已完成
- 删除了 `behavior.ts` 中 18 个重复的 registerExecutor 调用
- 保留带 `sideEffects` 的版本（更完整）
- 文件从 626 行缩减到 360 行

---

## P1 · 核心功能闭环

### 3. 流程执行结果持久化
- 节点执行后 outputs 存在 React state 中，刷新丢失
- 执行结果写入 `node.data.outputs` 并随 workflow 保存
- `saveWorkflow` 时包含最新 outputs

### 4. 设计器 → 测试运行数据打通
- 设计器预览模式的表单值不传递到 TestPage
- 预览模式 formValues 写入 sharedDataStore
- TestPage 读取并初始化

### 5. 节点执行错误处理增强
- 部分 executor 的 catch 块只返回 `{ error: ... }` 没有上下文
- 每个 executor 的 catch 添加：节点名、输入摘要、属性摘要
- 错误显示在 `.flow-node-error` 区域时可展开查看堆栈

### 6. 流程调试模式
- CanvasPage 添加「单步执行」按钮
- 高亮当前执行节点（黄色边框）
- Inspector 显示当前节点的 inputs / outputs / error
- 支持断点（节点右键 → 设置断点）

### 7. 表单控件事件 → 流程触发完善
- `flowTriggers` 配置已存在但未端到端验证
- 确保 onChange / onBlur / onClick 都能触发绑定的流程
- 触发日志写入行为面板
- 流程执行结果回写到表单字段

---

## P2 · 体验优化

### 8. AG Grid 暗色主题适配
- 检测系统 `prefers-color-scheme` 或添加手动切换
- 同步 Monaco / X6 / AG Grid 三套主题

### 9. 数据预览大文件优化
- 超过 10000 行的 Excel 加载缓慢
- Web Worker 解析 + 虚拟滚动 + 流式分页

### 10. 流程画布小地图增强
- MiniMap 节点颜色匹配 category（generic/blue, behavior/purple, func/orange, ml/green）
- 自定义 `nodeColor` 回调

### 11. 节点搜索排序优化
- 精确匹配 > 前缀匹配 > 包含匹配 > 拼音匹配
- 搜索结果按使用频率加权

### 12. 表单设计器撤销/重做完善
- 属性面板修改纳入 X6 History 撤销栈
- 批量操作（多选移动）作为单次撤销

### 13. 导出功能增强
- 导出为 HTML 单文件（嵌入表单 + 数据 + 行为 + 样式）
- 导出为 React 组件代码（TSX + CSS）
- 导出为 PDF 报告

### 14. 工作流版本管理
- 保存工作流历史版本
- 支持回退到历史版本
- 版本对比 diff

---

## P3 · 技术债

### 15. CSS 遗留清理
- 删除未导入的 `src/style.css`
- 合并重复的 `.suggest-widget` 规则（components.css 中有两处）

### 16. 类型安全增强
- 逐步替换 `as any` 为具体类型
- 关键路径：FlowNodeData、DesignComponent.props、executor context

### 17. E2E 测试
- Playwright 关键流程测试：
  - 导入项目 → 数据预览 → 切换 Sheet
  - 流程画布 → 添加节点 → 连接 → 执行
  - 表单设计器 → 添加控件 → 预览模式交互
  - 测试运行 → 切换行 → 编辑 → 提交

### 18. 国际化准备
- 硬编码中文字符串提取到常量
- 节点 label/description 已有中英文混合，统一策略

---

## 进度追踪

| # | 任务 | 优先级 | 状态 |
|---|------|--------|------|
| 1 | 测试套件验证 | P0 | ✅ |
| 2 | 重复行为规则清理 | P0 | ✅ |
| 3 | 流程结果持久化 | P1 | ⬜ |
| 4 | 设计器→测试打通 | P1 | ⬜ |
| 5 | 错误处理增强 | P1 | ⬜ |
| 6 | 流程调试模式 | P1 | ⬜ |
| 7 | 控件事件→流程触发 | P1 | ⬜ |
| 8 | AG Grid 暗色主题 | P2 | ⬜ |
| 9 | 大文件优化 | P2 | ⬜ |
| 10 | MiniMap 颜色 | P2 | ⬜ |
| 11 | 搜索排序优化 | P2 | ⬜ |
| 12 | 撤销/重做完善 | P2 | ⬜ |
| 13 | 导出功能增强 | P2 | ⬜ |
| 14 | 工作流版本管理 | P2 | ⬜ |
| 15 | CSS 清理 | P3 | ⬜ |
| 16 | 类型安全增强 | P3 | ⬜ |
| 17 | E2E 测试 | P3 | ⬜ |
| 18 | 国际化准备 | P3 | ⬜ |
