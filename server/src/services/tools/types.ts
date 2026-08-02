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
  /** 从输入或上下文解析项目 ID。 */
  projectId: (input: Record<string, any>, context: { projectId?: string }) => string;
  /** 按 ID 查找资源，缺失时抛出指定错误码。 */
  findById: (items: any[], id: string, code: string) => any;
  /** 按 ID 覆盖或追加资源，返回该资源。 */
  upsert: (items: any[], item: any) => any;
  /** 按 ID 移除资源，返回是否删除。 */
  remove: (items: any[], id: string) => boolean;
}
