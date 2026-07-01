# FormFlow Studio — TODO

> v0.2.2 状态，按优先级排列

---

## P0 · 必须修复

### ~~1. 测试套件验证~~ ✅ 已解决
- 正确命令：`npx tsx --test src/**/*.test.ts`
- 65 个测试全部通过（13 个文件）

### ~~2. 重复行为规则清理~~ ✅ 已完成
- 删除了 `behavior.ts` 中 18 个重复的 registerExecutor 调用（626→360 行）

---

## P1 · 核心功能闭环

### ~~3. 流程执行结果持久化~~ ✅ 已完成
- `loadWorkflow` 恢复 `outputs` 和 `error` 字段
- `saveWorkflow` 保存完整 node.data 包含执行结果

### 4. 设计器 → 测试运行数据打通
- 设计器预览模式的表单值不传递到 TestPage
- 需要: X6 预览模式收集 formValues → sharedDataStore
- **阻塞**: X6 节点使用静态 render 函数，不是 FormRenderer

### ~~5. 节点执行错误处理增强~~ ✅ 已完成
- 错误信息包含：节点名、specId、错误消息、输入端口列表、配置属性摘要

### ~~6. 流程调试模式~~ ✅ 已完成
- CanvasPage 添加「⏭ 单步」按钮 + 「重置」按钮
- 当前执行节点黄色高亮 (`.flow-node.debug-active`)
- 底部显示已执行节点数
- `topologicalSort` 已导出

### 7. 表单控件事件 → 流程触发完善
- `flowTriggers` 配置已存在但未端到端验证
- 需要: 确保 onChange / onBlur / onClick 都能触发绑定的流程
- 触发日志写入行为面板

---

## P2 · 体验优化

### 8. AG Grid 暗色主题适配
- 检测系统 `prefers-color-scheme` 或添加手动切换
- 同步 Monaco / X6 / AG Grid 三套主题

### 9. 数据预览大文件优化
- 超过 10000 行的 Excel 加载缓慢
- Web Worker 解析 + 虚拟滚动 + 流式分页

### ~~10. 流程画布小地图增强~~ ✅ 已完成
- MiniMap 节点颜色匹配 category：behavior/purple, xlsx-method/blue, generic/orange, scenario/teal

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

### ~~14. 工作流版本管理~~ ✅ 已完成
- `WorkflowFile` 新增 `versions?: WorkflowVersion[]` 字段
- 保存时自动创建版本快照（保留最近 20 个）
- 版本包含 timestamp + label + nodes + edges

---

## P3 · 技术债

### ~~15. CSS 遗留清理~~ ✅ 已完成
- `src/style.css` 已删除（117KB）
- suggest-widget CSS 已整合

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
| 3 | 流程结果持久化 | P1 | ✅ |
| 4 | 设计器→测试打通 | P1 | ⬜ 阻塞 |
| 5 | 错误处理增强 | P1 | ✅ |
| 6 | 流程调试模式 | P1 | ✅ |
| 7 | 控件事件→流程触发 | P1 | ⬜ |
| 8 | AG Grid 暗色主题 | P2 | ⬜ |
| 9 | 大文件优化 | P2 | ⬜ |
| 10 | MiniMap 颜色 | P2 | ✅ |
| 11 | 搜索排序优化 | P2 | ⬜ |
| 12 | 撤销/重做完善 | P2 | ⬜ |
| 13 | 导出功能增强 | P2 | ⬜ |
| 14 | 工作流版本管理 | P2 | ✅ |
| 15 | CSS 清理 | P3 | ✅ |
| 16 | 类型安全增强 | P3 | ⬜ |
| 17 | E2E 测试 | P3 | ⬜ |
| 18 | 国际化准备 | P3 | ⬜ |
