import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type DataPreviewMenuItem = {
  key: string;
  label: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
};

type DataPreviewContextMenuProps = {
  x: number;
  y: number;
  items: DataPreviewMenuItem[];
  onClose: () => void;
};

const MENU_GAP = 6;

export default function DataPreviewContextMenu({ x, y, items, onClose }: DataPreviewContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: x, top: y });
  const [visible, setVisible] = useState(false);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element) return;
    const { offsetWidth, offsetHeight } = element;
    const nextLeft = Math.max(MENU_GAP, Math.min(x, window.innerWidth - offsetWidth - MENU_GAP));
    const nextTop = Math.max(MENU_GAP, Math.min(y, window.innerHeight - offsetHeight - MENU_GAP));
    setPosition({ left: nextLeft, top: nextTop });
    setVisible(true);
  }, [x, y]);

  useEffect(() => {
    const focusFirst = () => {
      const element = menuRef.current;
      const first = element?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])');
      first?.focus();
    };
    const frame = requestAnimationFrame(focusFirst);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current && target && menuRef.current.contains(target)) return;
      onCloseRef.current();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      const element = menuRef.current;
      if (!element) return;
      const items = Array.from(element.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'));
      if (items.length === 0) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(currentIndex + 1) % items.length].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(currentIndex - 1 + items.length) % items.length].focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        items[0].focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        items[items.length - 1].focus();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  const selectItem = useCallback((item: DataPreviewMenuItem) => {
    if (item.disabled) return;
    item.onSelect();
    onCloseRef.current();
  }, []);

  return (
    <div
      ref={menuRef}
      className={`data-preview-context-menu${visible ? ' is-visible' : ''}`}
      role="menu"
      aria-label="数据表操作"
      style={{ left: position.left, top: position.top }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={[
            'data-preview-context-item',
            item.danger ? 'is-danger' : '',
            item.disabled ? 'is-disabled' : '',
            item.separatorBefore ? 'has-separator' : '',
          ].filter(Boolean).join(' ')}
          disabled={item.disabled}
          title={item.disabled && item.disabledReason ? item.disabledReason : undefined}
          aria-disabled={item.disabled || undefined}
          onClick={() => selectItem(item)}
        >
          <span className="data-preview-context-item-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
