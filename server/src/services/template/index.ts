/**
 * Template operation center barrel export.
 *
 * Split from template-operation-center.ts into shared (types + cross-region
 * helpers) and R1..R5 responsibility modules:
 *
 *   R1: Template Definitions      -> definitions.ts
 *   R2: Feasibility Analysis      -> feasibility.ts
 *   R3: Recommendation            -> recommendation.ts
 *   R4: Code Generation           -> generation.ts
 *   R5: Import/Export/Instance    -> instance.ts
 */

export {
  queryRelationRows,
  validateRelation,
} from './shared';

export type {
  CheckStatus,
  DataRelation,
  EventFallbackReason,
  FeasibilityCheck,
  FeasibilityReport,
  FeasibilityStatus,
  FieldRole,
  GenerationSummary,
  JoinQueryOptions,
  NormalizedField,
  NormalizedFieldType,
  OperationTemplateDefinition,
  TemplateArtifactBundle,
  TemplateBehaviorArtifact,
  TemplateKind,
  TemplateRecommendation,
  TemplateRuleArtifact,
  TemplateSelection,
} from './shared';


export {
  OPERATION_TEMPLATES,
  exportOperationTemplatePackage,
  getOperationTemplate,
  validateImportedOperationTemplate,
} from './definitions';


export {
  analyzeOperationTemplate,
} from './feasibility';


export {
  recommendOperationTemplates,
  suggestDataRelations,
} from './recommendation';

export type {
  RelationSuggestion,
} from './recommendation';


export {
  planOperationTemplate,
} from './generation';

export type {
  GenerationPlan,
} from './generation';


export {
  applyDataRowsTransaction,
  applyOperationPlan,
  deleteTemplateInstanceResources,
  inspectTemplateInstanceDrift,
  regenerateTemplateInstance,
  resourceFingerprint,
} from './instance';

export type {
  DataTransactionOperation,
  DataTransactionResult,
} from './instance';

