export type AuthoringEventName = 'form_generated' | 'manual_control_added' | 'manual_edge_added' | 'undo' | 'first_run' | 'tests_run' | 'publish_gate_opened';

export interface AuthoringEvent {
  name: AuthoringEventName;
  projectId?: string;
  createdAt: string;
  data: Record<string, unknown>;
}

const STORAGE_KEY = 'formflow:authoring-metrics:v1';

export function readAuthoringEvents(): AuthoringEvent[] {
  if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return [];
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}

export function recordAuthoringEvent(name: AuthoringEventName, data: Record<string, unknown> = {}, projectId?: string) {
  const event: AuthoringEvent = { name, projectId, createdAt: new Date().toISOString(), data };
  if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') localStorage.setItem(STORAGE_KEY, JSON.stringify([...readAuthoringEvents(), event].slice(-500)));
  return event;
}

export function summarizeAuthoringEvents(events: AuthoringEvent[]) {
  return {
    generatedForms: events.filter((item) => item.name === 'form_generated').length,
    manualControls: events.filter((item) => item.name === 'manual_control_added').length,
    manualEdges: events.filter((item) => item.name === 'manual_edge_added').length,
    undoCount: events.filter((item) => item.name === 'undo').length,
    firstRunErrors: events.find((item) => item.name === 'first_run')?.data.errorCount ?? null,
  };
}
