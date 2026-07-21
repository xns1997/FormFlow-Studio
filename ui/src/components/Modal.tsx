import React, { createContext, useContext, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const modalStack: symbol[] = [];
const ModalTitleContext = createContext<string | null>(null);

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: string | number;
  maxWidth?: string | number;
  maxHeight?: string | number;
  overlayClassName?: string;
  containerClassName?: string;
  ariaLabel?: string;
  closeOnBackdrop?: boolean;
  dialogRole?: 'dialog' | 'alertdialog';
}

export default function Modal({
  open,
  onClose,
  children,
  width = '90vw',
  maxWidth = 820,
  maxHeight = '85vh',
  overlayClassName,
  containerClassName,
  ariaLabel = '对话框',
  closeOnBackdrop = true,
  dialogRole = 'dialog',
}: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const modalToken = useRef(Symbol('modal'));
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const token = modalToken.current;
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    modalStack.push(token);

    const focusInitialControl = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const preferred = container.querySelector<HTMLElement>('[data-autofocus], [autofocus]');
      const first = preferred || container.querySelector<HTMLElement>(focusableSelector);
      (first || container).focus({ preventScroll: true });
    });

    const handler = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;
      const controls = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.offsetParent !== null && element.getAttribute('aria-hidden') !== 'true');
      if (!controls.length) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.cancelAnimationFrame(focusInitialControl);
      document.removeEventListener('keydown', handler);
      const index = modalStack.lastIndexOf(token);
      if (index >= 0) modalStack.splice(index, 1);
      document.body.style.overflow = modalStack.length ? 'hidden' : previousOverflow;
      if (previousActiveElement?.isConnected) previousActiveElement.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <ModalTitleContext.Provider value={titleId}>
      {createPortal(
        <div
          className={['modal-overlay', overlayClassName].filter(Boolean).join(' ')}
          ref={backdropRef}
          onClick={(e) => { if (closeOnBackdrop && e.target === backdropRef.current) onClose(); }}
        >
          <div
            ref={containerRef}
            className={['modal-container', containerClassName].filter(Boolean).join(' ')}
            style={{ width, maxWidth, maxHeight }}
            role={dialogRole}
            aria-modal="true"
            aria-labelledby={titleId}
            aria-label={ariaLabel}
            tabIndex={-1}
            data-app-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        </div>,
        document.body
      )}
    </ModalTitleContext.Provider>
  );
}

interface ModalHeaderProps {
  title: string;
  onClose: () => void;
}

export function ModalHeader({ title, onClose }: ModalHeaderProps) {
  const titleId = useContext(ModalTitleContext) || undefined;
  return (
    <div className="modal-header">
      <h3 id={titleId}>{title}</h3>
      <button type="button" className="modal-close" onClick={onClose} aria-label={`关闭${title}`}>×</button>
    </div>
  );
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="modal-footer">{children}</div>;
}
