import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Modal, { ModalFooter, ModalHeader } from './Modal';

export interface ConfirmOptions {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface InteractionContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  announce: (message: string) => void;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (result: boolean) => void;
}

const InteractionContext = createContext<InteractionContextValue | null>(null);

export function AppInteractionProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const pendingRef = useRef<PendingConfirm | null>(null);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => () => pendingRef.current?.resolve(false), []);

  useEffect(() => {
    const handleTabNavigation = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[role="tab"]') : null;
      const tabList = target?.closest<HTMLElement>('[role="tablist"]');
      if (!target || !tabList) return;
      const tabs = Array.from(tabList.querySelectorAll<HTMLElement>('[role="tab"]'))
        .filter((tab) => tab.getAttribute('aria-disabled') !== 'true' && !tab.hasAttribute('disabled'));
      const currentIndex = tabs.indexOf(target);
      if (currentIndex < 0 || !tabs.length) return;
      const rtl = getComputedStyle(tabList).direction === 'rtl';
      let nextIndex = currentIndex;
      if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabs.length - 1;
      else if (event.key === 'ArrowRight') nextIndex = (currentIndex + (rtl ? -1 : 1) + tabs.length) % tabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (currentIndex + (rtl ? 1 : -1) + tabs.length) % tabs.length;
      else if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabs.length;
      else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      else return;
      event.preventDefault();
      tabs[nextIndex].focus();
      tabs[nextIndex].click();
    };
    document.addEventListener('keydown', handleTabNavigation);
    return () => document.removeEventListener('keydown', handleTabNavigation);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setPending((current) => {
      current?.resolve(false);
      return { ...options, resolve };
    });
  }), []);

  const settle = useCallback((result: boolean) => {
    setPending((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  const announce = useCallback((message: string) => {
    setAnnouncement('');
    window.requestAnimationFrame(() => setAnnouncement(message));
  }, []);

  return (
    <InteractionContext.Provider value={{ confirm, announce }}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      <Modal
        open={Boolean(pending)}
        onClose={() => settle(false)}
        maxWidth={480}
        ariaLabel={pending?.title || '确认操作'}
        dialogRole="alertdialog"
        closeOnBackdrop={false}
        containerClassName="app-confirm-dialog"
      >
        {pending && (
          <>
            <ModalHeader title={pending.title} onClose={() => settle(false)} />
            <div className="modal-body app-confirm-body">
              <p>{pending.message}</p>
              {pending.detail && <small>{pending.detail}</small>}
            </div>
            <ModalFooter>
              <button type="button" className="ui-btn" data-autofocus onClick={() => settle(false)}>
                {pending.cancelLabel || '取消'}
              </button>
              <button
                type="button"
                className={`ui-btn ${pending.destructive ? 'ui-btn-danger' : 'ui-btn-primary'}`}
                onClick={() => settle(true)}
              >
                {pending.confirmLabel || '确认'}
              </button>
            </ModalFooter>
          </>
        )}
      </Modal>
    </InteractionContext.Provider>
  );
}

export function useAppInteraction() {
  const context = useContext(InteractionContext);
  if (!context) throw new Error('useAppInteraction must be used within AppInteractionProvider');
  return context;
}
