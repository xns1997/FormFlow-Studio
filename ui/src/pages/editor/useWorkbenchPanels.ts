import { useCallback, useEffect, useRef, useState } from 'react';

export type WorkbenchLayout = 'wide' | 'medium' | 'compact';
export type WorkbenchDrawer = 'left' | 'right' | null;

const STORAGE_KEY = 'formflow.editor.panels.v1';

export function resolveWorkbenchLayout(width: number): WorkbenchLayout {
  if (width >= 1280) return 'wide';
  if (width >= 1024) return 'medium';
  return 'compact';
}

function readPreference() {
  if (typeof localStorage === 'undefined') return { left: true, right: true };
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { left: value.left !== false, right: value.right !== false };
  } catch {
    return { left: true, right: true };
  }
}

export function useWorkbenchPanels(enabled: boolean) {
  const initialPreference = useRef(readPreference());
  const [layout, setLayout] = useState<WorkbenchLayout>(() => resolveWorkbenchLayout(typeof window === 'undefined' ? 1440 : window.innerWidth));
  const [leftExpanded, setLeftExpanded] = useState(initialPreference.current.left);
  const [rightExpanded, setRightExpanded] = useState(initialPreference.current.right);
  const [activeDrawer, setActiveDrawer] = useState<WorkbenchDrawer>(null);
  const leftTriggerRef = useRef<HTMLButtonElement>(null);
  const rightTriggerRef = useRef<HTMLButtonElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setLayout(resolveWorkbenchLayout(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: leftExpanded, right: rightExpanded })); } catch { /* optional preference */ }
  }, [leftExpanded, rightExpanded]);

  useEffect(() => { setActiveDrawer(null); }, [layout, enabled]);

  const closeDrawer = useCallback((restoreFocus = true) => {
    setActiveDrawer((current) => {
      if (restoreFocus && current) requestAnimationFrame(() => (current === 'left' ? leftTriggerRef : rightTriggerRef).current?.focus());
      return null;
    });
  }, []);

  useEffect(() => {
    if (!activeDrawer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); }
    };
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => {
      const panel = activeDrawer === 'left' ? leftPanelRef.current : rightPanelRef.current;
      panel?.querySelector<HTMLElement>('[data-panel-focus], button:not([disabled]), input:not([disabled])')?.focus();
    });
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeDrawer, closeDrawer]);

  const toggleLeft = useCallback(() => {
    if (layout === 'compact') setActiveDrawer((current) => current === 'left' ? null : 'left');
    else setLeftExpanded((value) => !value);
  }, [layout]);

  const toggleRight = useCallback(() => {
    if (layout === 'wide') setRightExpanded((value) => !value);
    else setActiveDrawer((current) => current === 'right' ? null : 'right');
  }, [layout]);

  return {
    layout, activeDrawer,
    leftOpen: enabled && (layout === 'compact' ? activeDrawer === 'left' : leftExpanded),
    rightOpen: enabled && (layout === 'wide' ? rightExpanded : activeDrawer === 'right'),
    leftIsDrawer: layout === 'compact', rightIsDrawer: layout !== 'wide',
    leftTriggerRef, rightTriggerRef, leftPanelRef, rightPanelRef,
    toggleLeft, toggleRight, closeDrawer,
  };
}
