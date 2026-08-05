# TODO：代码清理清单（全面大扫除 · 第 1 阶段）

日期：2026-08-05

范围：ui/src、ui/nodes、server/src、shared、scripts、python-service/src 一手代码（含测试）。
基线：`npm run verify` 全绿（typecheck + 测试 + dsl-gates + build）。

排除项：未提交的在途改动（数据预览/列类型/值比较，约 20 改 + 7 新文件）暂不处理，提交后按同一标准补一轮。

## A 批：无引用文件（建议删除）

| 路径 | 依据 |
| --- | --- |
| `ui/src/components/Animated.tsx` | 全库无任何引用（仅自引用） |
| `ui/src/components/PortVisualization.tsx` | 全库无任何引用 |
| `ui/src/services/data/streamingParser.ts` | 全库无任何引用 |
| `ui/src/services/data/streamingParser.worker.ts` | 仅被 `streamingParser.ts` 引用，随上项一起删 |
| `ui/src/components/DocModal.tsx` | 无引用；`components/doc/DocContent.tsx` 注释确认已取代 DocModal/SectionPage/BehaviorDocsPage |
| `ui/src/i18n/strings.ts` | 无引用（i18n 唯一文件，未接入任何页面） |
| `ui/src/services/io/docs/node-doc-generator.ts` | 无引用工具模块 |

## B 批：未使用 import（约 75 文件 / 95 处，机械清理）

按文件列出（位置：符号）；完整行列号见会话审计输出。

- `server/src/agent-core/enhancements.test.ts` · 2: readFileSync
- `server/src/agent-core/store.ts` · 13: McpRole
- `server/src/routes/ai.ts` · 8: getFormFlowTool、McpRole
- `server/src/routes/history.ts` · 2: readdirSync
- `server/src/routes/ml.ts` · 2: join
- `server/src/services/formflow-tool-registry.test.ts` · 2: mkdirSync、writeFileSync
- `server/src/services/template/definitions.ts` · 1: randomUUID
- `server/src/services/template/feasibility.ts` · 4: parameters
- `server/src/services/template/instance.ts` · 2: randomUUID；6: parameters
- `server/src/services/template/recommendation.ts` · 1: randomUUID
- `server/src/services/tools/form.ts` · 7: lintRuleCode
- `server/src/services/tools/project.ts` · 4: createHash
- `shared/formflow-core/behaviorDsl/referenceSemantics.test.ts` · 4: traceSummary
- `shared/formflow-core/behaviorDsl/staticAnalysis.test.ts` · 5: findCrossRuleCycles
- `shared/formflow-core/behaviorDsl/staticAnalysis.ts` · 5: normalizeReference
- `ui/nodes/executors/behavior.ts` · 1: NodeExecContext
- `ui/nodes/executors/func.ts` · 1: NodeExecContext、NodeExecResult
- `ui/nodes/executors/generic.ts` · 1: NodeExecResult
- `ui/nodes/executors/scenario.ts` · 1: NodeExecContext、NodeExecResult
- `ui/src/components/BehaviorTestPanel.tsx` · 3: React、useRef
- `ui/src/components/ComponentDocPlayground.tsx` · 1: React
- `ui/src/components/ComponentInspector.tsx` · 5: React
- `ui/src/components/ContextHelpPanel.tsx` · 1: React
- `ui/src/components/ConversationSurface.tsx` · 1: React
- `ui/src/components/DashboardGrid.tsx` · 1: useMemo
- `ui/src/components/DataFlowTracer.tsx` · 5: React
- `ui/src/components/DiagnosticPanel.tsx` · 5: React
- `ui/src/components/DocPrevNextNav.tsx` · 1: React
- `ui/src/components/DocRecommendations.tsx` · 1: React
- `ui/src/components/DocSidebar.tsx` · 1: React
- `ui/src/components/DocsCommandPalette.tsx` · 1: React
- `ui/src/components/FlowPreviewCanvas.tsx` · 1: React
- `ui/src/components/HighlightText.tsx` · 1: React
- `ui/src/components/MarkdownContent.tsx` · 1: React
- `ui/src/components/MarkdownRenderer.tsx` · 1: useState
- `ui/src/components/OutputPreviewModal.tsx` · 1: React
- `ui/src/components/ProjectAgentDrawer.tsx` · 1: React；5: buildProjectPath；11: statusLabels
- `ui/src/components/RangeTag.tsx` · 1: React
- `ui/src/components/RuleBuilder.tsx` · 3: React
- `ui/src/components/ShareDialog.tsx` · 2: Input
- `ui/src/components/WorkbenchStatusBar.tsx` · 1: React
- `ui/src/components/doc/DocContent.tsx` · 1: React
- `ui/src/designer/DimMetricField.tsx` · 1: React
- `ui/src/designer/LeftPanel.tsx` · 1: React
- `ui/src/designer/PreviewCanvas.tsx` · 1: React
- `ui/src/designer/TabBar.tsx` · 1: React、useCallback
- `ui/src/designer/Toolbox.tsx` · 1: React
- `ui/src/designer/controls/container.tsx` · 1: React
- `ui/src/designer/controls/input.tsx` · 6: controlText
- `ui/src/designer/controls/select.tsx` · 1: React；5: controlText
- `ui/src/designer/icons.test.tsx` · 3: React
- `ui/src/designer/properties/ComplexPropertyEditor.tsx` · 1: React
- `ui/src/designer/properties/EventScriptEditor.tsx` · 1: React
- `ui/src/designer/properties/FlowTriggerEditor.tsx` · 1: React；2: parseJsonOrNull
- `ui/src/designer/properties/PropertyFieldActions.tsx` · 1: React
- `ui/src/designer/properties/visuals/CollectionPropertyEditors.tsx` · 1: React
- `ui/src/designer/properties/visuals/LogicPropertyEditors.tsx` · 1: React
- `ui/src/designer/properties/visuals/VisualPropertyEditor.tsx` · 1: React
- `ui/src/designer/useDesigner.tsx` · 1: useRef、useState；4: React
- `ui/src/pages/doc/BackendSectionPage.tsx` · 1: React
- `ui/src/pages/doc/BehaviorDocsPage.tsx` · 1: React
- `ui/src/pages/doc/FlowNodeSectionPage.tsx` · 1: React
- `ui/src/pages/doc/FormDesignSectionPage.tsx` · 1: React
- `ui/src/pages/doc/OverviewPage.tsx` · 1: React
- `ui/src/pages/doc/SectionPage.tsx` · 1: React、useCallback
- `ui/src/pages/editor/AnalysisResultsPanel.tsx` · 1: React
- `ui/src/pages/editor/CanvasPage.tsx` · 36: formatCustomJsPortMap
- `ui/src/pages/editor/DataRelationsPanel.tsx` · 1: React；2: Tag
- `ui/src/pages/editor/DataTemplateRecommendationModal.tsx` · 1: React
- `ui/src/pages/editor/FormDesignerPage.tsx` · 1: React
- `ui/src/pages/editor/LegacyProjectRedirectPage.tsx` · 1: React
- `ui/src/pages/editor/ProjectDetailPage.tsx` · 1: React
- `ui/src/pages/editor/ProjectSettingsLayout.tsx` · 1: React
- `ui/src/pages/editor/ProjectWorkspaceTabs.tsx` · 1: React
- `ui/src/pages/editor/SettingsPage.tsx` · 1: React；3: Select
- `ui/src/pages/editor/TemplateDiagnosticPanel.tsx` · 1: React
- `ui/src/pages/editor/TemplateInstancesPanel.tsx` · 1: React
- `ui/src/pages/editor/UsagePage.tsx` · 1: React
- `ui/src/pages/editor/WorkspaceLayout.tsx` · 1: React
- `ui/src/pages/home/AppearanceSection.tsx` · 1: React
- `ui/src/pages/home/Layout.tsx` · 1: React
- `ui/src/pages/home/ProjectsListPage.tsx` · 1: React；21: buildEditorPath
- `ui/src/pages/home/SystemSettingsLayout.tsx` · 1: React
- `ui/src/pages/home/SystemSettingsPage.tsx` · 1: React
- `ui/src/pages/home/WorkflowPreferencesSection.tsx` · 1: React
- `ui/src/services/animation/useAnime.ts` · 15: RefObject；16: stagger
- `ui/src/services/animation/useMicroInteractions.ts` · 7: RefObject；50: prefersReducedMotion
- `ui/src/services/config/customJsNode.ts` · 1: parseJsonOrNull
- `ui/src/services/display/testRunner.ts` · 4: submitForm；5: validateAllFields；6: TriggerType；7: runAllChecks
- `ui/src/services/engine/flowEngine.ts` · 17: extractPortName
- `ui/src/services/engine/formEngine.ts` · 10: getRuntimeComponentType
- `ui/src/services/engine/runtimeDifferential.ts` · 2: BehaviorRule

## C 批：保留待确认（不随本批删除）

- `ui/src/components/EmptyState.tsx`、`Skeleton.tsx`、`TableConfigPanel.tsx`、`PropertyTooltip.tsx`：TODO-INTERACTION-UX / TODO-BUILD-DEBUG-UX 记录为交付物，当前无引用（疑似已被 antd 等价组件取代），删除前需确认。
- `ui/src/components/AiAssistant.tsx`、`ApprovalWorkflowDesigner.tsx`、`CommentThread.tsx`：TODO 记录"已实现"且对应 server 路由存在（ai.ts/approvals.ts/comments.ts），疑似 UI 集成缺口而非死代码，建议排查后另行决定。
- `ui/src/services/display/chartExport.ts`：TODO-P1 #43 标记已完成，当前无引用。
- `server/src/services/tool-schemas.ts`、`field-descriptions.ts`：无引用但含工具 JSON Schema / 参数字段文档数据，建议迁移或归档后再删。
- `test-all-with-inputs.ts`：根目录手动测试脚本，保留。

## 明确保留（非死代码）

- `server/src/mcp-stdio.ts`：`bin/formflow-mcp` 入口。
- `ui/src/vite-env.d.ts`：环境类型声明。

## 性能基线（test-results/）

- 构建体积：ui 主 chunk 9,774 kB（gzip 2,796 kB）；server index 355 kB。
- DSL 验证：`npm run test:dsl` ~0.40s；`npm run test:dsl-gates` ~2.19s。
- 已知构建告警：executor-registry/flowEngine 无效动态导入；xlsx 静态引用拖大主 chunk。

## 待确认

- [x] 用户已确认 A + B 批删除（C 批保留），2026-08-05 执行完成：git rm A 批 7 文件 + B 批未使用 import 清理 → `npm run verify` 全绿 → 单独提交。

执行备注：
- B 批中 `import React from 'react'` 在 `.tsx` 文件中**保留**——tsx 测试/开发运行时按经典 JSX 编译需要 React 在作用域内，tsc 的 `react-jsx` 设置会误报为未使用；实际清理范围为其余未使用 import 与 `.ts` 文件。
