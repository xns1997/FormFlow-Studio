import { request } from './api';

export type SessionUser = { id: string; username: string; role: 'admin' | 'editor' | 'viewer' };
export type Session = { token: string; user: SessionUser; tenantId?: string };
const KEY = 'formflow.session';

/** 读取当前会话（localStorage）。 */
export function getSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
/** 保存会话。 */
export function saveSession(session: Session) {
  try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* private browsing or quota exceeded */ }
}
/** 清除会话。 */
export function clearSession() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
/** 登录并保存会话。 */
export async function login(username: string, password: string): Promise<Session> {
  const session = await request('/users/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  saveSession(session);
  return session;
}
/** 注册并自动登录。 */
export async function register(username: string, password: string): Promise<Session> {
  const session = await request('/users/register', { method: 'POST', body: JSON.stringify({ username, password }) });
  saveSession(session);
  return session;
}
