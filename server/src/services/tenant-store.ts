import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { serverDataPath } from '../config/paths';

export type Tenant = {
  id: string;
  name: string;
  maxProjects: number;
  maxStorageMb: number;
  maxApiCallsPerDay: number;
  createdAt: string;
  updatedAt: string;
};

type TenantQuota = {
  projectId: string;
  storageBytes: number;
  apiCallsToday: number;
  lastResetDate: string;
};

const dir = serverDataPath('tenants');
const tenantsFile = `${dir}/tenants.json`;
const quotaFile = `${dir}/quotas.json`;

function readTenants(): Tenant[] {
  if (!existsSync(tenantsFile)) return [];
  try { return JSON.parse(readFileSync(tenantsFile, 'utf8')); } catch { return []; }
}

function writeTenants(tenants: Tenant[]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(tenantsFile, JSON.stringify(tenants, null, 2));
}

function readQuotas(): TenantQuota[] {
  if (!existsSync(quotaFile)) return [];
  try { return JSON.parse(readFileSync(quotaFile, 'utf8')); } catch { return []; }
}

function writeQuotas(quotas: TenantQuota[]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(quotaFile, JSON.stringify(quotas, null, 2));
}

export function listTenants(): Tenant[] { return readTenants(); }

export function getTenant(id: string): Tenant | undefined {
  return readTenants().find((t) => t.id === id);
}

export function createTenant(input: { name: string; maxProjects?: number; maxStorageMb?: number; maxApiCallsPerDay?: number }): Tenant {
  const tenants = readTenants();
  const tenant: Tenant = {
    id: `tenant_${randomUUID()}`,
    name: input.name,
    maxProjects: input.maxProjects ?? 50,
    maxStorageMb: input.maxStorageMb ?? 10240,
    maxApiCallsPerDay: input.maxApiCallsPerDay ?? 10000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeTenants([...tenants, tenant]);
  return tenant;
}

export function updateTenant(id: string, patch: Partial<Pick<Tenant, 'name' | 'maxProjects' | 'maxStorageMb' | 'maxApiCallsPerDay'>>): Tenant | undefined {
  const tenants = readTenants();
  const index = tenants.findIndex((t) => t.id === id);
  if (index < 0) return undefined;
  tenants[index] = { ...tenants[index], ...patch, updatedAt: new Date().toISOString() };
  writeTenants(tenants);
  return tenants[index];
}

export function deleteTenant(id: string): boolean {
  const tenants = readTenants();
  const filtered = tenants.filter((t) => t.id !== id);
  if (filtered.length === tenants.length) return false;
  writeTenants(filtered);
  return true;
}

export function checkQuota(tenantId: string, projectId: string, storageBytes?: number): { allowed: boolean; reason?: string } {
  const tenant = getTenant(tenantId);
  if (!tenant) return { allowed: true };

  const quotas = readQuotas();
  const today = new Date().toISOString().slice(0, 10);
  let quota = quotas.find((q) => q.projectId === projectId);

  if (!quota) {
    quota = { projectId, storageBytes: 0, apiCallsToday: 0, lastResetDate: today };
    quotas.push(quota);
  }

  if (quota.lastResetDate !== today) {
    quota.apiCallsToday = 0;
    quota.lastResetDate = today;
  }

  quota.apiCallsToday += 1;
  if (storageBytes) quota.storageBytes += storageBytes;

  if (quota.apiCallsToday > tenant.maxApiCallsPerDay) {
    return { allowed: false, reason: 'API 调用次数超过限额' };
  }
  if (quota.storageBytes > tenant.maxStorageMb * 1024 * 1024) {
    return { allowed: false, reason: '存储空间超过限额' };
  }

  writeQuotas(quotas);
  return { allowed: true };
}
