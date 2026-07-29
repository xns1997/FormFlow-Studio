/**
 * Markdown 文件加载器
 * 使用 Vite 的 import.meta.glob 静态导入所有 .md 文件
 */

const markdownModules = import.meta.glob('./markdown/*.md', {
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

/**
 * 异步加载 Markdown 文件并缓存
 */
export async function loadMarkdown(filename: string): Promise<string | undefined> {
  if (markdownCache.has(filename)) {
    return markdownCache.get(filename);
  }

  const path = `./markdown/${filename}`;
  const loader = markdownModules[path];
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
  const entries = Object.entries(markdownModules);
  await Promise.all(
    entries.map(async ([path, loader]) => {
      const filename = path.replace('./markdown/', '');
      if (!markdownCache.has(filename)) {
        const content = await loader();
        markdownCache.set(filename, content);
      }
    }),
  );
}
