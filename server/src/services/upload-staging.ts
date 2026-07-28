import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import XLSX from 'xlsx';

export type StagedSheet = {
  name: string;
  rowCount: number;
  colCount: number;
  headers: string[];
  data: Record<string, unknown>[];
};

export type StagedUpload = {
  id: string;
  originalName: string;
  storedName: string;
  path: string;
  size: number;
  mimeType: string;
  fileType: 'xlsx' | 'xls' | 'csv' | 'json' | 'formflow' | 'zip';
  uploadedAt: string;
  expiresAt: string;
  tenantId?: string;
  uploadedBy?: string;
  sha256: string;
  sheets: StagedSheet[];
};

const STAGING_DIR = join(tmpdir(), 'formflow-upload-staging');
const TTL_MS = 30 * 60 * 1000;
const SUPPORTED = new Set(['xlsx', 'xls', 'csv', 'json']);

function safeFileId(fileId: string) {
  if (!/^file_[A-Za-z0-9_-]+$/.test(fileId)) throw new Error('无效 fileId');
  return fileId;
}

function metadataPath(fileId: string) {
  return join(STAGING_DIR, `${safeFileId(fileId)}.json`);
}

function rowsToSheet(name: string, rows: unknown): StagedSheet {
  const data = Array.isArray(rows)
    ? rows.map((row) => row && typeof row === 'object' && !Array.isArray(row) ? row as Record<string, unknown> : { value: row })
    : [];
  const headers = [...new Set(data.flatMap((row) => Object.keys(row)))];
  return { name, rowCount: data.length, colCount: headers.length, headers, data };
}

export function parseSourceBuffer(buffer: Buffer, originalName: string): { fileType: 'xlsx' | 'xls' | 'csv' | 'json'; sheets: StagedSheet[] } {
  const fileType = extname(originalName).toLowerCase().slice(1) as 'xlsx' | 'xls' | 'csv' | 'json';
  if (!SUPPORTED.has(fileType)) throw new Error('仅支持 XLSX、XLS、CSV、JSON');
  if (fileType === 'json') {
    const parsed = JSON.parse(buffer.toString('utf8'));
    if (Array.isArray(parsed)) return { fileType, sheets: [rowsToSheet('Sheet1', parsed)] };
    if (Array.isArray(parsed?.data) || Array.isArray(parsed?.rows)) {
      return { fileType, sheets: [rowsToSheet('Sheet1', parsed.data || parsed.rows)] };
    }
    const entries = Object.entries(parsed || {}).filter(([, value]) => Array.isArray(value));
    return { fileType, sheets: entries.length ? entries.map(([name, rows]) => rowsToSheet(name, rows)) : [rowsToSheet('Sheet1', [parsed])] };
  }
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  return {
    fileType,
    sheets: workbook.SheetNames.map((name) => rowsToSheet(
      name,
      XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: null }),
    )),
  };
}

export function cleanupExpiredUploads(now = Date.now()): void {
  mkdirSync(STAGING_DIR, { recursive: true });
  for (const name of readdirSync(STAGING_DIR)) {
    const path = join(STAGING_DIR, name);
    try {
      if (statSync(path).mtimeMs + TTL_MS < now) rmSync(path, { force: true });
    } catch {
      rmSync(path, { force: true });
    }
  }
}

export function stageUpload(input: {
  buffer: Buffer;
  originalName: string;
  mimeType?: string;
  tenantId?: string;
  uploadedBy?: string;
}): StagedUpload {
  cleanupExpiredUploads();
  const extension = extname(input.originalName).toLowerCase().slice(1);
  const parsed = extension === 'formflow' || extension === 'zip'
    ? { fileType: extension as 'formflow' | 'zip', sheets: [] }
    : parseSourceBuffer(input.buffer, input.originalName);
  const id = `file_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
  const storedName = `${id}${extname(input.originalName).toLowerCase()}`;
  const path = join(STAGING_DIR, storedName);
  const uploadedAt = new Date().toISOString();
  const record: StagedUpload = {
    id,
    originalName: basename(input.originalName),
    storedName,
    path,
    size: input.buffer.length,
    mimeType: input.mimeType || 'application/octet-stream',
    fileType: parsed.fileType,
    uploadedAt,
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    tenantId: input.tenantId,
    uploadedBy: input.uploadedBy,
    sha256: createHash('sha256').update(input.buffer).digest('hex'),
    sheets: parsed.sheets,
  };
  mkdirSync(STAGING_DIR, { recursive: true });
  writeFileSync(path, input.buffer);
  writeFileSync(metadataPath(id), JSON.stringify(record));
  return record;
}

export function getStagedUpload(fileId: string): StagedUpload | null {
  cleanupExpiredUploads();
  const metaPath = metadataPath(fileId);
  if (!existsSync(metaPath)) return null;
  const record = JSON.parse(readFileSync(metaPath, 'utf8')) as StagedUpload;
  return existsSync(record.path) ? record : null;
}

export function consumeStagedUpload(fileId: string): void {
  const record = getStagedUpload(fileId);
  if (record) rmSync(record.path, { force: true });
  rmSync(metadataPath(fileId), { force: true });
}

export function listStagedUploads(): StagedUpload[] {
  cleanupExpiredUploads();
  return readdirSync(STAGING_DIR)
    .filter((name) => /^file_.+\.json$/.test(name))
    .flatMap((name) => {
      try {
        const record = JSON.parse(readFileSync(join(STAGING_DIR, name), 'utf8')) as StagedUpload;
        return existsSync(record.path) ? [record] : [];
      } catch {
        return [];
      }
    });
}

cleanupExpiredUploads();
