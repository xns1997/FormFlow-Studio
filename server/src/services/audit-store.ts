import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { serverDataPath } from '../config/paths';
export type AuditEntry = { id: string; at: string; userId?: string; username?: string; action: string; resource: string; projectId?: string; detail?: unknown };
const DIR = serverDataPath('audit'); const FILE = `${DIR}/audit.json`; let entries: AuditEntry[] = [];
if (existsSync(FILE)) try { entries = JSON.parse(readFileSync(FILE, 'utf8')); } catch { entries = []; }
export function addAudit(entry: Omit<AuditEntry, 'id' | 'at'>) { const value = { ...entry, id: `audit_${randomUUID()}`, at: new Date().toISOString() }; entries.push(value); entries = entries.slice(-10000); mkdirSync(DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify(entries, null, 2)); return value; }
export function listAudit(filter: { projectId?: string; userId?: string; limit?: number }) { return entries.filter((entry) => (!filter.projectId || entry.projectId === filter.projectId) && (!filter.userId || entry.userId === filter.userId)).slice(-(filter.limit || 200)).reverse(); }
