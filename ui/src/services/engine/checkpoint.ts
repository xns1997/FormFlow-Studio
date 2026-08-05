export type FlowCheckpoint = { id: string; workflowId: string; completedNodeIds: string[]; outputs: Record<string, Record<string, unknown>>; createdAt: string; updatedAt: string };
const prefix = 'formflow.checkpoint.';
/** 读取流程检查点（localStorage）。 */
export function loadCheckpoint(id: string): FlowCheckpoint | null { try { return JSON.parse(localStorage.getItem(`${prefix}${id}`) || 'null'); } catch { return null; } }
/** 保存流程检查点（已完成节点与输出）。 */
export function saveCheckpoint(id: string, workflowId: string, completedNodeIds: string[], outputs: Map<string, Record<string, unknown>>) { const previous = loadCheckpoint(id); const checkpoint: FlowCheckpoint = { id, workflowId, completedNodeIds, outputs: Object.fromEntries(outputs), createdAt: previous?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }; try { localStorage.setItem(`${prefix}${id}`, JSON.stringify(checkpoint)); } catch { /* quota exceeded */ } return checkpoint; }
/** 清除流程检查点。 */
export function clearCheckpoint(id: string) { try { localStorage.removeItem(`${prefix}${id}`); } catch { /* ignore */ } }
/** 列出全部流程检查点。 */
export function listCheckpoints() { const keys = Array.from({ length: localStorage.length }, (_value, index) => localStorage.key(index) || ''); return keys.filter((key) => key.startsWith(prefix)).map((key) => loadCheckpoint(key.slice(prefix.length))).filter(Boolean) as FlowCheckpoint[]; }
