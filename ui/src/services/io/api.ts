// 后端 API 客户端

export const API_BASE = (((import.meta as any).env?.VITE_API_BASE) || '/api').replace(/\/$/, '');
export type ProjectAgentSessionScope = 'project' | 'unbound' | 'all';

function authorizationHeaders(): Record<string, string> {
  let token = '';
  try { token = JSON.parse(localStorage.getItem('formflow.session') || 'null')?.token || ''; } catch { /* ignore */ }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function request(path: string, options?: RequestInit) {
  const headers = new Headers(options?.headers); headers.set('Content-Type', 'application/json');
  for (const [key, value] of Object.entries(authorizationHeaders())) headers.set(key, value);
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error || `API Error: ${res.status}`);
  }
  return res.json();
}

// ── 项目管理 ──────────────────────────────────────

export const projectApi = {
  list: () => request('/projects'),
  get: (id: string) => request(`/projects/${encodeURIComponent(id)}`),
  create: (data: any) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request(`/projects/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: string) => request(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  clone: (id: string) => request(`/projects/${encodeURIComponent(id)}/clone`, { method: 'POST' }),
};

// ── 文件管理 ──────────────────────────────────────

export const fileApi = {
  list: () => request('/files'),
  get: (id: string) => request(`/files/${id}`),
  getData: (id: string) => request(`/files/${id}/data`),
  remove: (id: string) => request(`/files/${id}`, { method: 'DELETE' }),
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/files/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },
};

// ── 数据管理 ──────────────────────────────────────

export const dataApi = {
  parse: (fileId: string, sheetName?: string) => request('/data/parse', { method: 'POST', body: JSON.stringify({ fileId, sheetName }) }),
  get: (fileId: string, sheetName: string) => request(`/data/${fileId}/${sheetName}`),
  getRows: (fileId: string, sheetName: string, page = 1, pageSize = 50) => request(`/data/${fileId}/${sheetName}/rows?page=${page}&pageSize=${pageSize}`),
  getColumns: (fileId: string, sheetName: string) => request(`/data/${fileId}/${sheetName}/columns`),
  export: (data: any[], format: string, fileName?: string) => fetch(`${API_BASE}/data/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data, format, fileName }) }),
};

// ── 历史管理 ──────────────────────────────────────

export const historyApi = {
  list: (projectId: string) => request(`/history/${projectId}`),
  create: (projectId: string, label: string, snapshot: any) => request(`/history/${projectId}`, { method: 'POST', body: JSON.stringify({ label, snapshot: JSON.stringify(snapshot) }) }),
  get: (projectId: string, versionId: string) => request(`/history/${projectId}/${versionId}`),
  restore: (projectId: string, versionId: string) => request(`/history/${projectId}/${versionId}/restore`, { method: 'POST' }),
  remove: (projectId: string, versionId: string) => request(`/history/${projectId}/${versionId}`, { method: 'DELETE' }),
  clear: (projectId: string) => request(`/history/${projectId}`, { method: 'DELETE' }),
};

// ── 流程管理 ──────────────────────────────────────

export const workflowApi = {
  list: (projectId: string) => request(`/workflows/${projectId}`),
  create: (projectId: string, data: any) => request(`/workflows/${projectId}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (projectId: string, workflowId: string, data: any) => request(`/workflows/${projectId}/${workflowId}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (projectId: string, workflowId: string) => request(`/workflows/${projectId}/${workflowId}`, { method: 'DELETE' }),
};

// ── 行为管理 ──────────────────────────────────────

export const behaviorApi = {
  list: (projectId: string) => request(`/behaviors/${projectId}`),
  create: (projectId: string, data: any) => request(`/behaviors/${projectId}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (projectId: string, behaviorId: string, data: any) => request(`/behaviors/${projectId}/${behaviorId}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (projectId: string, behaviorId: string) => request(`/behaviors/${projectId}/${behaviorId}`, { method: 'DELETE' }),
};

// ── 配置管理 ──────────────────────────────────────

export const configApi = {
  list: () => request('/configs'),
  get: (id: string) => request(`/configs/${id}`),
  save: (id: string, data: any) => request(`/configs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: string) => request(`/configs/${id}`, { method: 'DELETE' }),
};

export const llmApi = {
  health: () => request('/ai/health'),
  providers: {
    list: (projectId?: string) => request(`/ai/providers${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
    save: (data: any) => request('/ai/providers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/ai/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string, projectId?: string) => request(`/ai/providers/${id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, { method: 'DELETE' }),
    test: (id: string, model?: string, projectId?: string) => request(`/ai/providers/${id}/test`, { method: 'POST', body: JSON.stringify({ model, projectId }) }),
  },
  profiles: {
    list: (projectId?: string) => request(`/ai/profiles${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
    save: (data: any) => request('/ai/profiles', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/ai/profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string, projectId?: string) => request(`/ai/profiles/${id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, { method: 'DELETE' }),
  },
  agents: {
    list: (projectId?: string) => request(`/ai/agents${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
    save: (data: any) => request('/ai/agents', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/ai/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string, projectId?: string) => request(`/ai/agents/${id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, { method: 'DELETE' }),
    run: (id: string, input: unknown, projectId?: string) => request(`/ai/agents/${id}/runs`, { method: 'POST', body: JSON.stringify({ input, projectId }) }),
  },
  embed: (profileId: string, input: string[], projectId?: string) => request('/ai/embeddings', { method: 'POST', body: JSON.stringify({ profileId, input, projectId }) }),
  knowledge: {
    index: (data: { profileId: string; projectId: string; collection?: string; documents: { id?: string; sourceId: string; sourceType?: string; chunkIndex?: number; content: string; metadata?: Record<string, unknown> }[] }) => request('/ai/knowledge/index', { method: 'POST', body: JSON.stringify(data) }),
    search: (data: { profileId: string; projectId: string; collection?: string; query: string; limit?: number; sourceTypes?: string[]; metadata?: Record<string, unknown> }) => request('/ai/knowledge/search', { method: 'POST', body: JSON.stringify(data) }),
    remove: (data: { projectId: string; collection?: string; sourceId?: string }) => request('/ai/knowledge', { method: 'DELETE', body: JSON.stringify(data) }),
  },
  plugins: () => request('/ai/plugins'),
  ruleAgent: {
    settings: () => request('/ai/rule-agent/settings'),
    saveSettings: (data: any) => request('/ai/rule-agent/settings', { method: 'PUT', body: JSON.stringify(data) }),
    sessions: (projectId: string, formId: string) => request(`/ai/rule-agent/sessions?projectId=${encodeURIComponent(projectId)}&formId=${encodeURIComponent(formId)}`),
    createSession: (data: { projectId: string; formId: string; title?: string; profileId?: string }) => request('/ai/rule-agent/sessions', { method: 'POST', body: JSON.stringify(data) }),
    getSession: (id: string, projectId: string) => request(`/ai/rule-agent/sessions/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`),
    turn: (id: string, data: any) => request(`/ai/rule-agent/sessions/${encodeURIComponent(id)}/turns`, { method: 'POST', body: JSON.stringify(data) }),
    archive: (id: string, projectId: string) => request(`/ai/rule-agent/sessions/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' }),
    authorizeRuntime: (id: string, data: { projectId: string; fields: string[] }) => request(`/ai/rule-agent/sessions/${encodeURIComponent(id)}/runtime-authorizations`, { method: 'POST', body: JSON.stringify(data) }),
    applyProposal: (id: string, data: { sessionId: string; projectId: string; baseRuleHash: string; confirmFailedTests?: boolean }) => request(`/ai/rule-agent/proposals/${encodeURIComponent(id)}/apply`, { method: 'POST', body: JSON.stringify(data) }),
  },
  projectAgent: {
    sessions: (query: { projectId?: string; scope?: ProjectAgentSessionScope } = {}) => { const params = new URLSearchParams(); if (query.projectId) params.set('projectId', query.projectId); else if (query.scope) params.set('scope', query.scope); const suffix = params.size ? `?${params}` : ''; return request(`/ai/project-agent/v2/sessions${suffix}`); },
    createSession: (data: { projectId?: string; projectIds?: string[]; title?: string; profileId?: string; capabilityBundleVersionId?: string }) => request('/ai/project-agent/v2/sessions', { method: 'POST', body: JSON.stringify(data) }),
    setProjects: (id: string, data: { projectIds: string[]; currentProjectId?: string }) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}/projects`, { method: 'PUT', body: JSON.stringify(data) }),
    getSession: (id: string, projectId?: string) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
    turn: (id: string, data: { prompt: string; projectId?: string }) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}/turns`, { method: 'POST', body: JSON.stringify(data) }),
    retryTurn: (id: string, projectId?: string) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}/turns/retry`, { method: 'POST', body: JSON.stringify({ projectId }) }),
    confirmPlan: (sessionId: string, planId: string, projectId?: string) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(sessionId)}/plans/${encodeURIComponent(planId)}/confirm`, { method: 'POST', body: JSON.stringify({ projectId }) }),
    control: (id: string, data: { action: 'pause' | 'continue' | 'stop' | 'retry' | 'repair'; projectId?: string }) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}/control`, { method: 'POST', body: JSON.stringify(data) }),
    decideOperation: (sessionId: string, operationId: string, data: { approved: boolean; automatic?: boolean; projectId?: string }) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(sessionId)}/operations/${encodeURIComponent(operationId)}/decision`, { method: 'POST', body: JSON.stringify(data) }),
    archive: (id: string, projectId?: string) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, { method: 'DELETE' }),
    events: (id: string, afterSeq = 0, projectId?: string) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}/events?afterSeq=${afterSeq}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}`),
    streamEvents: async (id: string, afterSeq: number, onEvent: (event: any) => void, signal?: AbortSignal, projectId?: string, lifecycle?: { onOpen?(): void; onClose?(): void }) => {
      const response = await fetch(`${API_BASE}/ai/project-agent/v2/sessions/${encodeURIComponent(id)}/events?afterSeq=${afterSeq}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}`, { headers: { Accept: 'text/event-stream', ...authorizationHeaders() }, signal });
      if (!response.ok || !response.body) throw new Error(`事件流连接失败：${response.status}`);
      lifecycle?.onOpen?.();
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      try {
        while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const frames = buffer.split('\n\n'); buffer = frames.pop() || ''; for (const frame of frames) { const line = frame.split('\n').find((item) => item.startsWith('data: ')); if (!line) continue; try { onEvent(JSON.parse(line.slice(6))); } catch { /* ignore malformed heartbeat */ } } }
      } finally { lifecycle?.onClose?.(); }
    },
    capabilityBundles: {
      list: () => request('/ai/project-agent/v2/capability-bundles'),
      create: (data: any) => request('/ai/project-agent/v2/capability-bundles', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: any) => request(`/ai/project-agent/v2/capability-bundles/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
      validate: (id: string) => request(`/ai/project-agent/v2/capability-bundles/${encodeURIComponent(id)}/validate`, { method: 'POST' }),
      publish: (id: string) => request(`/ai/project-agent/v2/capability-bundles/${encodeURIComponent(id)}/publish`, { method: 'POST' }),
    },
  },
};

// ── Describe 分析 ──────────────────────────────────────

export const describeApi = {
  get: (fileId: string, sheet?: string, projectId?: string) => {
    const params = new URLSearchParams();
    if (sheet) params.set('sheet', sheet);
    if (projectId) params.set('projectId', projectId);
    return request(`/describe/${encodeURIComponent(fileId)}${params.size ? `?${params}` : ''}`);
  },
  delete: (fileId: string, sheet?: string, projectId?: string) => {
    const params = new URLSearchParams();
    if (sheet) params.set('sheet', sheet);
    if (projectId) params.set('projectId', projectId);
    return request(`/describe/${encodeURIComponent(fileId)}${params.size ? `?${params}` : ''}`, { method: 'DELETE' });
  },
};

export const taskApi = {
  list: (limit = 100) => request(`/tasks?limit=${limit}`),
  get: (id: string) => request(`/tasks/${encodeURIComponent(id)}`),
  cancel: (id: string) => request(`/tasks/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  create: (name: string, payload: unknown) => request('/tasks', { method: 'POST', body: JSON.stringify({ name, payload }) }),
  schedules: () => request('/tasks/schedules'),
};
