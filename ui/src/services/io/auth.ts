import { request } from './api';

export type SessionUser = { id: string; username: string; role: 'admin' | 'editor' | 'viewer' };
export type Session = { token: string; user: SessionUser; tenantId?: string };
const KEY = 'formflow.session';

export function getSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
export function saveSession(session: Session) {
  try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* private browsing or quota exceeded */ }
}
export function clearSession() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
export async function login(username: string, password: string): Promise<Session> {
  const session = await request('/users/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  saveSession(session);
  return session;
}
export async function register(username: string, password: string): Promise<Session> {
  const session = await request('/users/register', { method: 'POST', body: JSON.stringify({ username, password }) });
  saveSession(session);
  return session;
}
