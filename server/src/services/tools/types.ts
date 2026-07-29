/**
 * Types for tool registration modules.
 */
import type { FormFlowToolDefinition, JsonSchema } from '../tool-shared';
import type { ProjectSourceFile } from '../project-authoring';

/** Function signature for registering a tool definition. */
export type RegisterFn = (definition: Omit<FormFlowToolDefinition, 'outputSchema' | 'ownerRole' | 'sharedReadRoles'> & { outputSchema?: JsonSchema; ownerRole?: string; sharedReadRoles?: string[] }) => void;

/** Commit function that respects the mutation seam. */
export type CommitProjectFn = (project: Record<string, any>, sourceFiles?: ProjectSourceFile[]) => { revision: string };

/** Shared schema and type helpers. */
export interface ToolHelpers {
  schema: (required?: string[], properties?: Record<string, unknown>) => JsonSchema;
  string: JsonSchema;
  array: JsonSchema;
  object: JsonSchema;
  boolean: JsonSchema;
  commitProject: CommitProjectFn;
}
