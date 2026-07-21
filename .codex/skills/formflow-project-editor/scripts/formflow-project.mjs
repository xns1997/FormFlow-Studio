#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import process from 'node:process';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { parse as parseYaml } from 'yaml';

const FIXED_ZIP_DATE = new Date('2000-01-01T00:00:00.000Z');
const ID_RE = /^[A-Za-z0-9_-]+$/;
const TYPES = new Set(['xlsx', 'xls', 'csv', 'json']);
const FORM_MODES = new Set(['create', 'edit', 'detail', 'lookup-edit']);
const OUTPUT_FORMATS = new Set(['json', 'xlsx', 'csv', 'html']);
const SKILL_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT_CATALOG_PATH = join(SKILL_ROOT, 'references', 'node-ports-v2.json');

const DEFAULT_SETTINGS = {
  behavior: {
    enableJsScripts: true, enableNodeBehavior: true, scriptTimeout: 5000,
    errorStrategy: 'show-error', loopProtection: 100, enableDebugDrawer: true,
    autoOpenDebugDrawerOnWarnOrError: true, mirrorScriptLogsToConsole: true,
    enableServerDebugApi: true,
  },
  publish: { format: 'json', allowWriteBack: false, generateChangeLog: true, outputFileName: 'formflow-export' },
};
const DEFAULT_RELEASE = { mode: 'design', allowDesigner: true, allowBehaviorEditor: true, allowWorkflowEditor: true };

class ProjectError extends Error {
  constructor(code, path, message) { super(message); this.code = code; this.path = path; }
}

function fail(code, path, message) { throw new ProjectError(code, path, message); }
function arr(value) { return Array.isArray(value) ? value : []; }
function object(value, path) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) fail('TYPE', path, 'expected an object');
  return value;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, stable(value[key])]));
}
function json(value) { return `${JSON.stringify(stable(value), null, 2)}\n`; }
function merge(base, update) {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return update === undefined ? base : update;
  const result = { ...(base || {}) };
  for (const [key, value] of Object.entries(update)) result[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(result[key], value) : value;
  return result;
}
function checkKeys(value, allowed, path, open = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) if (!allowed.includes(key) && !open.includes(key)) fail('UNKNOWN_FIELD', `${path}.${key}`, 'field is not part of frozen FormFlow v2');
}
function checkId(id, path) {
  if (typeof id !== 'string' || !ID_RE.test(id)) fail('INVALID_ID', path, 'must match [A-Za-z0-9_-]+');
}
function unique(items, key, path, errors = null) {
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    const value = key(item);
    if (seen.has(value)) {
      const error = new ProjectError('DUPLICATE_ID', `${path}[${index}]`, `duplicate identifier ${value}`);
      if (errors) errors.push(error); else throw error;
    }
    seen.add(value);
  }
}
function timestamp(spec) {
  const value = spec.now || new Date().toISOString();
  if (Number.isNaN(Date.parse(value))) fail('INVALID_DATE', 'now', 'must be an ISO date');
  return new Date(value).toISOString();
}
function parseArgs(argv) {
  const positional = []; const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) positional.push(argv[i]);
    else { const key = argv[i].slice(2); options[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
  }
  return { positional, options };
}
async function loadYaml(path) {
  const value = parseYaml(await readFile(path, 'utf8'));
  return object(value, '$');
}
async function ensureEmptyOutput(path, input) {
  if (!path) fail('USAGE', '--out', 'output path is required');
  const output = resolve(path);
  if (input && output === resolve(input)) fail('IN_PLACE_WRITE', '--out', 'output must differ from input');
  if (existsSync(output) || existsSync(`${output}.zip`)) fail('OUTPUT_EXISTS', '--out', 'output path or sibling ZIP already exists');
  return output;
}

function inferType(values) {
  const present = values.filter((value) => value !== null && value !== undefined && value !== '');
  if (!present.length) return 'unknown';
  if (present.every((value) => typeof value === 'boolean')) return 'boolean';
  if (present.every((value) => typeof value === 'number' && Number.isFinite(value))) return 'number';
  if (present.every((value) => value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{1,2}-\d{1,2}/.test(value)))) return 'date';
  const uniques = new Set(present.map(String));
  return uniques.size <= 20 && uniques.size / present.length < 0.5 ? 'enum' : 'string';
}
function rowsToSheet(name, rows, config = {}) {
  const normalized = arr(rows).filter((row) => row && typeof row === 'object' && !Array.isArray(row));
  const headers = [...new Set(normalized.flatMap((row) => Object.keys(row)))];
  const columns = headers.map((header, index) => {
    const values = normalized.map((row) => row[header]);
    const present = values.filter((value) => value !== null && value !== undefined && value !== '');
    return { name: header, index, dataType: inferType(values), nullable: present.length !== values.length, uniqueCount: new Set(present.map((value) => JSON.stringify(value))).size, sampleValues: [...new Set(present.map((value) => JSON.stringify(value)))].slice(0, 5).map((value) => JSON.parse(value)) };
  });
  const keyFields = arr(config.key);
  const previewRows = Number.isFinite(Number(config.previewRows))
    ? Math.max(1, Math.min(1000, Math.trunc(Number(config.previewRows))))
    : 100;
  return {
    name, rowCount: normalized.length, colCount: headers.length, headers, columns, preview: normalized.slice(0, previewRows),
    _rows: normalized,
    config: {
      id: config.id || name, tableName: name, keyFields, readOnly: !!config.readOnly,
      columnWidths: config.columnWidths || {}, frozenColumns: config.frozenColumns || 0, frozenRows: config.frozenRows || 0,
      defaultSort: config.defaultSort || null, hiddenColumns: config.hiddenColumns || [], lockedColumns: config.lockedColumns || [],
      columnDescriptions: config.columnDescriptions || {}, columnTags: config.columnTags || {}, headerHeight: config.headerHeight || 36,
      rowHeight: config.rowHeight || 28, alternateRowColor: config.alternateRowColor ?? true, showGridLines: config.showGridLines ?? true,
      showRowNumbers: config.showRowNumbers ?? true, autoFitColumns: config.autoFitColumns ?? true,
      filterEnabled: config.filterEnabled ?? true, sortEnabled: config.sortEnabled ?? true, groupByColumn: config.groupByColumn ?? null,
    },
  };
}
async function readSource(source, specDir, now) {
  checkKeys(source, ['id', 'path', 'fileName', 'sheets'], '$.data[]');
  checkId(source.id, '$.data[].id');
  if (!source.path) fail('MISSING_SOURCE', `data.${source.id}.path`, 'source path is required');
  const path = resolve(specDir, source.path);
  const extension = extname(path).slice(1).toLowerCase();
  if (!TYPES.has(extension)) fail('UNSUPPORTED_DATA', source.path, 'expected xlsx, xls, csv, or json');
  const buffer = await readFile(path).catch(() => fail('MISSING_SOURCE', source.path, 'file does not exist'));
  const sheetConfig = object(source.sheets, `data.${source.id}.sheets`);
  let sheetRows;
  if (extension === 'json') {
    const parsed = JSON.parse(buffer.toString('utf8'));
    if (Array.isArray(parsed)) sheetRows = { Sheet1: parsed };
    else sheetRows = Object.fromEntries(Object.entries(object(parsed, source.path)).filter(([, value]) => Array.isArray(value)));
  } else {
    const book = extension === 'csv'
      ? XLSX.read(buffer.toString('utf8'), { type: 'string', cellDates: true })
      : XLSX.read(buffer, { type: 'buffer', cellDates: true });
    sheetRows = Object.fromEntries(book.SheetNames.map((name) => [name, XLSX.utils.sheet_to_json(book.Sheets[name], { defval: null })]));
  }
  if (!Object.keys(sheetRows).length) fail('EMPTY_DATA', source.path, 'no tabular sheets found');
  for (const name of Object.keys(sheetConfig)) if (!(name in sheetRows)) fail('MISSING_SHEET', `data.${source.id}.sheets.${name}`, 'sheet not found in source');
  return {
    id: source.id, fileName: source.fileName || basename(path), fileType: extension, fileSize: buffer.length, uploadedAt: now,
    dataHash: createHash('sha256').update(buffer).digest('hex'), sheets: Object.entries(sheetRows).map(([name, rows]) => rowsToSheet(name, rows, sheetConfig[name] || {})),
    sourcePath: path, buffer,
  };
}

function behavior(input, now, path) {
  checkKeys(input, ['id', 'name', 'event', 'code', 'priority', 'enabled', 'createdAt', 'updatedAt', 'trigger', 'conditions', 'actions'], path);
  checkId(input.id, `${path}.id`);
  if ('trigger' in input || 'actions' in input) return { ...input, name: input.name || input.id, enabled: input.enabled ?? true, createdAt: input.createdAt || now, updatedAt: now };
  return { id: input.id, name: input.name || input.id, event: input.event || 'formLoad', code: input.code || '', priority: input.priority || 0, enabled: input.enabled ?? true, createdAt: input.createdAt || now, updatedAt: now };
}
function component(input, index) {
  checkKeys(input, ['id', 'type', 'x', 'y', 'width', 'height', 'props', 'parentId', 'field', 'fieldBinding', 'behaviorBindings', 'children', 'locked', 'visible', 'zIndex'], '$.forms[].components[]');
  checkId(input.id, '$.forms[].components[].id');
  const column = index % 3; const row = Math.floor(index / 3);
  return {
    id: input.id, type: input.type || 'text', x: input.x ?? 60 + column * 300, y: input.y ?? 60 + row * 100,
    width: input.width ?? (input.type === 'form' ? 900 : 260), height: input.height ?? (input.type === 'form' ? 600 : input.type === 'button' ? 48 : 72),
    props: input.props || {}, ...(input.parentId ? { parentId: input.parentId } : {}), ...((input.field || input.fieldBinding) ? { fieldBinding: input.field || input.fieldBinding } : {}),
    ...(input.behaviorBindings ? { behaviorBindings: input.behaviorBindings } : {}), ...(input.children ? { children: input.children } : {}),
    ...(input.locked !== undefined ? { locked: input.locked } : {}), ...(input.visible !== undefined ? { visible: input.visible } : {}), zIndex: input.zIndex ?? (input.type === 'form' ? 0 : 2),
  };
}
function form(input, now) {
  checkKeys(input, ['id', 'name', 'mode', 'formMode', 'templateKey', 'viewport', 'gridSize', 'components', 'bindings', 'behaviors', 'ruleCode', 'createdAt'], '$.forms[]');
  checkId(input.id, '$.forms[].id');
  const mode = input.mode || input.formMode;
  if (mode && !FORM_MODES.has(mode)) fail('INVALID_FORM_MODE', `forms.${input.id}.mode`, 'invalid form mode');
  return {
    id: input.id, name: input.name || input.id, formMode: mode, templateKey: input.templateKey,
    viewport: input.viewport || { zoom: 1, panX: 0, panY: 0 }, gridSize: input.gridSize || 10,
    components: arr(input.components).map(component), bindings: arr(input.bindings),
    behaviors: arr(input.behaviors).map((item) => behavior(item, now, `forms.${input.id}.behaviors[]`)), ruleCode: typeof input.ruleCode === 'string' ? input.ruleCode : '', createdAt: input.createdAt || now, updatedAt: now,
  };
}
function workflow(input, now) {
  checkKeys(input, ['id', 'name', 'description', 'nodes', 'edges', 'versions', 'variables', 'createdAt'], '$.workflows[]');
  checkId(input.id, '$.workflows[].id');
  const nodes = arr(input.nodes).map((node, index) => {
    checkKeys(node, ['id', 'type', 'specId', 'position', 'data'], `workflows.${input.id}.nodes[]`);
    checkId(node.id, `workflows.${input.id}.nodes[].id`);
    const data = { ...(node.data || {}) };
    if (data.properties) { data.propertiesJson = JSON.stringify(data.properties); delete data.properties; }
    return { id: node.id, type: node.type || 'custom', specId: node.specId, position: node.position || { x: 80 + (index % 4) * 300, y: 120 + Math.floor(index / 4) * 180 }, data };
  });
  const edges = arr(input.edges).map((edge, index) => ({ id: edge.id || `edge-${edge.source}-${edge.target}-${index + 1}`, source: edge.source, target: edge.target, ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}), ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}) }));
  return { id: input.id, name: input.name || input.id, description: input.description || '', nodes, edges, ...(input.versions ? { versions: input.versions } : {}), ...(input.variables ? { variables: input.variables } : {}), createdAt: input.createdAt || now, updatedAt: now };
}
function output(input, now) {
  checkKeys(input, ['id', 'name', 'format', 'size', 'createdAt', 'downloadUrl'], '$.outputs[]');
  checkId(input.id, '$.outputs[].id');
  if (!OUTPUT_FORMATS.has(input.format || 'json')) fail('INVALID_FORMAT', `outputs.${input.id}.format`, 'unsupported output format');
  return { id: input.id, name: input.name || input.id, format: input.format || 'json', size: input.size || 0, createdAt: input.createdAt || now, ...(input.downloadUrl ? { downloadUrl: input.downloadUrl } : {}) };
}

async function modelFromSpec(spec, specPath) {
  checkKeys(spec, ['project', 'now', 'settings', 'release', 'data', 'forms', 'behaviors', 'sheetBehaviors', 'workflows', 'outputs', 'testing'], '$');
  const now = timestamp(spec); const project = object(spec.project, '$.project');
  checkKeys(project, ['id', 'name', 'description', 'version', 'createdAt', 'author', 'tags', 'access'], '$.project');
  checkId(project.id, '$.project.id');
  if (!project.name) fail('REQUIRED', '$.project.name', 'project name is required');
  const data = [];
  for (const source of arr(spec.data)) data.push(await readSource(source, dirname(resolve(specPath)), now));
  return {
    config: { id: project.id, name: project.name, description: project.description || '', version: project.version || '2.0.0', createdAt: project.createdAt || now, updatedAt: now, author: project.author || 'FormFlow Agent', tags: arr(project.tags), ...(project.access ? { access: project.access } : {}) },
    settings: { ...merge(DEFAULT_SETTINGS, spec.settings || {}), updatedAt: now }, release: spec.release ? merge(DEFAULT_RELEASE, spec.release) : undefined,
    data, forms: arr(spec.forms).map((item) => form(item, now)), globalBehaviors: arr(spec.behaviors).map((item) => behavior(item, now, '$.behaviors[]')),
    sheetBehaviors: arr(spec.sheetBehaviors).map((item) => ({ tableId: item.tableId, sheetName: item.sheetName, behaviors: arr(item.behaviors).map((entry) => behavior(entry, now, '$.sheetBehaviors[].behaviors[]')), updatedAt: now })),
    workflows: arr(spec.workflows).map((item) => workflow(item, now)), outputs: arr(spec.outputs).map((item) => output(item, now)), testing: spec.testing || { profiles: [], suites: [], fixtures: [], runs: [] }, exportedAt: now,
  };
}

async function writeModel(model, output) {
  const temp = `${output}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(join(temp, 'forms'), { recursive: true }); await mkdir(join(temp, 'data'), { recursive: true });
  await mkdir(join(temp, 'workflows'), { recursive: true }); await mkdir(join(temp, 'outputs'), { recursive: true });
  await mkdir(join(temp, 'testing'), { recursive: true });
  try {
    await writeFile(join(temp, 'project.json'), json({ kind: 'formflow-project', formatVersion: 2, config: model.config, settings: model.settings, release: model.release }));
    if (model.release) await writeFile(join(temp, 'release.json'), json(model.release));
    const forms = [...model.forms].sort((a, b) => a.id.localeCompare(b.id));
    await writeFile(join(temp, 'forms', '_index.json'), json({ forms: forms.map((item) => ({ id: item.id, name: item.name, formMode: item.formMode, fileName: `${item.id}.json`, behaviorsFileName: `${item.id}.behaviors.json` })), defaultFormId: model.release?.defaultFormId || forms[0]?.id }));
    for (const item of forms) {
      const { behaviors, ruleCode, ...design } = item;
      await writeFile(join(temp, 'forms', `${item.id}.json`), json(design));
      await writeFile(join(temp, 'forms', `${item.id}.behaviors.json`), json({ behaviors, ruleCode: ruleCode || '' }));
    }
    const sources = [...model.data].sort((a, b) => a.id.localeCompare(b.id));
    await writeFile(join(temp, 'data', '_index.json'), json({ sources: sources.map((item) => ({ id: item.id, fileName: item.fileName, fileType: item.fileType, metaFile: `${item.id}.meta.json`, behaviorsFile: `${item.id}.behaviors.json`, uploadedAt: item.uploadedAt })) }));
    for (const item of sources) {
      const { sourcePath, buffer, ...meta } = item;
      meta.sheets = meta.sheets.map(({ _rows, ...sheet }) => sheet);
      if (buffer) await writeFile(join(temp, 'data', item.fileName), buffer);
      else if (sourcePath && existsSync(sourcePath)) await cp(sourcePath, join(temp, 'data', item.fileName));
      await writeFile(join(temp, 'data', `${item.id}.meta.json`), json(meta));
      await writeFile(join(temp, 'data', `${item.id}.behaviors.json`), json({ sheets: model.sheetBehaviors.filter((entry) => entry.tableId === item.id) }));
    }
    await writeFile(join(temp, 'global-behaviors.json'), json({ behaviors: model.globalBehaviors, exportedAt: model.exportedAt }));
    await writeFile(join(temp, 'workflows', 'workflows.json'), json({ workflows: model.workflows, exportedAt: model.exportedAt }));
    await writeFile(join(temp, 'outputs', 'outputs.json'), json({ outputs: model.outputs, exportedAt: model.exportedAt }));
    await writeFile(join(temp, 'testing', 'testing.json'), json(model.testing || { profiles: [], suites: [], fixtures: [], runs: [] }));
    const report = await validateDirectory(temp);
    if (!report.valid) fail('VALIDATION_FAILED', '$', `${report.errors.length} validation error(s): ${report.errors[0].message}`);
    await rename(temp, output);
  } catch (error) { await rm(temp, { recursive: true, force: true }); throw error; }
}

async function extractZip(path) {
  const root = await mkdtemp(join(tmpdir(), 'formflow-'));
  try {
    const zip = await JSZip.loadAsync(await readFile(path));
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const target = resolve(root, name);
      if (!target.startsWith(`${root}${sep}`)) fail('INVALID_ZIP', name, 'unsafe ZIP path');
      await mkdir(dirname(target), { recursive: true }); await writeFile(target, await entry.async('nodebuffer'));
    }
    return root;
  } catch (error) { await rm(root, { recursive: true, force: true }); if (error instanceof ProjectError) throw error; fail('INVALID_ZIP', path, error.message); }
}
async function projectDirectory(path) {
  const info = await stat(path).catch(() => fail('MISSING_PROJECT', path, 'project does not exist'));
  return info.isDirectory() ? { root: resolve(path), cleanup: false } : { root: await extractZip(path), cleanup: true };
}
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function loadModel(path) {
  const opened = await projectDirectory(path); const root = opened.root;
  try {
    const pkg = await readJson(join(root, 'project.json'));
    if (pkg.kind !== 'formflow-project') fail('INVALID_KIND', 'project.json.kind', 'expected formflow-project');
    if (pkg.formatVersion !== 2) fail('UNSUPPORTED_VERSION', 'project.json.formatVersion', 'only frozen FormFlow v2 is supported');
    checkKeys(pkg, ['kind', 'formatVersion', 'config', 'settings', 'release'], 'project.json');
    const formIndex = await readJson(join(root, 'forms', '_index.json')).catch(() => ({ forms: [] }));
    const forms = [];
    for (const entry of arr(formIndex.forms)) {
      const design = await readJson(join(root, 'forms', entry.fileName));
      const behaviorFile = await readJson(join(root, 'forms', entry.behaviorsFileName)).catch(() => ({ behaviors: [] }));
      forms.push({ ...design, id: entry.id, name: entry.name || design.name, behaviors: arr(behaviorFile.behaviors), ruleCode: typeof behaviorFile.ruleCode === 'string' ? behaviorFile.ruleCode : '' });
    }
    const dataIndex = await readJson(join(root, 'data', '_index.json')).catch(() => ({ sources: [] }));
    const data = []; const sheetBehaviors = [];
    for (const entry of arr(dataIndex.sources)) {
      const meta = await readJson(join(root, 'data', entry.metaFile));
      const behaviorFile = await readJson(join(root, 'data', entry.behaviorsFile)).catch(() => ({ sheets: [] }));
      sheetBehaviors.push(...arr(behaviorFile.sheets));
      data.push({ ...meta, sourcePath: join(root, 'data', entry.fileName) });
    }
    const global = await readJson(join(root, 'global-behaviors.json')).catch(() => ({ behaviors: [], exportedAt: pkg.config?.updatedAt }));
    const workflows = await readJson(join(root, 'workflows', 'workflows.json')).catch(() => ({ workflows: [], exportedAt: global.exportedAt }));
    const outputs = await readJson(join(root, 'outputs', 'outputs.json')).catch(() => ({ outputs: [], exportedAt: global.exportedAt }));
    const testing = await readJson(join(root, 'testing', 'testing.json')).catch(() => ({ profiles: [], suites: [], fixtures: [], runs: [] }));
    return { model: { config: pkg.config, settings: pkg.settings, release: pkg.release, data, forms, globalBehaviors: arr(global.behaviors), sheetBehaviors, workflows: arr(workflows.workflows), outputs: arr(outputs.outputs), testing, exportedAt: workflows.exportedAt || global.exportedAt }, opened, pkg, indexes: { formIndex, dataIndex } };
  } catch (error) { if (opened.cleanup) await rm(root, { recursive: true, force: true }); throw error; }
}

function collectWorkflowRefs(value, refs = []) {
  if (!value || typeof value !== 'object') return refs;
  if (typeof value.workflowId === 'string') refs.push(value.workflowId);
  for (const child of Object.values(value)) collectWorkflowRefs(child, refs);
  return refs;
}
async function portCatalog() { return JSON.parse(await readFile(PORT_CATALOG_PATH, 'utf8')); }
async function validateModel(model) {
  const errors = []; const add = (code, path, message) => errors.push({ code, path, message });
  auditFrozenFields(model, errors);
  const collections = [['forms', model.forms], ['data', model.data], ['behaviors', model.globalBehaviors], ['workflows', model.workflows], ['outputs', model.outputs]];
  for (const [name, items] of collections) try { unique(items, (item) => item.id, name); } catch (error) { add(error.code, error.path, error.message); }
  const workflowIds = new Set(model.workflows.map((item) => item.id)); const formIds = new Set(model.forms.map((item) => item.id));
  const tableMap = new Map(model.data.map((item) => [item.id, new Set(item.sheets.map((sheet) => sheet.name))]));
  try { unique(model.data, (item) => item.fileName, 'data.fileName'); } catch (error) { add('DUPLICATE_FILE', error.path, error.message); }
  if (model.release?.defaultFormId && !formIds.has(model.release.defaultFormId)) add('MISSING_REFERENCE', 'release.defaultFormId', 'form does not exist');
  for (const formItem of model.forms) {
    const ids = new Set();
    for (const item of formItem.components) { if (ids.has(item.id)) add('DUPLICATE_ID', `forms.${formItem.id}.components`, `duplicate ${item.id}`); ids.add(item.id); }
    for (const item of formItem.components) {
      if (item.parentId && !ids.has(item.parentId)) add('MISSING_REFERENCE', `forms.${formItem.id}.components.${item.id}.parentId`, item.parentId);
      for (const child of arr(item.children)) if (!ids.has(child)) add('MISSING_REFERENCE', `forms.${formItem.id}.components.${item.id}.children`, child);
      for (const ref of collectWorkflowRefs(item.props)) if (!workflowIds.has(ref)) add('MISSING_WORKFLOW', `forms.${formItem.id}.components.${item.id}`, ref);
    }
  }
  const catalog = await portCatalog();
  for (const flow of model.workflows) {
    const nodes = new Map(flow.nodes.map((item) => [item.id, item]));
    if (nodes.size !== flow.nodes.length) add('DUPLICATE_ID', `workflows.${flow.id}.nodes`, 'duplicate node ID');
    for (const edge of flow.edges) {
      const source = nodes.get(edge.source); const target = nodes.get(edge.target);
      if (!source) add('MISSING_REFERENCE', `workflows.${flow.id}.edges.${edge.id}.source`, edge.source);
      if (!target) add('MISSING_REFERENCE', `workflows.${flow.id}.edges.${edge.id}.target`, edge.target);
      const sourcePort = edge.sourceHandle?.replace(/^out:/, ''); const targetPort = edge.targetHandle?.replace(/^in:/, '');
      if (source && sourcePort && catalog[source.specId] && !catalog[source.specId].outputs.includes(sourcePort)) add('INVALID_PORT', `workflows.${flow.id}.edges.${edge.id}.sourceHandle`, sourcePort);
      if (target && targetPort && catalog[target.specId] && !catalog[target.specId].inputs.includes(targetPort)) add('INVALID_PORT', `workflows.${flow.id}.edges.${edge.id}.targetHandle`, targetPort);
    }
  }
  for (const entry of model.sheetBehaviors) if (!tableMap.get(entry.tableId)?.has(entry.sheetName)) add('MISSING_REFERENCE', `sheetBehaviors.${entry.tableId}/${entry.sheetName}`, 'table or sheet does not exist');
  for (const table of model.data) for (const sheet of table.sheets) {
    const config = sheet.config || {}; const keys = arr(config.keyFields);
    if (!config.readOnly && !keys.length) add('MISSING_KEY', `data.${table.id}.${sheet.name}.key`, 'editable sheet requires key fields');
    for (const key of keys) if (!sheet.headers.includes(key)) add('MISSING_KEY_FIELD', `data.${table.id}.${sheet.name}.key`, key);
    const seen = new Set();
    for (const [index, row] of (sheet._rows || sheet.preview).entries()) if (keys.length) {
      const values = keys.map((key) => row[key]);
      if (values.some((value) => value === null || value === undefined || value === '')) add('EMPTY_KEY', `data.${table.id}.${sheet.name}.rows[${index}]`, keys.join(','));
      const composite = JSON.stringify(values); if (seen.has(composite)) add('DUPLICATE_KEY', `data.${table.id}.${sheet.name}.rows[${index}]`, composite); seen.add(composite);
    }
  }
  return { valid: errors.length === 0, errors, counts: { forms: model.forms.length, dataSources: model.data.length, workflows: model.workflows.length, behaviors: model.globalBehaviors.length, outputs: model.outputs.length } };
}

function auditFrozenFields(model, errors) {
  const examine = (value, allowed, path) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push({ code: 'UNKNOWN_FIELD', path: `${path}.${key}`, message: 'field is not part of frozen FormFlow v2' });
  };
  examine(model.config, ['id', 'name', 'description', 'version', 'createdAt', 'updatedAt', 'author', 'tags', 'access'], 'project.config');
  examine(model.release, ['mode', 'defaultFormId', 'defaultSheet', 'allowDesigner', 'allowBehaviorEditor', 'allowWorkflowEditor', 'lastVerifiedAt'], 'release');
  for (const item of model.forms) {
    examine(item, ['id', 'name', 'formMode', 'templateKey', 'viewport', 'gridSize', 'components', 'bindings', 'behaviors', 'ruleCode', 'createdAt', 'updatedAt'], `forms.${item.id}`);
    for (const componentItem of arr(item.components)) examine(componentItem, ['id', 'type', 'x', 'y', 'width', 'height', 'props', 'parentId', 'fieldBinding', 'behaviorBindings', 'children', 'locked', 'visible', 'zIndex'], `forms.${item.id}.components.${componentItem.id}`);
    for (const binding of arr(item.bindings)) examine(binding, ['id', 'sourceId', 'targetId', 'type', 'config'], `forms.${item.id}.bindings.${binding.id || '?'}`);
  }
  for (const item of model.workflows) {
    examine(item, ['id', 'name', 'description', 'nodes', 'edges', 'versions', 'variables', 'createdAt', 'updatedAt'], `workflows.${item.id}`);
    for (const node of arr(item.nodes)) examine(node, ['id', 'type', 'specId', 'position', 'data'], `workflows.${item.id}.nodes.${node.id}`);
    for (const edge of arr(item.edges)) examine(edge, ['id', 'source', 'target', 'sourceHandle', 'targetHandle'], `workflows.${item.id}.edges.${edge.id}`);
  }
  for (const item of model.outputs) examine(item, ['id', 'name', 'format', 'size', 'createdAt', 'downloadUrl'], `outputs.${item.id}`);
  const inspectBehavior = (item, path) => examine(item, ['id', 'name', 'event', 'code', 'priority', 'enabled', 'createdAt', 'updatedAt', 'trigger', 'conditions', 'actions'], path);
  for (const item of model.globalBehaviors) inspectBehavior(item, `behaviors.${item.id}`);
  for (const formItem of model.forms) for (const item of arr(formItem.behaviors)) inspectBehavior(item, `forms.${formItem.id}.behaviors.${item.id}`);
  for (const sheet of model.sheetBehaviors) for (const item of arr(sheet.behaviors)) inspectBehavior(item, `sheetBehaviors.${sheet.tableId}/${sheet.sheetName}.${item.id}`);
}
async function validateDirectory(root) {
  try {
    const loaded = await loadModel(root); const report = await validateModel(loaded.model);
    if (loaded.opened.cleanup) await rm(loaded.opened.root, { recursive: true, force: true });
    return report;
  } catch (error) { return { valid: false, errors: [{ code: error.code || 'INVALID_PROJECT', path: error.path || '$', message: error.message }], counts: {} }; }
}

function upsert(items, updates, key, mapper) {
  const map = new Map(items.map((item) => [key(item), item]));
  for (const update of arr(updates)) map.set(key(update), mapper(update, map.get(key(update))));
  return [...map.values()];
}
function remove(items, ids, key) { const deleted = new Set(arr(ids)); return items.filter((item) => !deleted.has(key(item))); }
async function applyPatch(model, spec, specPath) {
  checkKeys(spec, ['project', 'now', 'settings', 'release', 'upsert', 'delete'], '$');
  const now = timestamp(spec); const additions = object(spec.upsert, '$.upsert'); const deletions = object(spec.delete, '$.delete');
  checkKeys(additions, ['data', 'forms', 'behaviors', 'sheetBehaviors', 'workflows', 'outputs'], '$.upsert');
  checkKeys(deletions, ['data', 'forms', 'behaviors', 'sheetBehaviors', 'workflows', 'outputs'], '$.delete');
  if (spec.project) model.config = { ...model.config, ...spec.project, updatedAt: now };
  if (spec.settings) model.settings = { ...merge(model.settings || DEFAULT_SETTINGS, spec.settings), updatedAt: now };
  if (spec.release) model.release = merge(model.release || DEFAULT_RELEASE, spec.release);
  const dataUpdates = []; for (const item of arr(additions.data)) dataUpdates.push(await readSource(item, dirname(resolve(specPath)), now));
  model.data = remove(upsert(model.data, dataUpdates, (x) => x.id, (x) => x), deletions.data, (x) => x.id);
  model.forms = remove(upsert(model.forms, additions.forms, (x) => x.id, (x) => form(x, now)), deletions.forms, (x) => x.id);
  model.globalBehaviors = remove(upsert(model.globalBehaviors, additions.behaviors, (x) => x.id, (x) => behavior(x, now, '$.upsert.behaviors[]')), deletions.behaviors, (x) => x.id);
  model.sheetBehaviors = remove(upsert(model.sheetBehaviors, additions.sheetBehaviors, (x) => `${x.tableId}/${x.sheetName}`, (x) => ({ tableId: x.tableId, sheetName: x.sheetName, behaviors: arr(x.behaviors).map((b) => behavior(b, now, '$.upsert.sheetBehaviors[]')), updatedAt: now })), deletions.sheetBehaviors, (x) => `${x.tableId}/${x.sheetName}`);
  model.workflows = remove(upsert(model.workflows, additions.workflows, (x) => x.id, (x) => workflow(x, now)), deletions.workflows, (x) => x.id);
  model.outputs = remove(upsert(model.outputs, additions.outputs, (x) => x.id, (x) => output(x, now)), deletions.outputs, (x) => x.id);
  model.exportedAt = now; return model;
}

async function walk(root, current = root) {
  const files = [];
  for (const name of (await readdir(current)).sort()) { const path = join(current, name); const info = await stat(path); if (info.isDirectory()) files.push(...await walk(root, path)); else files.push({ path, name: relative(root, path).split(sep).join('/') }); }
  return files;
}
async function snapshotCatalog(nodesDirectory, output) {
  const catalog = { 'generic:value-input': { inputs: [], outputs: ['value'] } };
  for (const file of await walk(nodesDirectory)) {
    if (!file.name.endsWith('/schema.json')) continue;
    const schema = await readJson(file.path); if (!schema.id || !Array.isArray(schema.ports)) continue;
    if (arr(schema.properties).some((property) => property.type === 'port-definition')) continue;
    const id = schema.id.startsWith('generic-') ? `generic:${schema.id.slice(8)}` : schema.id;
    catalog[id] = {
      inputs: schema.ports.filter((port) => port.direction === 'input' || port.direction === 'both').map((port) => port.name).sort(),
      outputs: schema.ports.filter((port) => port.direction === 'output' || port.direction === 'both').map((port) => port.name).sort(),
    };
  }
  await writeFile(output, json(catalog));
}
async function pack(directory, output) {
  const zip = new JSZip();
  for (const file of await walk(directory)) zip.file(file.name, await readFile(file.path), { date: FIXED_ZIP_DATE, createFolders: false });
  await writeFile(output, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'UNIX' }));
}
function summary(model) {
  return {
    project: model.config,
    data: model.data.map((table) => ({ id: table.id, fileName: table.fileName, sheets: table.sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rowCount, columns: sheet.headers, key: sheet.config?.keyFields || [], readOnly: !!sheet.config?.readOnly })) })),
    forms: model.forms.map((item) => ({ id: item.id, name: item.name, mode: item.formMode, components: item.components.map((component) => ({ id: component.id, type: component.type, field: component.fieldBinding })), behaviors: item.behaviors.map((entry) => entry.id), ruleCode: item.ruleCode || '' })),
    globalBehaviors: model.globalBehaviors.map((item) => item.id), sheetBehaviors: model.sheetBehaviors.map((item) => `${item.tableId}/${item.sheetName}`),
    workflows: model.workflows.map((item) => ({ id: item.id, name: item.name, nodes: item.nodes.map((node) => `${node.id}:${node.specId}`), edges: item.edges.length })), outputs: model.outputs.map((item) => ({ id: item.id, format: item.format })), testing: { suites: model.testing?.suites?.length || 0, fixtures: model.testing?.fixtures?.length || 0, runs: model.testing?.runs?.length || 0 },
  };
}
function printReport(report, asJson) {
  if (asJson) console.log(JSON.stringify(report, null, 2));
  else if (report.valid) console.log(`VALID forms=${report.counts.forms} data=${report.counts.dataSources} workflows=${report.counts.workflows} behaviors=${report.counts.behaviors} outputs=${report.counts.outputs}`);
  else for (const error of report.errors) console.error(`ERROR ${error.code} ${error.path}: ${error.message}`);
}
function help() {
  console.log(`FormFlow v2 project tool

inspect <project> [--json]
create <spec.yaml> --out <directory.formflow> [--no-zip]
normalize <project> --spec <patch.yaml> --out <directory.formflow> [--no-zip]
validate <project> [--json]
pack <directory> --out <file.zip>
unpack <file.zip> --out <directory>`);
}

async function main() {
  const [command = 'help', ...rest] = process.argv.slice(2); const { positional, options } = parseArgs(rest);
  if (command === 'help' || options.help) return help();
  if (command === 'inspect') {
    const loaded = await loadModel(positional[0]); try { console.log(JSON.stringify(summary(loaded.model), null, options.json ? 2 : 0)); } finally { if (loaded.opened.cleanup) await rm(loaded.opened.root, { recursive: true, force: true }); } return;
  }
  if (command === 'validate') {
    const loaded = await loadModel(positional[0]); let report; try { report = await validateModel(loaded.model); } finally { if (loaded.opened.cleanup) await rm(loaded.opened.root, { recursive: true, force: true }); }
    printReport(report, options.json); if (!report.valid) process.exitCode = 1; return;
  }
  if (command === 'create') {
    const output = await ensureEmptyOutput(options.out); const spec = await loadYaml(positional[0]); const model = await modelFromSpec(spec, positional[0]); await writeModel(model, output); if (!options['no-zip']) await pack(output, `${output}.zip`); console.log(`CREATED ${output}`); return;
  }
  if (command === 'normalize') {
    const output = await ensureEmptyOutput(options.out, positional[0]); const loaded = await loadModel(positional[0]);
    try { const spec = await loadYaml(options.spec); await applyPatch(loaded.model, spec, options.spec); await writeModel(loaded.model, output); if (!options['no-zip']) await pack(output, `${output}.zip`); } finally { if (loaded.opened.cleanup) await rm(loaded.opened.root, { recursive: true, force: true }); }
    console.log(`NORMALIZED ${output}`); return;
  }
  if (command === 'pack') { const output = await ensureEmptyOutput(options.out, positional[0]); const report = await validateDirectory(positional[0]); if (!report.valid) fail('VALIDATION_FAILED', positional[0], report.errors[0].message); await pack(positional[0], output); console.log(`PACKED ${output}`); return; }
  if (command === 'unpack') { const output = await ensureEmptyOutput(options.out, positional[0]); const root = await extractZip(positional[0]); try { const report = await validateDirectory(root); if (!report.valid) fail('VALIDATION_FAILED', positional[0], report.errors[0].message); await rename(root, output); } catch (error) { await rm(root, { recursive: true, force: true }); throw error; } console.log(`UNPACKED ${output}`); return; }
  if (command === 'snapshot-ports') { await snapshotCatalog(positional[0], options.out); console.log(`SNAPSHOTTED ${options.out}`); return; }
  fail('USAGE', command, 'unknown command; run help');
}

main().catch((error) => { console.error(`ERROR ${error.code || 'UNEXPECTED'} ${error.path || '$'}: ${error.message}`); process.exitCode = 1; });
