import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, mkdtempSync, readFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
  commitProject, listProjectPackages, tableFromBuffer, validateProjectModel,
} from '../server/src/services/project-authoring';
import {
  getTableSheetData, projectPackagePath, readProjectPackage,
} from '../server/src/services/project-package-store';
import { REPOSITORY_ROOT } from '../server/src/config/paths';

type JsonObject = Record<string, any>;

function normalizeLegacyWorkflowNodeIds(project: JsonObject) {
  for (const workflow of project.workflows || []) {
    const replacements = new Map<string, string>();
    for (const node of workflow.nodes || []) {
      if (/^[A-Za-z0-9_-]+$/.test(node.id)) continue;
      const original = node.id;
      node.id = String(node.id).replace(/[^A-Za-z0-9_-]+/g, '_');
      replacements.set(original, node.id);
    }
    for (const edge of workflow.edges || []) {
      edge.source = replacements.get(edge.source) || edge.source;
      edge.target = replacements.get(edge.target) || edge.target;
    }
  }
}

function sourceBuffer(table: JsonObject): Buffer {
  for (const sheet of table.sheets || []) {
    if (!Array.isArray(sheet.preview) || sheet.preview.length !== sheet.rowCount) {
      throw new Error(`${table.id}/${sheet.name}: preview 不完整，不能无损迁移`);
    }
  }
  const value = (table.sheets || []).length === 1
    ? table.sheets[0].preview
    : Object.fromEntries(table.sheets.map((sheet: JsonObject) => [sheet.name, sheet.preview]));
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

const projects = listProjectPackages()
  .map((summary) => readProjectPackage(summary.id))
  .filter(Boolean) as JsonObject[];
const recoveryRoot = mkdtempSync(join(tmpdir(), 'formflow-project-migration-recovery-'));
const migratedIds: string[] = [];

try {
  for (const project of projects) {
    const root = projectPackagePath(project.config.id);
    cpSync(root, join(recoveryRoot, basename(root)), { recursive: true });
  }

  for (const project of projects) {
    normalizeLegacyWorkflowNodeIds(project);
    const sources: Array<{ fileName: string; buffer: Buffer }> = [];
    project.srcTable = (project.srcTable || []).map((table: JsonObject) => {
      const buffer = sourceBuffer(table);
      const fileName = `${table.id}.json`;
      const rebuilt = tableFromBuffer({ id: table.id, fileName, buffer, existingTable: table });
      sources.push({ fileName, buffer });
      return rebuilt;
    });
    project.config.updatedAt = new Date().toISOString();
    commitProject(project, sources);
    migratedIds.push(project.config.id);
  }

  let tableCount = 0;
  let rowCount = 0;
  for (const projectId of migratedIds) {
    const project = readProjectPackage(projectId);
    if (!project) throw new Error(`${projectId}: 迁移后项目不可读`);
    const validation = validateProjectModel(project);
    if (!validation.valid) throw new Error(`${projectId}: ${validation.errors[0].code} ${validation.errors[0].message}`);
    for (const table of project.srcTable || []) {
      tableCount += 1;
      const rawPath = join(projectPackagePath(projectId), 'data', basename(table.fileName));
      if (!existsSync(rawPath)) throw new Error(`${projectId}/${table.id}: 原表缺失`);
      const actualHash = createHash('sha256').update(readFileSync(rawPath)).digest('hex');
      if (actualHash !== table.dataHash) throw new Error(`${projectId}/${table.id}: SHA-256 不匹配`);
      for (const sheet of table.sheets || []) {
        if ((sheet.preview || []).length > 100) throw new Error(`${projectId}/${table.id}/${sheet.name}: preview 超过 100 行`);
        const full = getTableSheetData(projectId, table.id, sheet.name);
        if (!full || full.data.length !== sheet.rowCount) throw new Error(`${projectId}/${table.id}/${sheet.name}: 原表行数不匹配`);
        rowCount += full.data.length;
      }
    }
  }

  const cleanupTargets = [
    join(REPOSITORY_ROOT, 'server', 'data', 'files'),
    join(REPOSITORY_ROOT, 'server', 'data', 'data'),
    join(REPOSITORY_ROOT, 'server', 'data', 'tool-imports'),
    join(REPOSITORY_ROOT, 'server', 'data', 'reports'),
    join(REPOSITORY_ROOT, 'projects', 'data', 'proj_1784710494163.pre-form-window-backup.formflow'),
    join(REPOSITORY_ROOT, 'projects', 'data', 'proj_1784710494163.formflow.zip'),
  ].map((target) => resolve(target));
  const deleted = cleanupTargets.filter(existsSync);
  for (const target of deleted) rmSync(target, { recursive: true, force: true });
  rmSync(recoveryRoot, { recursive: true, force: true });
  process.stdout.write(`迁移成功：${migratedIds.length} 个项目，${tableCount} 张表，${rowCount} 行；已删除 ${deleted.length} 个历史目录或文件。\n`);
} catch (error) {
  for (const projectId of migratedIds) {
    const root = projectPackagePath(projectId);
    const recovery = join(recoveryRoot, basename(root));
    if (!existsSync(recovery)) continue;
    rmSync(root, { recursive: true, force: true });
    cpSync(recovery, root, { recursive: true });
  }
  rmSync(recoveryRoot, { recursive: true, force: true });
  process.stderr.write(`迁移失败：${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
