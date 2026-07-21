import React, { useState, useEffect, useRef, useCallback } from 'react';

interface DocSidebarProps {
  sections: Array<{ id: string; title: string }>;
  className?: string;
}

export function DocSidebar({ sections, className }: DocSidebarProps) {
  const [activeId, setActiveId] = useState<string>('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 }
    );

    elements.forEach((el) => observerRef.current!.observe(el));

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [sections]);

  const getScrollParent = useCallback((): Element | Window => {
    // Find nearest scrollable parent (for modal context) or fallback to window
    const sidebar = document.querySelector('.doc-modal-content, .docs-page-main');
    if (sidebar) return sidebar;
    return window;
  }, []);

  const handleClick = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const scrollParent = getScrollParent();
    if (scrollParent === window) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const container = scrollParent as Element;
      const offset = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 16;
      container.scrollTo({ top: offset, behavior: 'smooth' });
    }
  }, [getScrollParent]);

  const handleScrollToTop = useCallback(() => {
    const scrollParent = getScrollParent();
    if (scrollParent === window) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      (scrollParent as Element).scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [getScrollParent]);

  return (
    <nav className={['docs-sidebar', className].filter(Boolean).join(' ')}>
      <ul className="docs-sidebar-list">
        {sections.map((section) => (
          <li key={section.id}>
            <button type="button"
              className={`docs-sidebar-item ${activeId === section.id ? 'docs-sidebar-item--active' : ''}`}
              onClick={() => handleClick(section.id)}
            >
              {section.title}
            </button>
          </li>
        ))}
      </ul>
      <button
        className="docs-sidebar-back-top"
        onClick={handleScrollToTop}
        type="button"
      >
        ↑ 回到顶部
      </button>
    </nav>
  );
}
