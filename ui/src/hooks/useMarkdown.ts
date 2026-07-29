import { useEffect, useState } from 'react';
import { loadMarkdown, getMarkdown } from '../services/io/docs/markdown-loader';

/**
 * 异步加载 Markdown 内容的 Hook
 * @param filename markdown 文件名（相对于 docs/markdown/），undefined 则返回 undefined
 */
export function useMarkdown(filename: string | undefined): string | undefined {
  const [content, setContent] = useState<string | undefined>(() =>
    filename ? getMarkdown(filename) : undefined,
  );

  useEffect(() => {
    if (!filename) {
      setContent(undefined);
      return;
    }

    // 检查缓存
    const cached = getMarkdown(filename);
    if (cached) {
      setContent(cached);
      return;
    }

    // 异步加载
    let cancelled = false;
    loadMarkdown(filename).then((result) => {
      if (!cancelled) setContent(result);
    });

    return () => { cancelled = true; };
  }, [filename]);

  return content;
}
