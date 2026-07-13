import type { FlowNodeSpec } from '../../flowRegistry';
export type PluginManifest = { apiVersion: 1; id: string; name: string; version: string; nodes: Array<FlowNodeSpec & { executorUrl?: string }> };
type Listener = () => void;
const listeners = new Set<Listener>(); let cache: PluginManifest[] = [];
function validate(value: any): PluginManifest { if (value?.apiVersion !== 1 || !/^[\w-]+$/.test(value.id) || !Array.isArray(value.nodes)) throw new Error('无效插件清单'); return value; }
export async function discoverPlugins() { try { const response = await fetch('/api/plugins'); if (!response.ok) return cache; cache = (await response.json()).map(validate); return cache; } catch { return cache; } }
export function pluginNodeSpecs(manifests = cache) { return manifests.flatMap((manifest) => manifest.nodes.map((node) => ({ ...node, category: node.category || `插件 · ${manifest.name}` }))); }
export function subscribePluginReload(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function startPluginHotReload(interval = 2000) { if (!import.meta.env.DEV) return () => {}; let signature = JSON.stringify(cache); const timer = window.setInterval(async () => { const next = await discoverPlugins(); const value = JSON.stringify(next); if (value !== signature) { signature = value; listeners.forEach((listener) => listener()); } }, interval); return () => clearInterval(timer); }
