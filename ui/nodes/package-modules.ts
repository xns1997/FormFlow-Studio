import type { NodeExecutor } from './types';

export type NodeSchemaModule = Record<string, any>;
export type NodeExecutorLoader = () => Promise<NodeExecutor | undefined>;

/**
 * Node packages follow a single convention: nodes/<package>/schema.json and an
 * optional nodes/<package>/index.ts exporting `execute`.
 *
 * Vite 8 requires glob arguments to be literals. The schema is eager because it
 * is registry metadata; executors stay lazy so every node implementation becomes
 * its own production chunk.
 */
export const schemaModules = import.meta.glob<NodeSchemaModule>('./*/schema.json', {
  eager: true,
  import: 'default',
});

const executorModules = import.meta.glob<NodeExecutor>('./*/index.ts', {
  import: 'execute',
});

export const executorLoaders: Record<string, NodeExecutorLoader> = Object.fromEntries(
  Object.entries(executorModules).map(([path, load]) => [path, load as NodeExecutorLoader]),
);
