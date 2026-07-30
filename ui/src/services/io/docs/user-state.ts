import { request } from '../api';
import type { DocFeedbackEvent, DocUserState } from './catalog';

const STORAGE_KEY = 'formflow.docs.state.v2';
const SEARCH_KEY = 'formflow.docs.search-history.v2';
const cloudMode = ((import.meta as any).env?.VITE_APP_MODE || 'local') === 'cloud';
const emptyState = (): DocUserState => ({ version: 1, favorites: [], recent: [], taskProgress: {}, updatedAt: new Date().toISOString() });

export function readLocalDocState(): DocUserState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return parsed && parsed.version === 1 ? { ...emptyState(), ...parsed } : emptyState();
  } catch { return emptyState(); }
}

export function writeLocalDocState(state: DocUserState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt: state.updatedAt || new Date().toISOString() }));
}

export async function loadDocUserState(): Promise<DocUserState> {
  if (!cloudMode) return readLocalDocState();
  try { return await request<DocUserState>('/docs/state'); } catch { return readLocalDocState(); }
}

export async function saveDocUserState(state: DocUserState): Promise<DocUserState> {
  const next = { ...state, version: Math.max(0, state.version || 0), updatedAt: state.updatedAt || new Date().toISOString() };
  writeLocalDocState(next);
  if (!cloudMode) return next;
  try {
    return await request<DocUserState>('/docs/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
  } catch { return next; }
}

export function recordRecentSearch(query: string) {
  const value = query.trim();
  if (!value) return;
  try {
    const existing = JSON.parse(localStorage.getItem(SEARCH_KEY) || '[]') as string[];
    localStorage.setItem(SEARCH_KEY, JSON.stringify([value, ...existing.filter((item) => item !== value)].slice(0, 8)));
  } catch { /* optional device-only history */ }
}

export function readRecentSearches(): string[] {
  try { return JSON.parse(localStorage.getItem(SEARCH_KEY) || '[]'); } catch { return []; }
}

export async function sendDocEvent(event: DocFeedbackEvent) {
  if (!cloudMode) return;
  const safe = { ...event } as Record<string, unknown>;
  delete safe.query;
  delete safe.projectId;
  try {
    await request('/docs/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(safe) });
  } catch { /* analytics must never interrupt reading */ }
}
