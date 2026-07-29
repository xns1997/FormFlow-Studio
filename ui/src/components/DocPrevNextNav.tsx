import React, { useEffect } from 'react';

interface NavDoc {
  slug: string;
  title: string;
  section: string;
}

interface DocPrevNextNavProps {
  prev: NavDoc | null;
  next: NavDoc | null;
  onNavigate: (slug: string) => void;
}

export default function DocPrevNextNav({ prev, next, onNavigate }: DocPrevNextNavProps) {
  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框内的按键
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowLeft' && prev) {
        e.preventDefault();
        onNavigate(prev.slug);
      } else if (e.key === 'ArrowRight' && next) {
        e.preventDefault();
        onNavigate(next.slug);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prev, next, onNavigate]);

  if (!prev && !next) return null;

  return (
    <nav className="docs-prev-next" aria-label="文档导航">
      {prev ? (
        <button
          type="button"
          className="docs-prev-next-item docs-prev-next-item--prev"
          onClick={() => onNavigate(prev.slug)}
        >
          <span className="docs-prev-next-label">← 上一篇</span>
          <span className="docs-prev-next-title">{prev.title}</span>
          <span className="docs-prev-next-section">{prev.section}</span>
        </button>
      ) : <div />}
      {next ? (
        <button
          type="button"
          className="docs-prev-next-item docs-prev-next-item--next"
          onClick={() => onNavigate(next.slug)}
        >
          <span className="docs-prev-next-label">下一篇 →</span>
          <span className="docs-prev-next-title">{next.title}</span>
          <span className="docs-prev-next-section">{next.section}</span>
        </button>
      ) : <div />}
    </nav>
  );
}

/**
 * 计算相邻文档
 */
export function getAdjacentDocs<T extends { slug: string; title: string }>(
  docs: T[],
  currentSlug: string,
  sectionName: string,
): { prev: NavDoc | null; next: NavDoc | null } {
  const index = docs.findIndex((d) => d.slug === currentSlug);
  if (index === -1) return { prev: null, next: null };

  return {
    prev: index > 0
      ? { slug: docs[index - 1].slug, title: docs[index - 1].title, section: sectionName }
      : null,
    next: index < docs.length - 1
      ? { slug: docs[index + 1].slug, title: docs[index + 1].title, section: sectionName }
      : null,
  };
}
