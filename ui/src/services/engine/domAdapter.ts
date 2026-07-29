/**
 * DOM operations used by the form event executor.
 * Inject a noop adapter for Node/test environments; the browser adapter is the default.
 */
export interface DomAdapter {
  findComponentElement(componentId: string, hostRoot?: HTMLElement | null): Element | null;
  focusElement(container: Element | null): void;
  scrollIntoView(target: Element | null): void;
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function findFocusableElement(container: Element | null): HTMLElement | null {
  if (!container) return null;
  const maybeElement = container as HTMLElement & { focus?: () => void };
  if (typeof maybeElement.focus === 'function') return maybeElement;
  return container.querySelector<HTMLElement>(
    'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
}

function getHostDocument(hostRoot?: HTMLElement | null): Document | null {
  if (hostRoot?.ownerDocument) return hostRoot.ownerDocument;
  if (typeof document !== 'undefined') return document;
  return null;
}

export function createBrowserDomAdapter(hostRoot?: HTMLElement | null): DomAdapter {
  return {
    findComponentElement(componentId: string) {
      const selector = `[data-component-id="${escapeAttributeValue(componentId)}"]`;
      if (hostRoot) return hostRoot.querySelector(selector);
      const hostDocument = getHostDocument(hostRoot);
      if (!hostDocument) return null;
      return hostDocument.querySelector(selector);
    },
    focusElement(container: Element | null) {
      const focusable = findFocusableElement(container);
      if (focusable) focusable.focus();
    },
    scrollIntoView(target: Element | null) {
      if (!target || typeof (target as HTMLElement).scrollIntoView !== 'function') return;
      (target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    },
  };
}

export function createNoopDomAdapter(): DomAdapter {
  return {
    findComponentElement() { return null; },
    focusElement() {},
    scrollIntoView() {},
  };
}
