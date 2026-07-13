import cron, { type ScheduledTask } from 'node-cron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { serverDataPath } from '../config/paths';
import { enqueueTask, type DagStep } from './task-queue';

export type ScheduleRecord = { id: string; name: string; cron: string; timezone?: string; enabled: boolean; payload: { steps?: DagStep[]; [key: string]: unknown }; createdAt: string; lastRunAt?: string };
const DIR = serverDataPath('tasks');
const FILE = `${DIR}/schedules.json`;
const schedules = new Map<string, ScheduleRecord>();
const running = new Map<string, ScheduledTask>();

function persist() { mkdirSync(DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify([...schedules.values()], null, 2)); }
function activate(schedule: ScheduleRecord) {
  running.get(schedule.id)?.stop(); running.delete(schedule.id);
  if (!schedule.enabled) return;
  if (!cron.validate(schedule.cron)) throw new Error('无效 Cron 表达式');
  running.set(schedule.id, cron.schedule(schedule.cron, async () => {
    schedule.lastRunAt = new Date().toISOString(); persist();
    await enqueueTask(schedule.name, { ...schedule.payload, scheduleId: schedule.id });
  }, { timezone: schedule.timezone }));
}
export function initScheduler() {
  if (existsSync(FILE)) try { for (const item of JSON.parse(readFileSync(FILE, 'utf8')) as ScheduleRecord[]) { schedules.set(item.id, item); activate(item); } } catch (error) { console.error('[scheduler]', error); }
}
export function listSchedules() { return [...schedules.values()]; }
export function saveSchedule(input: Omit<ScheduleRecord, 'id' | 'createdAt'> & { id?: string }) {
  const previous = input.id ? schedules.get(input.id) : undefined;
  const record: ScheduleRecord = { ...input, id: input.id || `schedule_${randomUUID()}`, createdAt: previous?.createdAt || new Date().toISOString() };
  activate(record); schedules.set(record.id, record); persist(); return record;
}
export function deleteSchedule(id: string) { running.get(id)?.stop(); running.delete(id); const removed = schedules.delete(id); persist(); return removed; }
