import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import nodemailer from 'nodemailer';
import { serverDataPath } from '../config/paths';
import { broadcastNotification } from './notification-ws';
export type Notification = { id: string; userId?: string; title: string; message: string; level: 'info' | 'success' | 'warning' | 'error'; read: boolean; createdAt: string; link?: string };
const dir = serverDataPath('notifications'); const file = `${dir}/notifications.json`; const settingsFile = `${dir}/settings.json`;
function read<T>(path: string, fallback: T): T { try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback; } catch { return fallback; } }
function write(path: string, value: unknown) { mkdirSync(dir, { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2)); }
export function listNotifications(userId?: string) { return read<Notification[]>(file, []).filter((item) => !userId || !item.userId || item.userId === userId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
export function createNotification(input: Omit<Notification, 'id' | 'read' | 'createdAt'>) { const item: Notification = { ...input, id: `notification_${randomUUID()}`, read: false, createdAt: new Date().toISOString() }; write(file, [...read<Notification[]>(file, []), item].slice(-2000)); broadcastNotification(item); return item; }
export function markNotification(id: string, readState = true) { const items = read<Notification[]>(file, []); const item = items.find((entry) => entry.id === id); if (item) { item.read = readState; write(file, items); } return item; }
export function getNotificationSettings() { return read(settingsFile, { email: false, webhook: false, inApp: true, webhookUrl: '' }); }
export function saveNotificationSettings(value: unknown) { write(settingsFile, value); return value; }
export async function sendNotification(input: { channels: Array<'inApp' | 'email' | 'webhook'>; userId?: string; title: string; message: string; level?: Notification['level']; email?: string; webhookUrl?: string; data?: unknown }) {
  const results: Record<string, unknown> = {};
  if (input.channels.includes('inApp')) results.inApp = createNotification({ userId: input.userId, title: input.title, message: input.message, level: input.level || 'info' });
  if (input.channels.includes('webhook')) { const url = input.webhookUrl || process.env.NOTIFICATION_WEBHOOK_URL; if (!url) throw new Error('缺少 Webhook URL'); const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: input.title, message: input.message, level: input.level, data: input.data }) }); if (!response.ok) throw new Error(`Webhook 发送失败: ${response.status}`); results.webhook = response.status; }
  if (input.channels.includes('email')) { if (!input.email) throw new Error('缺少收件邮箱'); const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined }); results.email = await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: input.email, subject: input.title, text: input.message }); }
  return results;
}
