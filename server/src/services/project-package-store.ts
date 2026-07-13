import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { PROJECTS_DIR } from '../config/paths';

export const PROJECT_PACKAGE_SUFFIX = '.formflow';
export const PROJECT_FORMAT_VERSION = 2;

type JsonObject = Record<string, any>;

function safeProjectId(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`无效项目 ID: ${id}`);
  return id;
}

export function projectPackagePath(id: string): string {
  return join(PROJECTS_DIR, `${safeProjectId(id)}${PROJECT_PACKAGE_SUFFIX}`);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

function syncJsonDirectory(dir: string, files: Map<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json') && !files.has(entry.name)) {
      rmSync(join(dir, entry.name));
    }
  }
  for (const [name, value] of files) writeJson(join(dir, name), value);
}

export function writeProjectPackage(project: JsonObject): void {
  const id = safeProjectId(project?.config?.id || '');
  const root = projectPackagePath(id);
  mkdirSync(root, { recursive: true });

  writeJson(join(root, 'project.json'), {
    kind: 'formflow-project',
    formatVersion: PROJECT_FORMAT_VERSION,
    config: project.config,
    settings: project.settings,
    release: project.release,
  });
  if (project.release) writeJson(join(root, 'release.json'), project.release);

  // 表单实例（含行为）
  const forms = Array.isArray(project.forms) ? project.forms : [];
  const formFiles = new Map<string, unknown>();
  formFiles.set('_index.json', {
    forms: forms.map((form: JsonObject) => ({
      id: form.id,
      name: form.name,
      fileName: `${form.id}.json`,
      behaviorsFileName: `${form.id}.behaviors.json`,
    })),
    defaultFormId: forms[0]?.id,
  });
  for (const form of forms) {
    formFiles.set(`${form.id}.json`, form.design || form);
    formFiles.set(`${form.id}.behaviors.json`, { behaviors: form.behaviors || [] });
  }
  syncJsonDirectory(join(root, 'forms'), formFiles);

  // 数据表
  const tables = Array.isArray(project.srcTable) ? project.srcTable : [];
  syncJsonDirectory(join(root, 'data'), new Map([
    ['_index.json', {
      sources: tables.map((table: JsonObject) => ({
        id: table.id, fileName: table.fileName, fileType: table.fileType,
        metaFile: `${table.id}.meta.json`,
        behaviorsFile: `${table.id}.behaviors.json`,
        uploadedAt: table.uploadedAt,
      })),
    }],
    ...tables.map((table: JsonObject) => [`${table.id}.meta.json`, table] as [string, unknown]),
    ...tables
      .map((table: JsonObject) => {
        const sheetBehaviors = (Array.isArray(project.sheetBehaviors) ? project.sheetBehaviors : [])
          .filter((entry: JsonObject) => entry.tableId === table.id);
        return [`${table.id}.behaviors.json`, { sheets: sheetBehaviors }] as [string, unknown];
      }),
  ]));

  // 全局行为
  writeJson(join(root, 'global-behaviors.json'), { behaviors: project.globalBehaviors || [] });

  // 流程
  writeJson(join(root, 'workflows', 'workflows.json'), { workflows: project.workflows || [] });

  // 输出
  writeJson(join(root, 'outputs', 'outputs.json'), { outputs: project.outputs || [] });
}

export function readProjectPackage(id: string): JsonObject | null {
  const root = projectPackagePath(id);
  const manifestPath = join(root, 'project.json');
  if (!existsSync(manifestPath)) return null;
  const manifest = readJson<JsonObject>(manifestPath);
  if (manifest.kind !== 'formflow-project' || manifest.formatVersion !== PROJECT_FORMAT_VERSION || !manifest.config) {
    throw new Error(`项目 ${id} 不是受支持的 FormFlow v${PROJECT_FORMAT_VERSION} 项目包`);
  }
  const releasePath = join(root, 'release.json');
  const release = existsSync(releasePath) ? readJson<JsonObject>(releasePath) : manifest.release;

  // 读取表单实例（含行为）
  const formIndexPath = join(root, 'forms', '_index.json');
  let forms: JsonObject[] = [];
  if (existsSync(formIndexPath)) {
    const formIndex = readJson<JsonObject>(formIndexPath);
    forms = (formIndex.forms || []).map((formMeta: JsonObject) => {
      const designPath = join(root, 'forms', formMeta.fileName as string);
      const behaviorsPath = formMeta.behaviorsFileName ? join(root, 'forms', formMeta.behaviorsFileName as string) : null;
      const design = existsSync(designPath) ? readJson<JsonObject>(designPath) : {};
      const behaviors = behaviorsPath && existsSync(behaviorsPath) ? readJson<JsonObject>(behaviorsPath).behaviors || [] : [];
      return {
        id: formMeta.id,
        name: formMeta.name,
        design,
        behaviors,
        createdAt: design.createdAt || new Date().toISOString(),
        updatedAt: design.updatedAt || new Date().toISOString(),
      };
    });
  }

  // 数据表
  const dataIndexPath = join(root, 'data', '_index.json');
  let srcTable: JsonObject[] = [];
  if (existsSync(dataIndexPath)) {
    const dataIndex = readJson<JsonObject>(dataIndexPath);
    srcTable = (dataIndex.sources || []).map((source: JsonObject) => readJson(join(root, 'data', source.metaFile)));
  }
  const sheetBehaviors = existsSync(dataIndexPath)
    ? ((readJson<JsonObject>(dataIndexPath).sources || []) as JsonObject[]).flatMap((source) => {
      const behaviorsFile = source.behaviorsFile ? join(root, 'data', source.behaviorsFile as string) : null;
      if (!behaviorsFile || !existsSync(behaviorsFile)) return [];
      const content = readJson<JsonObject>(behaviorsFile);
      return Array.isArray(content.sheets) ? content.sheets : [];
    })
    : [];

  // 全局行为
  const globalBehaviorsPath = join(root, 'global-behaviors.json');
  const globalBehaviors = existsSync(globalBehaviorsPath) ? readJson<JsonObject>(globalBehaviorsPath).behaviors || [] : [];

  // 流程
  const workflowsPath = join(root, 'workflows', 'workflows.json');
  const workflows = existsSync(workflowsPath) ? readJson<JsonObject>(workflowsPath).workflows || [] : [];

  // 输出
  const outputPath = join(root, 'outputs', 'outputs.json');
  const outputs = existsSync(outputPath) ? readJson<JsonObject>(outputPath).outputs || [] : [];

  // 兼容旧格式
  const designs = forms.length > 0 ? forms.map((f) => f.design) : [];
  const behaviors = globalBehaviors;

  return {
    config: manifest.config,
    settings: manifest.settings,
    release,
    srcTable,
    workflows,
    globalBehaviors,
    sheetBehaviors,
    forms,
    outputs,
    designs,
    behaviors,
  };
}

export function listProjectPackages(): JsonObject[] {
  if (!existsSync(PROJECTS_DIR)) return [];
  return readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(PROJECT_PACKAGE_SUFFIX))
    .flatMap((entry) => {
      const id = entry.name.slice(0, -PROJECT_PACKAGE_SUFFIX.length);
      try {
        const project = readProjectPackage(id);
        return project ? [{
          id: project.config.id,
          name: project.config.name,
          updatedAt: project.config.updatedAt,
          tableCount: project.srcTable.length,
          access: project.config.access,
          shared: Boolean(project.config.access?.members && Object.keys(project.config.access.members).length),
        }] : [];
      } catch { return []; }
    });
}

export function deleteProjectPackage(id: string): void {
  rmSync(projectPackagePath(id), { recursive: true, force: true });
}

export function getTableSheetData(projectId: string, tableId: string, sheetName: string): { headers: string[]; data: Record<string, unknown>[] } | null {
  const project = readProjectPackage(projectId);
  if (!project) return null;
  const table = (project.srcTable as JsonObject[]).find((t) => t.id === tableId);
  if (!table) return null;
  const sheet = (table.sheets as JsonObject[]).find((s) => s.name === sheetName);
  if (!sheet) return null;
  return { headers: sheet.headers as string[], data: (sheet.preview as Record<string, unknown>[]) || [] };
}

export function updateTableSheetData(projectId: string, tableId: string, sheetName: string, data: Record<string, unknown>[]): void {
  const project = readProjectPackage(projectId);
  if (!project) throw new Error(`项目 ${projectId} 不存在`);
  const table = (project.srcTable as JsonObject[]).find((t) => t.id === tableId);
  if (!table) throw new Error(`表 ${tableId} 不存在`);
  const sheet = (table.sheets as JsonObject[]).find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`Sheet ${sheetName} 不存在`);
  sheet.preview = data;
  sheet.rowCount = data.length;
  writeProjectPackage(project);
}
