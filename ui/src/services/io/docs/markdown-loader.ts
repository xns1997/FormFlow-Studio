/**
 * Markdown 文件加载器
 * 使用 Vite 的 import.meta.glob 静态导入所有 .md 文件
 *
 * 来源分两类：
 * - `markdown/*.md`：应用内前端文档（行为规则语法、流程节点分组等）
 * - `docs/*.md`：仓库根目录用户手册（项目创建规范、MCP、Provider 等），
 *   其中的 Mermaid 流程图需要原样渲染进文档平台
 */

const markdownModules = import.meta.glob('./markdown/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

const repoMarkdownModules = import.meta.glob('../../../../../docs/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

const markdownCache = new Map<string, string>();

/**
 * 同步获取已加载的 Markdown 内容
 * 首次调用会触发异步加载，后续从缓存返回
 */
export function getMarkdown(filename: string): string | undefined {
  return markdownCache.get(filename);
}

function resolveLoader(filename: string): (() => Promise<string>) | undefined {
  // 仓库根目录用户手册：docs/xxx.md
  if (filename.startsWith('docs/')) {
    return repoMarkdownModules[`../../../../../${filename}`];
  }
  // 应用内前端文档：markdown/xxx.md
  return markdownModules[`./markdown/${filename}`];
}

/**
 * 异步加载 Markdown 文件并缓存
 */
export async function loadMarkdown(filename: string): Promise<string | undefined> {
  if (markdownCache.has(filename)) {
    return markdownCache.get(filename);
  }

  const loader = resolveLoader(filename);
  if (!loader) {
    console.warn(`[docs] Markdown file not found: ${filename}`);
    return undefined;
  }

  const content = await loader();
  markdownCache.set(filename, content);
  return content;
}

/**
 * 预加载所有 Markdown 文件（可在应用启动时调用）
 */
export async function preloadAllMarkdown(): Promise<void> {
  const entries = [
    ...Object.entries(markdownModules).map(([path, loader]) => [path.replace('./markdown/', ''), loader] as const),
    ...Object.entries(repoMarkdownModules).map(([path, loader]) => [path.replace('../../../../../', ''), loader] as const),
  ];
  await Promise.all(
    entries.map(async ([filename, loader]) => {
      if (!markdownCache.has(filename)) {
        const content = await loader();
        markdownCache.set(filename, content);
      }
    }),
  );
}
