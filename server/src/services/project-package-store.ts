import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, extname, join } from 'node:path';
import XLSX from 'xlsx';
import { PROJECTS_DIR } from '../config/paths';

/** 项目包文件后缀。 */
export const PROJECT_PACKAGE_SUFFIX = '.formflow';
/** 项目包格式版本。 */
export const PROJECT_FORMAT_VERSION = 2;

type JsonObject = Record<string, any>;

function safeProjectId(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`无效项目 ID: ${id}`);
  return id;
}

/** 项目包文件路径（按项目 ID 稳定定位）。 */
export function projectPackagePath(id: string): string {
  return join(PROJECTS_DIR, `${safeProjectId(id)}${PROJECT_PACKAGE_SUFFIX}`);
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    throw new Error(`项目包文件损坏：${path}（${error instanceof Error ? error.message : '不是合法 JSON'}）`);
  }
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

const PERSISTED_PREVIEW_LIMIT = 100;

function persistedTableMetadata(table: JsonObject): JsonObject {
  return {
    ...table,
    sheets: (Array.isArray(table.sheets) ? table.sheets : []).map((sheet: JsonObject) => ({
      ...sheet,
      preview: (Array.isArray(sheet.preview) ? sheet.preview : []).slice(0, PERSISTED_PREVIEW_LIMIT),
    })),
  };
}

function syncDataDirectory(dir: string, files: Map<string, unknown>, sourceFileNames: Set<string>): void {
  mkdirSync(dir, { recursive: true });
  const retained = new Set([...files.keys(), ...sourceFileNames]);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && !retained.has(entry.name)) rmSync(join(dir, entry.name));
  }
  for (const [name, value] of files) writeJson(join(dir, name), value);
}

function writeProjectPackageContents(project: JsonObject, root: string): void {
  mkdirSync(root, { recursive: true });

  writeJson(join(root, 'project.json'), {
    kind: 'formflow-project',
    formatVersion: PROJECT_FORMAT_VERSION,
    config: project.config,
    settings: project.settings,
    release: project.release,
    relations: project.relations || [],
    templateInstances: project.templateInstances || [],
    templatePresets: project.templatePresets || [],
    customOperationTemplates: project.customOperationTemplates || [],
    analysisTasks: project.analysisTasks || [],
    modelRuns: project.modelRuns || [],
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
      createdAt: form.design?.createdAt || form.createdAt || project.config?.createdAt,
      updatedAt: form.design?.updatedAt || form.updatedAt || project.config?.updatedAt || project.config?.createdAt,
      generatedBy: form.generatedBy || form.design?.generatedBy,
    })),
    defaultFormId: forms[0]?.id,
  });
  for (const form of forms) {
    const design = form.design || form; const createdAt = design.createdAt || form.createdAt || project.config?.createdAt || '';
    const updatedAt = design.updatedAt || form.updatedAt || project.config?.updatedAt || createdAt;
    formFiles.set(`${form.id}.json`, { ...design, createdAt, updatedAt });
    formFiles.set(`${form.id}.behaviors.json`, { behaviors: form.behaviors || [], ruleCode: form.ruleCode || '' });
  }
  syncJsonDirectory(join(root, 'forms'), formFiles);

  // 数据表
  const tables = Array.isArray(project.srcTable) ? project.srcTable : [];
  const sourceFileNames = new Set<string>();
  for (const table of tables) {
    const fileName = basename(String(table.fileName || ''));
    if (!fileName || fileName !== table.fileName) throw new Error(`数据源 ${table.id || '?'} 的 fileName 无效`);
    sourceFileNames.add(fileName);
  }
  syncDataDirectory(join(root, 'data'), new Map([
    ['_index.json', {
      sources: tables.map((table: JsonObject) => ({
        id: table.id, fileName: table.fileName, fileType: table.fileType,
        metaFile: `${table.id}.meta.json`,
        behaviorsFile: `${table.id}.behaviors.json`,
        uploadedAt: table.uploadedAt,
      })),
    }],
    ...tables.map((table: JsonObject) => [`${table.id}.meta.json`, persistedTableMetadata(table)] as [string, unknown]),
    ...tables
      .map((table: JsonObject) => {
        const sheetBehaviors = (Array.isArray(project.sheetBehaviors) ? project.sheetBehaviors : [])
          .filter((entry: JsonObject) => entry.tableId === table.id);
        return [`${table.id}.behaviors.json`, { sheets: sheetBehaviors }] as [string, unknown];
      }),
  ]), sourceFileNames);

  // 全局行为
  writeJson(join(root, 'global-behaviors.json'), { behaviors: project.globalBehaviors || [] });

  // 流程
  writeJson(join(root, 'workflows', 'workflows.json'), { workflows: project.workflows || [] });

  // 输出
  writeJson(join(root, 'outputs', 'outputs.json'), { outputs: project.outputs || [] });

  // 可复现测试资产。只保存生成配置、隔离用例和有界运行摘要，不复制业务表数据。
  writeJson(join(root, 'testing', 'testing.json'), {
    profiles: project.testing?.profiles || [],
    suites: project.testing?.suites || [],
    fixtures: project.testing?.fixtures || [],
    runs: (project.testing?.runs || []).slice(-20),
  });
}

function replaceProjectPackage(project: JsonObject, sourceOverrides: Map<string, Buffer> = new Map()): void {
  const id = safeProjectId(project?.config?.id || '');
  const root = projectPackagePath(id);
  const temporary = `${root}.tmp-${process.pid}-${Date.now()}`;
  const backup = `${root}.replace-${process.pid}-${Date.now()}`;
  const existed = existsSync(root);
  try {
    mkdirSync(join(temporary, 'data'), { recursive: true });
    if (existed) {
      for (const table of Array.isArray(project.srcTable) ? project.srcTable : []) {
        const fileName = basename(String(table.fileName || ''));
        const source = join(root, 'data', fileName);
        if (fileName && existsSync(source)) copyFileSync(source, join(temporary, 'data', fileName));
      }
    }
    for (const [fileName, content] of sourceOverrides) writeFileSync(join(temporary, 'data', basename(fileName)), content);
    writeProjectPackageContents(project, temporary);
    if (existed) renameSync(root, backup);
    renameSync(temporary, root);
    if (existed) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    if (existsSync(backup)) {
      rmSync(root, { recursive: true, force: true });
      renameSync(backup, root);
    }
    throw error;
  }
}

/** 写入/覆盖项目包文件（含格式版本校验）。 */
export function writeProjectPackage(project: JsonObject): void {
  replaceProjectPackage(project);
}

/** 读取项目包；不存在或损坏返回 null。 */
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
      const behaviorFile = behaviorsPath && existsSync(behaviorsPath) ? readJson<JsonObject>(behaviorsPath) : {};
      const behaviors = behaviorFile.behaviors || [];
      return {
        id: formMeta.id,
        name: formMeta.name,
        design,
        behaviors,
        ruleCode: typeof behaviorFile.ruleCode === 'string' ? behaviorFile.ruleCode : '',
        createdAt: design.createdAt || formMeta.createdAt || manifest.config.createdAt || '',
        updatedAt: design.updatedAt || formMeta.updatedAt || manifest.config.updatedAt || design.createdAt || formMeta.createdAt || manifest.config.createdAt || '',
        generatedBy: formMeta.generatedBy || design.generatedBy,
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

  const testingPath = join(root, 'testing', 'testing.json');
  const testing = existsSync(testingPath)
    ? readJson<JsonObject>(testingPath)
    : { profiles: [], suites: [], fixtures: [], runs: [] };

  // 兼容旧格式
  const designs = forms.length > 0 ? forms.map((f) => f.design) : [];
  const behaviors = globalBehaviors;

  return {
    config: manifest.config,
    settings: manifest.settings,
    release,
    relations: Array.isArray(manifest.relations) ? manifest.relations : [],
    templateInstances: Array.isArray(manifest.templateInstances) ? manifest.templateInstances : [],
    templatePresets: Array.isArray(manifest.templatePresets) ? manifest.templatePresets : [],
    customOperationTemplates: Array.isArray(manifest.customOperationTemplates) ? manifest.customOperationTemplates : [],
    analysisTasks: Array.isArray(manifest.analysisTasks) ? manifest.analysisTasks : [],
    modelRuns: Array.isArray(manifest.modelRuns) ? manifest.modelRuns : [],
    srcTable,
    workflows,
    globalBehaviors,
    sheetBehaviors,
    forms,
    outputs,
    testing: {
      profiles: testing.profiles || [],
      suites: testing.suites || [],
      fixtures: testing.fixtures || [],
      runs: testing.runs || [],
    },
    designs,
    behaviors,
  };
}

/** 列出全部已存项目包。 */
export function listProjectPackages(): JsonObject[] {
  if (!existsSync(PROJECTS_DIR)) return [];
  const candidates = readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(PROJECT_PACKAGE_SUFFIX))
    .flatMap((entry) => {
      const storageId = entry.name.slice(0, -PROJECT_PACKAGE_SUFFIX.length);
      try {
        const project = readProjectPackage(storageId);
        return project ? [{ storageId, project }] : [];
      } catch { return []; }
    });
  return dedupeProjectPackageCandidates(candidates);
}

/** 按项目 ID 去重候选包（保留首个匹配）。 */
export function dedupeProjectPackageCandidates(candidates: Array<{ storageId: string; project: JsonObject }>): JsonObject[] {
  const selected = new Map<string, { storageId: string; project: JsonObject }>();
  for (const candidate of candidates) {
    const projectId = String(candidate.project.config.id || candidate.storageId);
    const current = selected.get(projectId);
    if (!current) {
      selected.set(projectId, candidate);
      continue;
    }
    const candidateIsCanonical = candidate.storageId === projectId;
    const currentIsCanonical = current.storageId === projectId;
    if (candidateIsCanonical !== currentIsCanonical) {
      if (candidateIsCanonical) selected.set(projectId, candidate);
      continue;
    }
    const candidateUpdatedAt = String(candidate.project.config.updatedAt || '');
    const currentUpdatedAt = String(current.project.config.updatedAt || '');
    if (candidateUpdatedAt > currentUpdatedAt || (candidateUpdatedAt === currentUpdatedAt && candidate.storageId < current.storageId)) {
      selected.set(projectId, candidate);
    }
  }
  return [...selected.entries()]
    .map(([projectId, { storageId, project }]) => ({
      id: storageId === projectId ? projectId : storageId,
      name: project.config.name,
      updatedAt: project.config.updatedAt,
      tableCount: project.srcTable.length,
      access: project.config.access,
      shared: Boolean(project.config.access?.members && Object.keys(project.config.access.members).length),
    }))
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))
      || String(left.name || '').localeCompare(String(right.name || ''))
      || String(left.id || '').localeCompare(String(right.id || '')));
}

/** 删除项目包文件。 */
export function deleteProjectPackage(id: string): void {
  rmSync(projectPackagePath(id), { recursive: true, force: true });
}

function readRawSheetRows(projectId: string, table: JsonObject, sheet: JsonObject): Record<string, unknown>[] {
  const source = join(projectPackagePath(projectId), 'data', basename(String(table.fileName)));
  if (!existsSync(source)) return (sheet.preview as Record<string, unknown>[]) || [];
  const extension = String(table.fileType || extname(table.fileName).slice(1)).toLowerCase();
  if (extension === 'json') {
    try {
      const parsed = JSON.parse(readFileSync(source, 'utf8'));
      const rows = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.data) || Array.isArray(parsed?.rows)
          ? parsed.data || parsed.rows
          : parsed?.[sheet.name];
      return Array.isArray(rows) ? rows : [];
    } catch {
      // 数据文件损坏时回退到内联预览或空行，避免整包读取失败。
      return (sheet.preview as Record<string, unknown>[]) || [];
    }
  }
  const workbook = extension === 'csv'
    ? XLSX.read(readFileSync(source), { type: 'buffer', cellDates: true })
    : XLSX.readFile(source, { cellDates: true });
  const worksheet = workbook.Sheets[extension === 'csv' ? workbook.SheetNames[0] : sheet.name];
  return worksheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null }) : [];
}

function serializeRawTable(projectId: string, table: JsonObject, changedSheetName: string, changedRows: Record<string, unknown>[]): Buffer {
  const extension = String(table.fileType || extname(table.fileName).slice(1)).toLowerCase();
  if (extension === 'json') {
    if ((table.sheets || []).length === 1) return Buffer.from(JSON.stringify(changedRows, null, 2));
    const value = Object.fromEntries((table.sheets || []).map((sheet: JsonObject) => [
      sheet.name,
      sheet.name === changedSheetName ? changedRows : readRawSheetRows(projectId, table, sheet),
    ]));
    return Buffer.from(JSON.stringify(value, null, 2));
  }
  if (extension === 'csv') {
    const sheet = (table.sheets || []).find((entry: JsonObject) => entry.name === changedSheetName);
    const worksheet = XLSX.utils.json_to_sheet(changedRows, { header: sheet?.headers || [] });
    return Buffer.from(`\ufeff${XLSX.utils.sheet_to_csv(worksheet)}`);
  }
  const source = join(projectPackagePath(projectId), 'data', basename(String(table.fileName)));
  const workbook = existsSync(source) ? XLSX.readFile(source) : XLSX.utils.book_new();
  const sheet = (table.sheets || []).find((entry: JsonObject) => entry.name === changedSheetName);
  workbook.Sheets[changedSheetName] = XLSX.utils.json_to_sheet(changedRows, { header: sheet?.headers || [] });
  if (!workbook.SheetNames.includes(changedSheetName)) workbook.SheetNames.push(changedSheetName);
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: extension === 'xls' ? 'xls' : 'xlsx' }));
}

/** 读取项目数据表指定 Sheet 的行数据（含主键与行序）。 */
export function getTableSheetData(projectId: string, tableId: string, sheetName: string): { headers: string[]; data: Record<string, unknown>[]; keyFields: string[]; rowOrder: string[] } | null {
  const project = readProjectPackage(projectId);
  if (!project) return null;
  const table = (project.srcTable as JsonObject[]).find((t) => t.id === tableId);
  if (!table) return null;
  const sheet = (table.sheets as JsonObject[]).find((s) => s.name === sheetName);
  if (!sheet) return null;
  return {
    headers: sheet.headers as string[],
    data: readRawSheetRows(projectId, table, sheet),
    keyFields: Array.isArray(sheet.config?.keyFields) ? sheet.config.keyFields : [],
    rowOrder: Array.isArray(sheet.config?.rowOrder) ? sheet.config.rowOrder : [],
  };
}

/** 覆写项目数据表指定 Sheet 的全部行数据。 */
export function updateTableSheetData(projectId: string, tableId: string, sheetName: string, data: Record<string, unknown>[]): void {
  const project = readProjectPackage(projectId);
  if (!project) throw new Error(`项目 ${projectId} 不存在`);
  const table = (project.srcTable as JsonObject[]).find((t) => t.id === tableId);
  if (!table) throw new Error(`表 ${tableId} 不存在`);
  const sheet = (table.sheets as JsonObject[]).find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`Sheet ${sheetName} 不存在`);
  const sourcePath = join(projectPackagePath(projectId), 'data', basename(String(table.fileName)));
  const previous = existsSync(sourcePath) ? readFileSync(sourcePath) : null;
  const next = serializeRawTable(projectId, table, sheetName, data);
  const temporary = `${sourcePath}.tmp`;
  writeFileSync(temporary, next);
  renameSync(temporary, sourcePath);
  sheet.preview = data.slice(0, PERSISTED_PREVIEW_LIMIT);
  sheet.rowCount = data.length;
  table.fileSize = next.length;
  table.dataHash = createHash('sha256').update(next).digest('hex');
  try {
    writeProjectPackage(project);
  } catch (error) {
    if (previous) writeFileSync(sourcePath, previous);
    else rmSync(sourcePath, { force: true });
    throw error;
  }
}

/** 以快照事务方式批量更新多个 Sheet（失败回滚）。 */
export function updateTableSheetsTransaction(
  projectId: string,
  changes: Array<{ tableId: string; sheetName: string; data: Record<string, unknown>[] }>,
): void {
  const project = readProjectPackage(projectId);
  if (!project) throw new Error(`项目 ${projectId} 不存在`);
  const cloned = structuredClone(project);
  const grouped = new Map<string, { table: JsonObject; sheets: Map<string, Record<string, unknown>[]> }>();
  for (const change of changes) {
    const table = (cloned.srcTable as JsonObject[]).find((entry) => entry.id === change.tableId);
    if (!table) throw new Error(`表 ${change.tableId} 不存在`);
    const sheet = (table.sheets as JsonObject[]).find((entry) => entry.name === change.sheetName);
    if (!sheet) throw new Error(`Sheet ${change.sheetName} 不存在`);
    const fileName = basename(String(table.fileName));
    const group = grouped.get(fileName) || { table, sheets: new Map<string, Record<string, unknown>[]>() };
    group.sheets.set(change.sheetName, change.data);
    grouped.set(fileName, group);
    sheet.preview = change.data.slice(0, PERSISTED_PREVIEW_LIMIT);
    sheet.rowCount = change.data.length;
  }

  const overrides = new Map<string, Buffer>();
  for (const [fileName, group] of grouped) {
    const table = group.table;
    const extension = String(table.fileType || extname(table.fileName).slice(1)).toLowerCase();
    let content: Buffer;
    if (extension === 'json') {
      if ((table.sheets || []).length === 1) {
        const sheetName = String(table.sheets[0].name);
        content = Buffer.from(JSON.stringify(group.sheets.get(sheetName) || readRawSheetRows(projectId, table, table.sheets[0]), null, 2));
      } else {
        content = Buffer.from(JSON.stringify(Object.fromEntries((table.sheets || []).map((sheet: JsonObject) => [
          sheet.name,
          group.sheets.get(String(sheet.name)) || readRawSheetRows(projectId, table, sheet),
        ])), null, 2));
      }
    } else if (extension === 'csv') {
      const sheet = table.sheets[0];
      const rows = group.sheets.get(String(sheet.name)) || readRawSheetRows(projectId, table, sheet);
      const worksheet = XLSX.utils.json_to_sheet(rows, { header: sheet.headers || [] });
      content = Buffer.from(`\ufeff${XLSX.utils.sheet_to_csv(worksheet)}`);
    } else {
      const source = join(projectPackagePath(projectId), 'data', fileName);
      const workbook = existsSync(source) ? XLSX.readFile(source) : XLSX.utils.book_new();
      for (const [sheetName, rows] of group.sheets) {
        const sheet = (table.sheets || []).find((entry: JsonObject) => entry.name === sheetName);
        workbook.Sheets[sheetName] = XLSX.utils.json_to_sheet(rows, { header: sheet?.headers || [] });
        if (!workbook.SheetNames.includes(sheetName)) workbook.SheetNames.push(sheetName);
      }
      content = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: extension === 'xls' ? 'xls' : 'xlsx' }));
    }
    table.fileSize = content.length;
    table.dataHash = createHash('sha256').update(content).digest('hex');
    overrides.set(fileName, content);
  }
  cloned.config.updatedAt = new Date().toISOString();
  replaceProjectPackage(cloned, overrides);
}
