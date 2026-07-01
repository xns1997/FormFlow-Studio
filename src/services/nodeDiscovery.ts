import { pinyin } from 'pinyin-pro';
import type { FlowNodeSpec, SchemaPort } from '../flowRegistry';

export const NODE_DISCOVERY_STORAGE_KEY = 'formflow_node_discovery_v1';
export const MAX_RECENT_NODES = 5;

export type NodeDiscoveryGroup =
  | '场景模板'
  | '输入与选择'
  | '数据处理'
  | 'Excel 编辑'
  | '流程行为'
  | '输出与集成'
  | '机器学习'
  | '高级 XLSX';

export const NODE_DISCOVERY_GROUPS: NodeDiscoveryGroup[] = [
  '场景模板', '输入与选择', '数据处理', 'Excel 编辑',
  '流程行为', '输出与集成', '机器学习', '高级 XLSX',
];

export interface NodeSearchDocument {
  spec: FlowNodeSpec;
  group: NodeDiscoveryGroup;
  label: string;
  normalizedLabel: string;
  normalizedKeywords: string[];
  normalizedOriginalName: string;
  normalizedMetadata: string;
  pinyin: string;
  pinyinInitials: string;
  words: string[];
}

export interface NodeSearchResult {
  document: NodeSearchDocument;
  score: number;
  matchedTerms: string[];
  compatiblePort?: SchemaPort;
}

export interface NodeConnectionContext {
  direction: 'from-output' | 'to-input';
  port: SchemaPort;
  nodeId?: string;
}

export interface NodeDiscoveryPreferences {
  favorites: string[];
  recent: string[];
}

export interface NodeCompatibilityMatch {
  spec: FlowNodeSpec;
  port: SchemaPort;
  score: number;
}

export interface QuickNodeConnection {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[_:/\\|·()\[\]{},.\-+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, '');
}

export function getNodeDiscoveryGroup(spec: FlowNodeSpec): NodeDiscoveryGroup {
  if (spec.kind === 'scenario') return '场景模板';
  if (spec.kind === 'xlsx-method') return '高级 XLSX';
  if (spec.kind === 'behavior') return '流程行为';
  if (spec.id.startsWith('ml:') || spec.id.startsWith('ml-') || spec.category.startsWith('ML')) return '机器学习';

  const category = spec.category;
  if (/输入|选择|表单组件/.test(category)) return '输入与选择';
  if (/输出|显示|可视化|导出|集成/.test(category)) return '输出与集成';
  if (/清洗|聚合|校验/.test(category) || spec.id === 'generic:filter' || spec.id === 'generic:sort') return '数据处理';
  if (/表单操作/.test(category)) return '流程行为';
  return 'Excel 编辑';
}

function makePinyin(value: string, initials = false): string {
  return compact(pinyin(value, {
    toneType: 'none',
    type: 'array',
    pattern: initials ? 'first' : 'pinyin',
    nonZh: 'consecutive',
  }).join(''));
}

export function createNodeSearchDocument(spec: FlowNodeSpec): NodeSearchDocument {
  const keywords = spec.keywords || [];
  const portText = spec.ports.flatMap((port) => [port.name, port.label, port.description]).join(' ');
  const metadata = [spec.category, spec.description, spec.id, portText].join(' ');
  const pinyinSource = [spec.label, ...keywords, spec.originalName || ''].join(' ');
  const normalizedLabel = normalizeSearchText(spec.label);
  const normalizedKeywords = keywords.map(normalizeSearchText).filter(Boolean);
  const normalizedOriginalName = normalizeSearchText(spec.originalName || '');
  const normalizedMetadata = normalizeSearchText(metadata);
  const words = [normalizedLabel, ...normalizedKeywords, normalizedOriginalName, normalizedMetadata]
    .flatMap((value) => value.split(' '))
    .filter(Boolean);

  return {
    spec,
    group: getNodeDiscoveryGroup(spec),
    label: spec.label,
    normalizedLabel,
    normalizedKeywords,
    normalizedOriginalName,
    normalizedMetadata,
    pinyin: makePinyin(pinyinSource),
    pinyinInitials: makePinyin(pinyinSource, true),
    words: [...new Set(words)],
  };
}

export function buildNodeSearchIndex(specs: FlowNodeSpec[]): NodeSearchDocument[] {
  return specs.map(createNodeSearchDocument);
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + Number(i < a.length || j < b.length) <= 1;
}

function scoreTerm(doc: NodeSearchDocument, term: string): number {
  const label = compact(doc.normalizedLabel);
  const original = compact(doc.normalizedOriginalName);
  const keywords = doc.normalizedKeywords.map(compact);
  if (label === term || original === term) return 1200;
  if (label.startsWith(term) || original.startsWith(term)) return 1000;
  if (keywords.some((keyword) => keyword === term)) return 900;
  if (keywords.some((keyword) => keyword.startsWith(term))) return 800;
  if (label.includes(term) || original.includes(term)) return 700;
  if (keywords.some((keyword) => keyword.includes(term))) return 650;
  if (doc.pinyin.startsWith(term)) return 600;
  if (doc.pinyinInitials.startsWith(term)) return 580;
  if (doc.pinyin.includes(term) || doc.pinyinInitials.includes(term)) return 520;
  if (compact(doc.normalizedMetadata).includes(term)) return 400;
  if (term.length >= 4 && doc.words.some((word) => editDistanceAtMostOne(term, compact(word)))) return 250;
  return 0;
}

export function searchNodeDocuments(
  documents: NodeSearchDocument[],
  query: string,
  options: {
    group?: NodeDiscoveryGroup | 'all';
    favorites?: string[];
    recent?: string[];
    connection?: NodeConnectionContext;
    excludeNodeId?: string;
  } = {},
): NodeSearchResult[] {
  const terms = normalizeSearchText(query).split(' ').map(compact).filter(Boolean);
  const favoriteSet = new Set(options.favorites || []);
  const recent = options.recent || [];
  const results: NodeSearchResult[] = [];

  for (const document of documents) {
    if (options.group && options.group !== 'all' && document.group !== options.group) continue;
    if (options.excludeNodeId && document.spec.id === options.excludeNodeId) continue;
    const compatiblePort = options.connection ? findBestCompatiblePort(document.spec, options.connection) : undefined;
    if (options.connection && !compatiblePort) continue;

    const termScores = terms.map((term) => scoreTerm(document, term));
    if (terms.length > 0 && termScores.some((score) => score === 0)) continue;
    const relevance = termScores.reduce((sum, score) => sum + score, 0);
    const recentIndex = recent.indexOf(document.spec.id);
    const preferenceBoost = favoriteSet.has(document.spec.id) ? 12 : recentIndex >= 0 ? Math.max(1, 8 - recentIndex) : 0;
    const connectionBoost = compatiblePort && options.connection ? compatibilitySearchBoost(compatiblePort, options.connection) : 0;
    results.push({ document, score: relevance + preferenceBoost + connectionBoost, matchedTerms: terms, compatiblePort });
  }

  return results.sort((a, b) =>
    b.score - a.score
    || a.document.label.localeCompare(b.document.label, 'zh-CN')
    || a.document.spec.id.localeCompare(b.document.spec.id),
  );
}

export function portTypesCompatible(source: string, target: string): boolean {
  if (source === 'any' || target === 'any' || source === target) return true;
  const families = [
    new Set(['object', 'workbook', 'worksheet', 'cell', 'range', 'cell-ref', 'options', 'filter', 'sort-config', 'style', 'validation-rule']),
    new Set(['array', 'json-rows', 'aoa', 'headers']),
    new Set(['string', 'address', 'csv-string', 'html-string', 'json-string']),
  ];
  return families.some((family) => family.has(source) && family.has(target));
}

function compatibilityScore(candidate: SchemaPort, context: NodeConnectionContext, index: number): number {
  const sameName = candidate.name === context.port.name ? 1000 : 0;
  const exactType = candidate.type === context.port.type ? 500 : candidate.type === 'any' || context.port.type === 'any' ? 100 : 250;
  const required = candidate.required ? 20 : 0;
  return sameName + exactType + required - index;
}

function compatibilitySearchBoost(candidate: SchemaPort, context: NodeConnectionContext): number {
  const sameName = candidate.name === context.port.name ? 60 : 0;
  const exactType = candidate.type === context.port.type ? 30 : candidate.type === 'any' || context.port.type === 'any' ? 0 : 15;
  return sameName + exactType + (candidate.required ? 4 : 0);
}

export function findBestCompatiblePort(spec: FlowNodeSpec, context: NodeConnectionContext): SchemaPort | undefined {
  const wantedDirection = context.direction === 'from-output' ? 'input' : 'output';
  return spec.ports
    .map((port, index) => ({ port, index }))
    .filter(({ port }) => port.direction === wantedDirection || port.direction === 'both')
    .filter(({ port }) => context.direction === 'from-output'
      ? portTypesCompatible(context.port.type, port.type)
      : portTypesCompatible(port.type, context.port.type))
    .sort((a, b) => compatibilityScore(b.port, context, b.index) - compatibilityScore(a.port, context, a.index))[0]?.port;
}

export function getCompatibleNodeMatches(specs: FlowNodeSpec[], context: NodeConnectionContext, excludeNodeId?: string): NodeCompatibilityMatch[] {
  return specs.flatMap((spec) => {
    if (spec.id === excludeNodeId) return [];
    const port = findBestCompatiblePort(spec, context);
    if (!port) return [];
    return [{ spec, port, score: compatibilityScore(port, context, spec.ports.indexOf(port)) }];
  }).sort((a, b) => b.score - a.score || a.spec.label.localeCompare(b.spec.label, 'zh-CN'));
}

export function createQuickNodeConnection(
  context: NodeConnectionContext,
  existingNodeId: string,
  existingHandleId: string,
  newNodeId: string,
  compatiblePort: SchemaPort,
): QuickNodeConnection {
  if (context.direction === 'from-output') {
    return { source: existingNodeId, sourceHandle: existingHandleId, target: newNodeId, targetHandle: `in:${compatiblePort.name}` };
  }
  return { source: newNodeId, sourceHandle: `out:${compatiblePort.name}`, target: existingNodeId, targetHandle: existingHandleId };
}

export function sanitizeNodeDiscoveryPreferences(value: unknown, validIds: Iterable<string>): NodeDiscoveryPreferences {
  const valid = new Set(validIds);
  const input = value && typeof value === 'object' ? value as Partial<NodeDiscoveryPreferences> : {};
  const clean = (items: unknown, limit?: number) => {
    if (!Array.isArray(items)) return [];
    const result = [...new Set(items.filter((id): id is string => typeof id === 'string' && valid.has(id)))];
    return limit ? result.slice(0, limit) : result;
  };
  return { favorites: clean(input.favorites), recent: clean(input.recent, MAX_RECENT_NODES) };
}

export function parseNodeDiscoveryPreferences(raw: string | null, validIds: Iterable<string>): NodeDiscoveryPreferences {
  if (!raw) return { favorites: [], recent: [] };
  try { return sanitizeNodeDiscoveryPreferences(JSON.parse(raw), validIds); }
  catch { return { favorites: [], recent: [] }; }
}

export function recordRecentNode(preferences: NodeDiscoveryPreferences, specId: string): NodeDiscoveryPreferences {
  return { ...preferences, recent: [specId, ...preferences.recent.filter((id) => id !== specId)].slice(0, MAX_RECENT_NODES) };
}

export function toggleFavoriteNode(preferences: NodeDiscoveryPreferences, specId: string): NodeDiscoveryPreferences {
  const favorites = preferences.favorites.includes(specId)
    ? preferences.favorites.filter((id) => id !== specId)
    : [specId, ...preferences.favorites];
  return { ...preferences, favorites };
}
