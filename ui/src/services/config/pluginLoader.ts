import type { FlowNodeSpec } from '../../flowRegistry';
import { request } from '../io/api';
export type PluginManifest = { apiVersion: 1; id: string; name: string; version: string; nodes: Array<FlowNodeSpec & { executorUrl?: string }> };
type Listener = () => void;
const listeners = new Set<Listener>(); let cache: PluginManifest[] = [];
function validate(value: any): PluginManifest { if (value?.apiVersion !== 1 || !/^[\w-]+$/.test(value.id) || !Array.isArray(value.nodes)) throw new Error('无效插件清单'); return value; }
/** 拉取并校验插件清单（失败时保留缓存）。 */
export async function discoverPlugins() { try { cache = ((await request('/plugins')) as unknown[]).map(validate); return cache; } catch { return cache; } }
/** 插件清单 → 节点 spec 列表（补默认分类）。 */
export function pluginNodeSpecs(manifests = cache) { return manifests.flatMap((manifest) => manifest.nodes.map((node) => ({ ...node, category: node.category || `插件 · ${manifest.name}` }))); }
/** 订阅插件重载通知（返回退订函数）。 */
export function subscribePluginReload(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** 开发环境热重载插件清单（变更时通知订阅者）。 */
export function startPluginHotReload(interval = 2000) { if (!(import.meta as any).env?.DEV || typeof window === 'undefined') return () => {}; let signature = JSON.stringify(cache); const timer = window.setInterval(async () => { const next = await discoverPlugins(); const value = JSON.stringify(next); if (value !== signature) { signature = value; listeners.forEach((listener) => listener()); } }, interval); return () => clearInterval(timer); }
