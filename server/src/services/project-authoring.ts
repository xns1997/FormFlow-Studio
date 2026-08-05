import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { basename, extname, join } from 'node:path';
import JSZip from 'jszip';
import XLSX from 'xlsx';
import { PROJECTS_DIR, REPOSITORY_ROOT } from '../config/paths';
import {
  PROJECT_PACKAGE_SUFFIX, listProjectPackages, projectPackagePath, readProjectPackage, writeProjectPackage,
} from './project-package-store';
import { applyBatchChanges, dataVersion, queryRows, validateConfiguredKeys } from './data-preview';
import { compileDataToolArguments } from './data-tool-preflight';
import { inspectProjectSemantics } from './project-semantic-validation';
import { consumeStagedUpload, getStagedUpload } from './upload-staging';
import { parseSourceBuffer } from './upload-staging';
import {
  FORM_WINDOW_COORDINATE_SPACE,
  growFormWindowToFit,
  migrateCanvasComponentsToWindowLocal,
} from '../../../shared/form-window-layout';

export type JsonObject = Record<string, any>;
export type ValidationIssue = { code: string; path: string; message: string };
export type ValidationLayer = { valid: boolean; errors: ValidationIssue[] };
export type ValidationReport = {
  valid: boolean;
  errors: ValidationIssue[];
  counts: { forms: number; dataSources: number; workflows: number; behaviors: number; outputs: number };
  structural: ValidationLayer;
  references: ValidationLayer;
  semantic: ValidationLayer;
  requirements: ValidationLayer;
};

const ID_RE = /^[A-Za-z0-9_-]+$/;
const INLINE_BYTES = 5 * 1024 * 1024;
const INLINE_ROWS = 10_000;

const COMPONENT_DEFAULT_SIZES: Record<string, { width: number; height: number }> = {
  form: { width: 900, height: 600 }, card: { width: 560, height: 240 }, tabs: { width: 560, height: 240 }, steps: { width: 560, height: 96 },
  input: { width: 340, height: 76 }, textarea: { width: 340, height: 132 }, number: { width: 340, height: 76 }, datePicker: { width: 340, height: 76 },
  timePicker: { width: 340, height: 76 }, dateRange: { width: 340, height: 76 }, select: { width: 340, height: 76 }, segmented: { width: 340, height: 76 }, radio: { width: 340, height: 96 }, checkbox: { width: 340, height: 96 }, button: { width: 180, height: 48 },
  table: { width: 720, height: 320 }, chart: { width: 560, height: 280 }, divider: { width: 560, height: 16 }, text: { width: 340, height: 44 },
};

const COMPONENT_MIN_HEIGHTS: Record<string, number> = {
  input: 76, number: 76, datePicker: 76, timePicker: 76,
  dateRange: 76, select: 76, segmented: 76,
};

function finiteNumber(value: unknown, fallback: number, positive = false) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && (!positive || number > 0) ? number : fallback;
}

/** Keep model-authored and legacy controls renderable without silently producing NaN geometry. */
export function normalizeFormComponents(components: any[]): any[] {
  return (components || []).map((component, index) => {
    const defaults = COMPONENT_DEFAULT_SIZES[String(component?.type || '')] || { width: 240, height: 72 };
    return {
      ...component,
      x: finiteNumber(component?.x, 40 + (index % 2) * 390),
      y: finiteNumber(component?.y, 40 + Math.floor(index / 2) * 90),
      width: finiteNumber(component?.width, defaults.width, true),
      height: Math.max(COMPONENT_MIN_HEIGHTS[String(component?.type || '')] || 0, finiteNumber(component?.height, defaults.height, true)),
      zIndex: finiteNumber(component?.zIndex, index),
      props: component?.props && typeof component.props === 'object' ? component.props : {},
    };
  });
}

export function normalizeFormDesign(design: JsonObject): JsonObject {
  const normalized = normalizeFormComponents(Array.isArray(design?.components) ? design.components : []);
  const legacyForms = normalized.filter((component) => component.type === 'form');
  const legacyRoot = legacyForms.find((component) => !component.parentId) || legacyForms[0];
  const legacyIds = new Set(legacyForms.map((component) => component.id));
  const defaults = { x: 40, y: 40, width: 980, height: 720, props: { title: design?.name || '表单', subtitle: '', background: '#ffffff', padding: 24, borderRadius: 12, submitText: '提交', resetText: '重置', showFooter: false } };
  const migrated = legacyRoot ? { x: legacyRoot.x, y: legacyRoot.y, width: legacyRoot.width, height: legacyRoot.height, props: { ...defaults.props, ...(legacyRoot.props || {}) } } : defaults;
  const supplied = design?.formWindow;
  const formWindow = supplied ? {
    x: finiteNumber(supplied.x, migrated.x), y: finiteNumber(supplied.y, migrated.y),
    width: finiteNumber(supplied.width, migrated.width, true), height: finiteNumber(supplied.height, migrated.height, true),
    props: { ...migrated.props, ...(supplied.props || {}) },
  } : migrated;
  const normalizedComponents = normalized.filter((component) => component.type !== 'form').map((component) => ({
    ...component,
    parentId: legacyIds.has(component.parentId) ? undefined : component.parentId,
    children: Array.isArray(component.children) ? component.children.filter((id: string) => !legacyIds.has(id)) : component.children,
  }));
  const migratedCoordinates = design?.coordinateSpace === FORM_WINDOW_COORDINATE_SPACE
    ? { formWindow: growFormWindowToFit(formWindow, normalizedComponents), components: normalizedComponents }
    : migrateCanvasComponentsToWindowLocal(formWindow, normalizedComponents);
  const bindings = (Array.isArray(design?.bindings) ? design.bindings : []).filter((binding: JsonObject) => !legacyIds.has(binding.sourceId) && !legacyIds.has(binding.targetId));
  return { ...design, viewport: { zoom: 1, panX: 0, panY: 0, ...(design?.viewport || {}) }, gridSize: finiteNumber(design?.gridSize, 12, true), coordinateSpace: FORM_WINDOW_COORDINATE_SPACE, formWindow: migratedCoordinates.formWindow, components: migratedCoordinates.components, bindings };
}

function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, stable(value[key])]));
}

export function projectRevision(project: JsonObject): string {
  // `designs` and `behaviors` are read-time compatibility aliases derived from
  // canonical form/global-behavior resources. Excluding them keeps the revision
  // returned by a commit identical to the revision after reloading that commit.
  const { designs: _designs, behaviors: _behaviors, ...canonical } = project;
  return createHash('sha256').update(JSON.stringify(stable(canonical))).digest('hex');
}

export function requireProject(projectId: string): JsonObject {
  if (!ID_RE.test(projectId)) throw toolError('INVALID_ID', 'projectId 必须匹配 [A-Za-z0-9_-]+', 'projectId');
  const project = readProjectPackage(projectId);
  if (!project) throw toolError('PROJECT_NOT_FOUND', `项目 ${projectId} 不存在`, 'projectId');
  project.forms = (project.forms || []).map((form: JsonObject) => ({ ...form, design: normalizeFormDesign(form.design || {}) }));
  return project;
}

export function assertRevision(project: JsonObject, baseRevision?: string) {
  if (!baseRevision) throw toolError('BASE_REVISION_REQUIRED', '修改已有项目必须提供 baseRevision', 'baseRevision');
  const current = projectRevision(project);
  if (current !== baseRevision) throw toolError('PROJECT_REVISION_CONFLICT', '项目已被其他操作修改，请重新读取后重试', 'baseRevision', { currentRevision: current });
}

export function toolError(code: string, message: string, path?: string, details?: unknown) {
  return Object.assign(new Error(message), { code, path, details });
}

/**
 * 端口类型兼容性规则（与客户端 ui/src/services/config/nodeDiscovery.ts 保持一致）。
 * any 与任意类型兼容；精确相同或同族类型兼容。
 */
export function serverPortTypesCompatible(source: string, target: string): boolean {
  if (source === 'any' || target === 'any' || source === target) return true;
  const families = [
    new Set(['object', 'workbook', 'worksheet', 'cell', 'range', 'cell-ref', 'options', 'filter', 'sort-config', 'style', 'validation-rule']),
    new Set(['array', 'json-rows', 'aoa', 'headers']),
    new Set(['string', 'address', 'csv-string', 'html-string', 'json-string']),
  ];
  return families.some((family) => family.has(source) && family.has(target));
}

function duplicateIds(items: any[], path: string, errors: ValidationIssue[]) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (!ID_RE.test(String(item?.id || ''))) errors.push({ code: 'INVALID_ID', path: `${path}[${index}].id`, message: 'ID 必须匹配 [A-Za-z0-9_-]+' });
    if (seen.has(item?.id)) errors.push({ code: 'DUPLICATE_ID', path: `${path}[${index}].id`, message: `重复 ID：${item.id}` });
    seen.add(item?.id);
  });
}

function workflowReferences(value: any, result: string[] = []): string[] {
  if (!value || typeof value !== 'object') return result;
  if (typeof value.workflowId === 'string') result.push(value.workflowId);
  Object.values(value).forEach((child) => workflowReferences(child, result));
  return result;
}

/** 解析节点 data.propertiesJson（容错）。 */
function workflowNodeProperties(node: any): Record<string, any> {
  try {
    const raw = node?.data?.propertiesJson;
    if (typeof raw !== 'string' || !raw.trim()) return {};
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    return {};
  }
}

/** 解析自定义端口定义（与客户端 parseCustomJsPortDefinitions 兼容的最小实现，支持数组/JSON 字符串/对象映射）。 */
const DYNAMIC_PORT_TYPES = new Set([
  'string', 'number', 'boolean', 'enum', 'color', 'any',
  'workbook', 'worksheet', 'cell', 'range', 'address', 'cell-ref',
  'json-rows', 'aoa', 'headers', 'options', 'file-data', 'array', 'object', 'json',
  'csv-string', 'html-string', 'json-string',
  'filter', 'sort-config', 'style', 'validation-rule',
  'trigger',
]);

function normalizeDynamicPortType(type: unknown): string {
  const normalized = String(type || 'any').trim();
  return DYNAMIC_PORT_TYPES.has(normalized) ? normalized : 'any';
}

function workflowCustomPorts(raw: unknown): Array<{ name: string; type: string }> {
  let source = raw;
  if (typeof source === 'string') {
    const text = source.trim();
    if (!text) return [];
    try {
      source = JSON.parse(text);
    } catch {
      return [];
    }
  }
  if (Array.isArray(source)) {
    return source
      .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
      .map((entry) => entry as Record<string, unknown>)
      .filter((entry) => typeof entry.name === 'string' && String(entry.name).trim())
      .map((entry) => ({ name: String(entry.name).trim(), type: normalizeDynamicPortType(entry.type) }));
  }
  if (source && typeof source === 'object') {
    return Object.entries(source as Record<string, unknown>)
      .filter(([name]) => Boolean(String(name).trim()))
      .map(([name, value]) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const entry = value as Record<string, unknown>;
          return { name, type: normalizeDynamicPortType(entry.type) };
        }
        return { name, type: normalizeDynamicPortType(value) };
      });
  }
  return [];
}

/** 合并静态目录端口与节点自定义端口，按名称取首个命中。 */
function mergePorts(staticPorts: Array<{ name: string; type: string }>, customPorts: Array<{ name: string; type: string }>) {
  const byName = new Map<string, { name: string; type: string }>();
  for (const port of [...staticPorts, ...customPorts]) {
    if (!byName.has(port.name)) byName.set(port.name, port);
  }
  return byName;
}

/** The server and package CLI intentionally share the same frozen-v2 field policy. */
export function auditFrozenProjectFields(project: JsonObject): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const examine = (value: unknown, allowed: string[], path: string) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push({ code: 'UNKNOWN_FIELD', path: `${path}.${key}`, message: '字段不属于冻结的 FormFlow v2 格式' });
  };
  examine(project.config, ['id', 'name', 'description', 'version', 'createdAt', 'updatedAt', 'author', 'tags', 'access'], 'project.config');
  examine(project.release, ['mode', 'defaultFormId', 'defaultSheet', 'allowDesigner', 'allowBehaviorEditor', 'allowWorkflowEditor', 'lastVerifiedAt'], 'release');
  const inspectBehavior = (item: any, path: string) => examine(item, ['id', 'name', 'event', 'code', 'priority', 'enabled', 'createdAt', 'updatedAt', 'trigger', 'conditions', 'actions', 'eventFallbackReason'], path);
  for (const form of project.forms || []) {
    examine(form, ['id', 'name', 'design', 'behaviors', 'ruleCode', 'createdAt', 'updatedAt', 'generatedBy'], `forms.${form.id}`);
    examine(form.design, ['id', 'name', 'formMode', 'templateKey', 'templateParameters', 'generatedBy', 'viewport', 'gridSize', 'coordinateSpace', 'formWindow', 'components', 'bindings', 'createdAt', 'updatedAt'], `forms.${form.id}.design`);
    examine(form.design?.formWindow, ['x', 'y', 'width', 'height', 'props'], `forms.${form.id}.design.formWindow`);
    for (const component of form.design?.components || []) examine(component, ['id', 'type', 'x', 'y', 'width', 'height', 'props', 'parentId', 'fieldBinding', 'behaviorBindings', 'children', 'locked', 'visible', 'zIndex'], `forms.${form.id}.components.${component.id}`);
    for (const binding of form.design?.bindings || []) examine(binding, ['id', 'sourceId', 'targetId', 'type', 'config'], `forms.${form.id}.bindings.${binding.id || '?'}`);
    for (const behavior of form.behaviors || []) inspectBehavior(behavior, `forms.${form.id}.behaviors.${behavior.id || '?'}`);
  }
  for (const workflow of project.workflows || []) {
    examine(workflow, ['id', 'name', 'description', 'nodes', 'edges', 'versions', 'variables', 'createdAt', 'updatedAt', 'generatedBy'], `workflows.${workflow.id}`);
    for (const node of workflow.nodes || []) examine(node, ['id', 'type', 'specId', 'position', 'data'], `workflows.${workflow.id}.nodes.${node.id}`);
    for (const edge of workflow.edges || []) examine(edge, ['id', 'source', 'target', 'sourceHandle', 'targetHandle'], `workflows.${workflow.id}.edges.${edge.id}`);
  }
  for (const behavior of project.globalBehaviors || []) inspectBehavior(behavior, `behaviors.${behavior.id || '?'}`);
  for (const sheet of project.sheetBehaviors || []) for (const behavior of sheet.behaviors || []) inspectBehavior(behavior, `sheetBehaviors.${sheet.tableId}/${sheet.sheetName}.${behavior.id || '?'}`);
  for (const output of project.outputs || []) examine(output, ['id', 'name', 'format', 'size', 'createdAt', 'downloadUrl', 'generatedBy'], `outputs.${output.id}`);
  return errors;
}

export function validateProjectModel(project: JsonObject): ValidationReport {
  const errors: ValidationIssue[] = auditFrozenProjectFields(project);
  const forms = Array.isArray(project.forms) ? project.forms : [];
  const tables = Array.isArray(project.srcTable) ? project.srcTable : [];
  const workflows = Array.isArray(project.workflows) ? project.workflows : [];
  const globalBehaviors = Array.isArray(project.globalBehaviors) ? project.globalBehaviors : [];
  const behaviors = [...globalBehaviors, ...forms.flatMap((form: any) => Array.isArray(form.behaviors) ? form.behaviors : []), ...(Array.isArray(project.sheetBehaviors) ? project.sheetBehaviors.flatMap((entry: any) => Array.isArray(entry.behaviors) ? entry.behaviors : []) : [])];
  const outputs = Array.isArray(project.outputs) ? project.outputs : [];
  if (!ID_RE.test(String(project.config?.id || ''))) errors.push({ code: 'INVALID_ID', path: 'config.id', message: '项目 ID 无效' });
  if (!String(project.config?.name || '').trim()) errors.push({ code: 'REQUIRED', path: 'config.name', message: '项目名称不能为空' });
  duplicateIds(forms, 'forms', errors); duplicateIds(tables, 'srcTable', errors); duplicateIds(workflows, 'workflows', errors); duplicateIds(globalBehaviors, 'globalBehaviors', errors); duplicateIds(outputs, 'outputs', errors);
  const flowIds = new Set(workflows.map((item: any) => item.id));
  const formIds = new Set(forms.map((item: any) => item.id));
  if (project.release?.defaultFormId && !formIds.has(project.release.defaultFormId)) errors.push({ code: 'MISSING_REFERENCE', path: 'release.defaultFormId', message: '默认表单不存在' });
  for (const form of forms) {
    const components = Array.isArray(form.design?.components) ? form.design.components : [];
    duplicateIds(components, `forms.${form.id}.components`, errors);
    const componentIds = new Set(components.map((item: any) => item.id));
    for (const component of components) {
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        const value = component[key];
        if (!Number.isFinite(value) || ((key === 'width' || key === 'height') && value <= 0)) errors.push({ code: 'INVALID_COMPONENT_GEOMETRY', path: `forms.${form.id}.components.${component.id}.${key}`, message: `控件 ${component.id} 的 ${key} 必须是${key === 'width' || key === 'height' ? '正' : '有限'}数` });
      }
      if (component.parentId && !componentIds.has(component.parentId)) errors.push({ code: 'MISSING_REFERENCE', path: `forms.${form.id}.components.${component.id}.parentId`, message: `父控件 ${component.parentId} 不存在` });
      for (const child of component.children || []) if (!componentIds.has(child)) errors.push({ code: 'MISSING_REFERENCE', path: `forms.${form.id}.components.${component.id}.children`, message: `子控件 ${child} 不存在` });
      for (const flowId of workflowReferences(component.props)) if (!flowIds.has(flowId)) errors.push({ code: 'MISSING_WORKFLOW', path: `forms.${form.id}.components.${component.id}`, message: `流程 ${flowId} 不存在` });
    }
  }
  for (const workflow of workflows) {
    const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
    if (!nodes.length) errors.push({ code: 'EMPTY_WORKFLOW', path: `workflows.${workflow.id}.nodes`, message: '工作流至少需要一个节点' });
    duplicateIds(nodes, `workflows.${workflow.id}.nodes`, errors);
    const nodeIds = new Set(nodes.map((item: any) => item.id));
    for (const edge of workflow.edges || []) {
      if (!nodeIds.has(edge.source)) errors.push({ code: 'MISSING_REFERENCE', path: `workflows.${workflow.id}.edges.${edge.id}.source`, message: `源节点 ${edge.source} 不存在` });
      if (!nodeIds.has(edge.target)) errors.push({ code: 'MISSING_REFERENCE', path: `workflows.${workflow.id}.edges.${edge.id}.target`, message: `目标节点 ${edge.target} 不存在` });
      const catalogPath = join(REPOSITORY_ROOT, '.codex', 'skills', 'formflow-project-editor', 'references', 'node-ports-v2.json');
      if (existsSync(catalogPath)) {
        try {
          const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')); const source = nodes.find((item: any) => item.id === edge.source); const target = nodes.find((item: any) => item.id === edge.target);
          const sourcePort = edge.sourceHandle?.replace(/^out:/, ''); const targetPort = edge.targetHandle?.replace(/^in:/, '');
          const sourceProperties = workflowNodeProperties(source);
          const sourceOutputs = source ? mergePorts(
            catalog[source.specId]?.outputs || [],
            [
              ...workflowCustomPorts(sourceProperties.outputPorts),
              ...(source.specId === 'workflow:import' ? workflowCustomPorts(sourceProperties.ports) : []),
            ],
          ) : null;
          const targetProperties = workflowNodeProperties(target);
          const targetInputs = target ? mergePorts(
            catalog[target.specId]?.inputs || [],
            [
              ...workflowCustomPorts(targetProperties.inputPorts),
              ...(target.specId === 'workflow:export' ? workflowCustomPorts(targetProperties.ports) : []),
            ],
          ) : null;
          const sourceEntry = source && sourcePort ? sourceOutputs?.get(sourcePort) : undefined;
          const targetEntry = target && targetPort ? targetInputs?.get(targetPort) : undefined;
          if (source && sourcePort && sourceOutputs && !sourceEntry) errors.push({ code: 'INVALID_PORT', path: `workflows.${workflow.id}.edges.${edge.id}.sourceHandle`, message: `输出端口 ${sourcePort} 不存在` });
          if (target && targetPort && targetInputs && !targetEntry) errors.push({ code: 'INVALID_PORT', path: `workflows.${workflow.id}.edges.${edge.id}.targetHandle`, message: `输入端口 ${targetPort} 不存在` });
          if (sourceEntry && targetEntry && !serverPortTypesCompatible(sourceEntry.type, targetEntry.type)) {
            errors.push({ code: 'INVALID_EDGE_TYPE', path: `workflows.${workflow.id}.edges.${edge.id}`, message: `端口类型不兼容: ${sourcePort}(${sourceEntry.type}) → ${targetPort}(${targetEntry.type})` });
          }
        } catch {
          // 端口目录缺失或损坏时不阻断其余结构校验。
        }
      }
    }
  }
  const tableMap = new Map(tables.map((table: any) => [table.id, new Set((table.sheets || []).map((sheet: any) => sheet.name))]));
  for (const table of tables) for (const sheet of table.sheets || []) {
    const keys = Array.isArray(sheet.config?.keyFields) ? sheet.config.keyFields : [];
    if (!sheet.config?.readOnly && !keys.length) errors.push({ code: 'MISSING_KEY', path: `data.${table.id}.${sheet.name}.config.keyFields`, message: '可编辑 Sheet 必须配置主键' });
    for (const key of keys) if (!(sheet.headers || []).includes(key)) errors.push({ code: 'MISSING_KEY_FIELD', path: `data.${table.id}.${sheet.name}.config.keyFields`, message: `主键列 ${key} 不存在` });
    try { validateConfiguredKeys(fullSourceRows(project, table, sheet), keys); } catch (error) { errors.push({ code: 'INVALID_KEY_DATA', path: `data.${table.id}.${sheet.name}.rows`, message: error instanceof Error ? error.message : String(error) }); }
  }
  for (const entry of project.sheetBehaviors || []) if (!tableMap.get(entry.tableId)?.has(entry.sheetName)) errors.push({ code: 'MISSING_REFERENCE', path: `sheetBehaviors.${entry.tableId}/${entry.sheetName}`, message: '数据表或 Sheet 不存在' });
  const semantic = inspectProjectSemantics(project);
  errors.push(...semantic);
  const referenceCodes = new Set(['MISSING_REFERENCE', 'MISSING_WORKFLOW', 'INVALID_PORT', 'MISSING_KEY_FIELD']);
  const references = errors.filter((item) => referenceCodes.has(item.code));
  const semanticCodes = new Set(semantic.map((item) => `${item.code}:${item.path}:${item.message}`));
  const structural = errors.filter((item) => !referenceCodes.has(item.code) && !semanticCodes.has(`${item.code}:${item.path}:${item.message}`));
  const empty = { valid: true, errors: [] };
  return { valid: errors.length === 0, errors, counts: { forms: forms.length, dataSources: tables.length, workflows: workflows.length, behaviors: behaviors.length, outputs: outputs.length }, structural: { valid: structural.length === 0, errors: structural }, references: { valid: references.length === 0, errors: references }, semantic: { valid: semantic.length === 0, errors: semantic }, requirements: empty };
}

function copyPreservedData(fromRoot: string, toRoot: string, tables: any[]) {
  const sourceDir = join(fromRoot, 'data'); const targetDir = join(toRoot, 'data');
  if (!existsSync(sourceDir)) return;
  mkdirSync(targetDir, { recursive: true });
  const retained = new Set(tables.map((table) => table.fileName));
  for (const name of readdirSync(sourceDir)) if (retained.has(name)) copyFileSync(join(sourceDir, name), join(targetDir, name));
}

export function validatePersistedProjectSources(project: JsonObject): void {
  const root = projectPackagePath(project.config.id);
  for (const table of project.srcTable || []) {
    const sourcePath = join(root, 'data', basename(table.fileName));
    if (!existsSync(sourcePath)) throw toolError('SOURCE_FILE_MISSING', `原表 ${table.fileName} 不存在`, `data.${table.id}`);
    const buffer = readFileSync(sourcePath);
    const actualHash = createHash('sha256').update(buffer).digest('hex');
    if (table.dataHash && table.dataHash !== actualHash) throw toolError('SOURCE_HASH_MISMATCH', `原表 ${table.fileName} 的 SHA-256 不匹配`, `data.${table.id}.dataHash`);
    if (Number(table.fileSize) !== buffer.length) throw toolError('SOURCE_SIZE_MISMATCH', `原表 ${table.fileName} 的大小不匹配`, `data.${table.id}.fileSize`);
    for (const sheet of table.sheets || []) {
      const rows = fullSourceRows(project, table, sheet);
      if (rows.length !== Number(sheet.rowCount)) throw toolError('SOURCE_ROW_COUNT_MISMATCH', `${table.id}/${sheet.name} 的原表行数与元数据不一致`, `data.${table.id}.${sheet.name}.rowCount`);
    }
  }
}

export type ProjectSourceFile = { fileName: string; source?: string; buffer?: Buffer; consumeFileId?: string };

export function commitProject(project: JsonObject, sourceFiles: ProjectSourceFile[] = []) {
  const root = projectPackagePath(project.config.id);
  const existed = existsSync(root);
  sourceFiles = [...sourceFiles];
  if (!existed) {
    const supplied = new Set(sourceFiles.map((item) => basename(item.fileName)));
    for (const table of project.srcTable || []) {
      if (supplied.has(basename(table.fileName))) continue;
      if (String(table.fileType || '').toLowerCase() !== 'json') throw toolError('SOURCE_FILE_MISSING', `新项目数据源 ${table.fileName} 缺少原表`, `data.${table.id}`);
      for (const sheet of table.sheets || []) if ((sheet.preview || []).length !== Number(sheet.rowCount || 0)) throw toolError('SOURCE_FILE_MISSING', `新项目数据源 ${table.fileName} 没有完整行，不能生成原表`, `data.${table.id}`);
      const value = (table.sheets || []).length === 1 ? table.sheets[0].preview || [] : Object.fromEntries((table.sheets || []).map((sheet: any) => [sheet.name, sheet.preview || []]));
      const buffer = Buffer.from(JSON.stringify(value, null, 2));
      table.fileSize = buffer.length;
      table.dataHash = createHash('sha256').update(buffer).digest('hex');
      sourceFiles.push({ fileName: table.fileName, buffer });
    }
  }
  // Persisted projects created by older agents may predate geometry validation.
  // Migrate only missing/invalid values before every revision-protected commit so
  // an unrelated valid edit cannot be permanently blocked by legacy NaN layouts.
  project.forms = (project.forms || []).map((form: any) => form?.design ? { ...form, design: normalizeFormDesign(form.design) } : form);
  const report = validateProjectModel(project);
  // Iterative authoring may temporarily be semantically incomplete. Frozen shape,
  // references and data integrity are write barriers; semantic readiness remains a
  // quality/release barrier so a form can be built in multiple revision-safe steps.
  const blocking = [...report.structural.errors, ...report.references.errors];
  if (blocking.length) throw toolError('PROJECT_VALIDATION_FAILED', blocking[0].message, blocking[0].path, report);
  const backup = `${root}.backup-${randomUUID()}`;
  if (existed) renameSync(root, backup);
  try {
    writeProjectPackage(project);
    if (existed) copyPreservedData(backup, root, project.srcTable || []);
    const dataDir = join(root, 'data'); mkdirSync(dataDir, { recursive: true });
    for (const item of sourceFiles) {
      const target = join(dataDir, basename(item.fileName));
      if (item.buffer) writeFileSync(target, item.buffer);
      else if (item.source) copyFileSync(item.source, target);
      else throw new Error(`数据源 ${item.fileName} 缺少内容`);
    }
    validatePersistedProjectSources(project);
    if (existed) rmSync(backup, { recursive: true, force: true });
    for (const item of sourceFiles) if (item.consumeFileId) consumeStagedUpload(item.consumeFileId);
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    if (existed) renameSync(backup, root);
    throw error;
  }
  return { project, revision: projectRevision(project), validation: report };
}

export function createEmptyProject(input: JsonObject): JsonObject {
  const now = new Date().toISOString();
  const id = String(input.id || '');
  if (!ID_RE.test(id)) throw toolError('INVALID_ID', '项目 ID 必须匹配 [A-Za-z0-9_-]+', 'id');
  if (readProjectPackage(id)) throw toolError('PROJECT_EXISTS', `项目 ${id} 已存在`, 'id');
  return {
    config: { id, name: String(input.name || id), description: String(input.description || ''), version: String(input.version || '2.0.0'), author: String(input.author || 'FormFlow Agent'), tags: Array.isArray(input.tags) ? input.tags.map(String) : [], createdAt: now, updatedAt: now, ...(input.ownerId ? { access: { ownerId: input.ownerId, members: {} } } : {}) },
    settings: { behavior: { enableJsScripts: true, enableNodeBehavior: true, scriptTimeout: 5000, errorStrategy: 'show-error', loopProtection: 100, enableDebugDrawer: true, autoOpenDebugDrawerOnWarnOrError: true, mirrorScriptLogsToConsole: true, enableServerDebugApi: true }, publish: { format: 'json', allowWriteBack: false, generateChangeLog: true, outputFileName: 'formflow-export' }, updatedAt: now },
    release: { mode: 'design', allowDesigner: true, allowBehaviorEditor: true, allowWorkflowEditor: true },
    srcTable: [], forms: [], workflows: [], globalBehaviors: [], sheetBehaviors: [], outputs: [],
    testing: { profiles: [], suites: [], fixtures: [], runs: [] },
  };
}

function inferType(values: unknown[], fieldName = '') {
  const present = values.filter((value) => value !== null && value !== undefined && value !== '');
  if (!present.length) return 'unknown';
  if (present.every((value) => typeof value === 'boolean')) return 'boolean';
  if (/(日期|时间)$/.test(fieldName) && present.every((value) => typeof value === 'number' || (typeof value === 'string' && /^\d{4}-\d{1,2}-\d{1,2}/.test(value)))) return 'date';
  if (present.every((value) => typeof value === 'number')) return 'number';
  if (present.every((value) => typeof value === 'string' && /^\d{4}-\d{1,2}-\d{1,2}/.test(value))) return 'date';
  const unique = new Set(present.map(String)).size;
  if (/(状态|类型|等级|结论|是否|外观)$/.test(fieldName) && unique <= 20) return 'enum';
  return present.length >= 4 && unique <= 20 && unique / present.length <= 0.5 ? 'enum' : 'string';
}

function makeSheet(name: string, rows: JsonObject[], config: JsonObject = {}) {
  if (rows.length > INLINE_ROWS) throw toolError('ROW_LIMIT_EXCEEDED', `内联数据最多 ${INLINE_ROWS} 行`, 'rows');
  const declaredColumns = Array.isArray(config.columns) ? config.columns as JsonObject[] : [];
  const headers = [...new Set([...declaredColumns.map((item) => String(item.name || item.id || '')).filter(Boolean), ...rows.flatMap((row) => Object.keys(row))])];
  return { name, rowCount: rows.length, colCount: headers.length, headers, columns: headers.map((header, index) => { const declared = declaredColumns.find((item) => String(item.name || item.id || '') === header); const values = rows.map((row) => row[header]); const present = values.filter((value) => value !== null && value !== undefined && value !== ''); return { name: header, index, dataType: declared?.dataType || declared?.type || inferType(values, header), nullable: declared?.nullable ?? present.length !== values.length, uniqueCount: new Set(present.map((value) => JSON.stringify(value))).size, sampleValues: present.slice(0, 5), ...(declared?.title ? { title: declared.title } : {}), ...(declared?.enum ? { enum: declared.enum } : {}) }; }), preview: rows, config: { id: config.id || name, tableName: name, keyFields: config.keyFields || config.key || [], readOnly: Boolean(config.readOnly), frozenRows: config.frozenRows || 0, frozenColumns: config.frozenColumns || 0, filterEnabled: config.filterEnabled ?? true, sortEnabled: config.sortEnabled ?? true } };
}

export function tableFromBuffer(input: {
  id: string;
  fileName: string;
  buffer: Buffer;
  existingTable?: JsonObject;
}): JsonObject {
  if (!ID_RE.test(input.id)) throw toolError('INVALID_ID', '数据源 ID 无效', 'id');
  const parsed = parseSourceBuffer(input.buffer, input.fileName);
  const existingSheets = new Map((input.existingTable?.sheets || []).map((sheet: JsonObject) => [sheet.name, sheet]));
  const onlyExistingSheet = input.existingTable?.sheets?.length === 1 ? input.existingTable.sheets[0] : undefined;
  const sheets = parsed.sheets.map((sheet) => {
    const existing = (existingSheets.get(sheet.name) || (parsed.sheets.length === 1 ? onlyExistingSheet : undefined)) as JsonObject | undefined;
    const name = existing?.name || sheet.name;
    return makeSheet(name, sheet.data, existing?.config || {});
  });
  return {
    ...(input.existingTable || {}),
    id: input.id,
    fileName: basename(input.fileName),
    fileType: parsed.fileType,
    fileSize: input.buffer.length,
    uploadedAt: new Date().toISOString(),
    dataHash: createHash('sha256').update(input.buffer).digest('hex'),
    sheets,
  };
}

function parseCsv(text: string): JsonObject[] {
  const book = XLSX.read(text, { type: 'string' });
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: null });
}

export function tableFromInput(input: JsonObject): { table: JsonObject; sourceFiles: ProjectSourceFile[] } {
  const preflight = compileDataToolArguments('data_source.create', input);
  if (!preflight.ok) throw toolError(preflight.error.code, preflight.error.message, preflight.error.path, preflight.error);
  input = preflight.arguments;
  const now = new Date().toISOString(); const id = String(input.id || '');
  if (!ID_RE.test(id)) throw toolError('INVALID_ID', '数据源 ID 无效', 'id');
  let fileName = `${id}.json`; let fileType = 'json'; let size = 0; let hash = ''; let sheets: JsonObject[] = []; const sourceFiles: ProjectSourceFile[] = [];
  if (input.fileId) {
    const meta = getStagedUpload(String(input.fileId));
    if (!meta) throw toolError('FILE_NOT_FOUND', `上传文件 ${input.fileId} 不存在或已过期`, 'fileId');
    const source = meta.path;
    if (input.tenantId && meta.tenantId !== input.tenantId) throw toolError('FORBIDDEN_FILE', '上传文件不属于当前租户', 'fileId');
    fileName = basename(meta.originalName || meta.storedName); fileType = meta.fileType; size = meta.size; hash = meta.sha256;
    sheets = meta.sheets.map((sheet) => makeSheet(sheet.name, sheet.data, input.sheets?.[sheet.name] || {}));
    sourceFiles.push({ source, fileName, consumeFileId: meta.id });
  } else {
    const inlineConfig = input.config || {};
    const hasDeclaredColumns = Array.isArray(inlineConfig.columns) && inlineConfig.columns.length > 0;
    const inlineRows = input.rows === undefined && hasDeclaredColumns ? [] : input.rows;
    const raw = typeof input.csv === 'string' ? input.csv : JSON.stringify(inlineRows || []);
    if (Buffer.byteLength(raw) > INLINE_BYTES) throw toolError('INLINE_DATA_TOO_LARGE', '内联数据不得超过 5 MB', input.csv ? 'csv' : 'rows');
    const rows = typeof input.csv === 'string' ? parseCsv(input.csv) : inlineRows;
    if (!Array.isArray(rows)) throw toolError('INVALID_DATA', '必须提供 fileId、rows 或 csv', 'rows');
    sheets = [makeSheet(String(input.sheetName || 'Sheet1'), rows, inlineConfig)];
    if (typeof input.csv === 'string') { fileName = `${id}.csv`; fileType = 'csv'; }
    const buffer = Buffer.from(typeof input.csv === 'string' ? input.csv : JSON.stringify(rows, null, 2));
    size = buffer.length;
    hash = createHash('sha256').update(buffer).digest('hex');
    sourceFiles.push({ buffer, fileName });
  }
  return { table: { id, fileName, fileSize: size, fileType, uploadedAt: now, dataHash: hash, sheets }, sourceFiles };
}

export function serializeTableSource(project: JsonObject, tableId: string, sheetName: string) {
  const table = (project.srcTable || []).find((item: any) => item.id === tableId); if (!table) throw toolError('TABLE_NOT_FOUND', '数据表不存在', 'tableId');
  const target = (table.sheets || []).find((item: any) => item.name === sheetName); if (!target) throw toolError('SHEET_NOT_FOUND', 'Sheet 不存在', 'sheetName');
  const extension = String(table.fileType || extname(table.fileName).slice(1)).toLowerCase();
  let buffer: Buffer;
  if (extension === 'xlsx' || extension === 'xls') {
    const current = join(projectPackagePath(project.config.id), 'data', basename(table.fileName));
    const book = existsSync(current) ? XLSX.readFile(current) : XLSX.utils.book_new();
    book.Sheets[sheetName] = XLSX.utils.json_to_sheet(target.preview || [], { header: target.headers || [] });
    if (!book.SheetNames.includes(sheetName)) book.SheetNames.push(sheetName);
    buffer = Buffer.from(XLSX.write(book, { type: 'buffer', bookType: extension === 'xls' ? 'xls' : 'xlsx' }));
  } else if (extension === 'csv') {
    const worksheet = XLSX.utils.json_to_sheet(target.preview || [], { header: target.headers || [] });
    buffer = Buffer.from(`\ufeff${XLSX.utils.sheet_to_csv(worksheet)}`);
  } else {
    const value = (table.sheets || []).length === 1
      ? target.preview || []
      : Object.fromEntries((table.sheets || []).map((sheet: any) => [sheet.name, sheet.name === sheetName ? target.preview || [] : fullSourceRows(project, table, sheet)]));
    buffer = Buffer.from(JSON.stringify(value, null, 2));
  }
  table.fileSize = buffer.length; table.dataHash = createHash('sha256').update(buffer).digest('hex');
  target.preview = (target.preview || []).slice(0, 100);
  return [{ buffer, fileName: table.fileName }];
}

export function queryProjectRows(project: JsonObject, input: JsonObject) {
  const table = (project.srcTable || []).find((item: any) => item.id === input.tableId); if (!table) throw toolError('TABLE_NOT_FOUND', `数据表 ${input.tableId} 不存在`, 'tableId');
  const sheet = (table.sheets || []).find((item: any) => item.name === input.sheetName) || table.sheets?.[0]; if (!sheet) throw toolError('SHEET_NOT_FOUND', 'Sheet 不存在', 'sheetName');
  const rows = fullSourceRows(project, table, sheet);
  const pageSize = Math.min(Math.max(Number(input.pageSize) || 100, 1), 500);
  return { headers: sheet.headers, ...queryRows({ rows, headers: sheet.headers || [], keyFields: sheet.config?.keyFields || [], page: input.page, pageSize, search: input.search, keySearch: input.keySearch, sortModel: input.sortModel, filterModel: input.filterModel }) };
}

export function fullSourceRows(project: JsonObject, table: JsonObject, sheet: JsonObject): JsonObject[] {
  const source = join(projectPackagePath(project.config.id), 'data', basename(table.fileName)); if (!existsSync(source)) return sheet.preview || [];
  try {
    const extension = String(table.fileType || extname(table.fileName).slice(1)).toLowerCase();
    if (extension === 'json') { const parsed = JSON.parse(readFileSync(source, 'utf8')); const rows = Array.isArray(parsed) ? parsed : parsed[sheet.name]; return Array.isArray(rows) ? rows : sheet.preview || []; }
    const book = extension === 'csv' ? XLSX.read(readFileSync(source, 'utf8'), { type: 'string', cellDates: true }) : XLSX.readFile(source, { cellDates: true }); const worksheet = book.Sheets[extension === 'csv' ? book.SheetNames[0] : sheet.name]; return worksheet ? XLSX.utils.sheet_to_json(worksheet, { defval: null }) : sheet.preview || [];
  } catch { return sheet.preview || []; }
}

export function batchProjectRows(project: JsonObject, input: JsonObject) {
  const table = (project.srcTable || []).find((item: any) => item.id === input.tableId); if (!table) throw toolError('TABLE_NOT_FOUND', '数据表不存在', 'tableId');
  const sheet = (table.sheets || []).find((item: any) => item.name === input.sheetName); if (!sheet) throw toolError('SHEET_NOT_FOUND', 'Sheet 不存在', 'sheetName');
  const keyFields = (sheet.config?.keyFields || []) as string[];
  const adds = (input.adds || []).map((item: any) =>
    // 兼容三种写法：业务记录直接追加；{rowKey, changes} 或 {rowKey, values} 包装则解包为业务记录（rowKey 仅用于定位，追加时不重复写入）。
    item && typeof item === 'object' && ('changes' in item || 'values' in item)
      ? (item.changes ?? item.values)
      : item);
  input = { ...input, adds };
  const changes = [...adds, ...(input.updates || []), ...(input.deletes || [])];
  if (changes.length > 1000) throw toolError('BATCH_LIMIT_EXCEEDED', '单次 batch 最多 1000 个变更');
  const currentRows = fullSourceRows(project, table, sheet); const currentVersion = dataVersion(currentRows); if (input.baseVersion && input.baseVersion !== currentVersion) throw toolError('DATA_VERSION_CONFLICT', '数据已被修改', 'baseVersion', { currentVersion });
  const next = applyBatchChanges(currentRows, keyFields, input); validateConfiguredKeys(next, keyFields); sheet.preview = next; sheet.rowCount = next.length; project.config.updatedAt = new Date().toISOString();
  return { total: next.length, dataVersion: dataVersion(next), applied: { adds: input.adds?.length || 0, updates: input.updates?.length || 0, deletes: input.deletes?.length || 0 } };
}

export function generatedForm(table: JsonObject, sheet: JsonObject, input: JsonObject) {
  const now = new Date().toISOString(); const id = String(input.id || `form_${table.id}`); const mode = input.mode || 'edit';
  const components: JsonObject[] = [];
  sheet.headers.forEach((header: string, index: number) => {
    const column = sheet.columns?.find((item: any) => item.name === header); const componentId = `${id}_field_${index + 1}`;
    const componentType = /(照片|图片)$/.test(header) ? 'imageUpload' : /(附件|文件)$/.test(header) ? 'upload' : /(描述|说明|备注|意见|结果|原因)$/.test(header) ? 'textarea' : column?.dataType === 'number' ? 'number' : column?.dataType === 'date' ? 'datePicker' : column?.dataType === 'enum' && (column?.enum?.length || column?.sampleValues?.length) ? 'select' : 'input';
    const options = componentType === 'select' ? [...new Set([...(column?.enum || []), ...(column?.sampleValues || [])].map(String))].map((value) => ({ label: value, value })) : undefined;
    components.push({ id: componentId, type: componentType, x: 80 + (index % 2) * 390, y: 130 + Math.floor(index / 2) * 92, width: 340, height: componentType === 'textarea' || componentType === 'imageUpload' ? 120 : 76, zIndex: 2, fieldBinding: header, props: { name: header, label: header, required: (sheet.config?.keyFields || []).includes(header), readonly: mode === 'detail', ...(options ? { options } : {}) } });
  });
  return { id, name: input.name || `${table.id} ${mode}`, design: { id: `${id}_design`, name: input.name || id, formMode: mode, ...(input.templateKey ? { templateKey: String(input.templateKey) } : {}), viewport: { zoom: 1, panX: 0, panY: 0 }, gridSize: 12, coordinateSpace: FORM_WINDOW_COORDINATE_SPACE, formWindow: growFormWindowToFit({ x: 40, y: 40, width: 900, height: Math.max(500, 140 + sheet.headers.length * 90), props: { title: input.name || `${table.id} 表单`, showFooter: false } }, components as any), components, bindings: [{ id: `${id}_binding`, sourceId: table.id, targetId: id, type: 'table', config: { tableId: table.id, sheetName: sheet.name } }], createdAt: now, updatedAt: now }, behaviors: [], ruleCode: '', createdAt: now, updatedAt: now };
}

export async function packageProject(projectId: string): Promise<Buffer> {
  const project = requireProject(projectId); const report = validateProjectModel(project); if (!report.valid) throw toolError('PROJECT_VALIDATION_FAILED', report.errors[0].message, report.errors[0].path, report);
  validatePersistedProjectSources(project);
  const root = projectPackagePath(projectId); const zip = new JSZip();
  const walk = (dir: string, prefix = '') => { for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const path = join(dir, entry.name); const name = prefix ? `${prefix}/${entry.name}` : entry.name; if (entry.isDirectory()) walk(path, name); else zip.file(name, readFileSync(path), { date: new Date('2000-01-01T00:00:00.000Z') }); } };
  walk(root); return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'UNIX' });
}

export function projectSummary(project: JsonObject) {
  return { project: project.config, release: project.release, data: (project.srcTable || []).map((table: any) => ({ id: table.id, fileName: table.fileName, sheets: (table.sheets || []).map((sheet: any) => ({ name: sheet.name, rows: sheet.rowCount, columns: sheet.headers, keyFields: sheet.config?.keyFields || [], readOnly: !!sheet.config?.readOnly })) })), forms: (project.forms || []).map((form: any) => ({ id: form.id, name: form.name, mode: form.design?.formMode, components: form.design?.components?.length || 0 })), workflows: (project.workflows || []).map((flow: any) => ({ id: flow.id, name: flow.name, nodes: flow.nodes?.length || 0 })), behaviors: { global: project.globalBehaviors?.length || 0, sheets: project.sheetBehaviors?.length || 0, forms: (project.forms || []).reduce((count: number, form: any) => count + (form.behaviors?.length || 0), 0) }, outputs: project.outputs || [], testing: { suites: project.testing?.suites?.length || 0, fixtures: project.testing?.fixtures?.length || 0, runs: project.testing?.runs?.length || 0, latestPassed: project.testing?.runs?.at?.(-1)?.passed } };
}

export { listProjectPackages, PROJECTS_DIR, PROJECT_PACKAGE_SUFFIX };
