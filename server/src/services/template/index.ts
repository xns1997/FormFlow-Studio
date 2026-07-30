/**
 * Template operation center barrel export.
 *
 * The original 4,026-line file has deep internal coupling between its 5 responsibilities.
 * This barrel provides the import path for future incremental decomposition:
 *
 *   R1: Template Definitions  (lines 203-350)   → definitions.ts  [TODO]
 *   R2: Feasibility Analysis  (lines 352-823)   → feasibility.ts  [TODO]
 *   R3: Recommendation        (lines 825-1029)  → recommendation.ts [TODO]
 *   R4: Code Generation       (lines 1031-3823) → generation.ts   [TODO]
 *   R5: Import/Export/Instance (lines 3825-4026) → instance.ts     [TODO]
 *
 * Dependency chain: R1 ← R2 ← R3, R1+R2+R3+R4 ← R5
 */

// Re-export everything from the original file
export {
  OPERATION_TEMPLATES,
  getOperationTemplate,
  validateImportedOperationTemplate,
  exportOperationTemplatePackage,
  analyzeOperationTemplate,
  recommendOperationTemplates,
  suggestDataRelations,
  validateRelation,
  planOperationTemplate,
  applyOperationPlan,
  inspectTemplateInstanceDrift,
  deleteTemplateInstanceResources,
  regenerateTemplateInstance,
  applyDataRowsTransaction,
  queryRelationRows,
  resourceFingerprint,
} from '../template-operation-center';

export type {
  TemplateKind,
  FeasibilityStatus,
  CheckStatus,
  FieldRole,
  NormalizedFieldType,
  NormalizedField,
  DataRelation,
  TemplateSelection,
  FeasibilityCheck,
  FeasibilityReport,
  GenerationSummary,
  EventFallbackReason,
  TemplateRuleArtifact,
  TemplateBehaviorArtifact,
  TemplateArtifactBundle,
  OperationTemplateDefinition,
  TemplateRecommendation,
} from '../template-operation-center';
