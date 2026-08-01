// 后端 API 客户端
import { consumeReconnectingStream, createHttpTransport, HttpTransportError, type ReconnectingStreamState, type TransportRequestInit } from './transport';
import { enqueueOffline, replayOfflineQueue } from './offlineQueue';

export const API_BASE = (((import.meta as any).env?.VITE_API_BASE) || '/api').replace(/\/$/, '');
export type ProjectAgentSessionScope = 'project' | 'unbound' | 'all';

function authorizationHeaders(): Record<string, string> {
  let token = '';
  let tenantId = String((import.meta as any).env?.VITE_TENANT_ID || '');
  try {
    const session = JSON.parse(localStorage.getItem('formflow.session') || 'null');
    token = session?.token || '';
    tenantId = session?.tenantId || localStorage.getItem('formflow.tenant-id') || tenantId;
  } catch { /* ignore */ }
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
  };
}

const transport = createHttpTransport({
  baseUrl: API_BASE,
  authorizationHeaders,
  timeoutMs: 30_000,
  offlineQueue: async ({ path, init }) => {
    const headers = Object.fromEntries(new Headers(init.headers));
    const session = currentSession();
    await enqueueOffline({
      id: headers['x-idempotency-key'] || `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tenantId: session?.tenantId,
      userId: session?.user?.id,
      scopeKey: offlineScopeKey(session),
      projectId: path.match(/^\/projects\/([^/?]+)/)?.[1],
      path,
      method: String(init.method || 'GET').toUpperCase(),
      headers,
      body: typeof init.body === 'string' ? init.body : undefined,
      baseRevision: init.baseRevision,
    });
  },
});

function currentSession(): any {
  try { return JSON.parse(localStorage.getItem('formflow.session') || 'null'); } catch { return null; }
}
function offlineScopeKey(session = currentSession()): string { return `${session?.tenantId || 'local'}:${session?.user?.id || session?.user?.username || 'anonymous'}`; }

export async function replayOfflineRequests(): Promise<void> {
  await replayOfflineQueue(async (item) => {
    try {
      const requestHeaders: Record<string, string> = { ...item.headers };
      if (item.baseRevision) requestHeaders['if-match'] = item.baseRevision;
      delete requestHeaders.Authorization;
      delete requestHeaders.authorization;
      Object.assign(requestHeaders, authorizationHeaders());
      await transport.raw(item.path, { method: item.method, headers: requestHeaders, body: item.body });
      return 'completed';
    } catch (error) {
      if (error instanceof HttpTransportError && error.status === 409) return 'conflict';
      return 'retry';
    }
  }, offlineScopeKey());
}

export function currentOfflineScopeKey(): string { return offlineScopeKey(); }

async function confirmedRequest(path: string, init: TransportRequestInit) {
  try {
    return await transport.json(path, init);
  } catch (error) {
    if (!(error instanceof HttpTransportError) || error.status !== 409) throw error;
    const details = error.details as any;
    const token = details?.status === 'confirmation_required' ? details?.confirmation?.token : '';
    if (!token) throw error;
    return transport.json(path, {
      ...init,
      headers: { ...Object.fromEntries(new Headers(init.headers)), 'x-confirmation-token': token },
    });
  }
}

export async function request<T = any>(path: string, options?: TransportRequestInit): Promise<T> {
  return transport.json<T>(path, options);
}

export async function requestRaw(path: string, options?: TransportRequestInit): Promise<Response> {
  return transport.raw(path, options);
}

/** Read a structured API envelope even when the endpoint intentionally returns 409/422. */
export async function requestResult(path: string, options?: TransportRequestInit): Promise<{ status: number; ok: boolean; body: any }> {
  const result = await transport.result(path, options);
  return { status: result.status, ok: result.ok, body: result.body };
}

// ── 项目管理 ──────────────────────────────────────

export const projectApi = {
  list: () => request('/projects'),
  get: (id: string) => request(`/projects/${encodeURIComponent(id)}`),
  getWithRevision: (id: string) => transport.response<any>(`/projects/${encodeURIComponent(id)}`),
  create: (data: any) => request('/projects', { method: 'POST', headers: { 'x-idempotency-key': crypto.randomUUID() }, body: JSON.stringify(data) }),
  update: (id: string, data: any, metadata?: { baseRevision?: string; idempotencyKey?: string }) => request(`/projects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      ...(metadata?.baseRevision ? { 'if-match': metadata.baseRevision } : {}),
      ...(metadata?.idempotencyKey ? { 'x-idempotency-key': metadata.idempotencyKey } : {}),
    },
    body: JSON.stringify(data),
    queueWhenOffline: true,
    baseRevision: metadata?.baseRevision,
  }),
  updateWithRevision: (id: string, data: any, metadata: { baseRevision: string; idempotencyKey: string }) => transport.response<any>(`/projects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'if-match': metadata.baseRevision, 'x-idempotency-key': metadata.idempotencyKey },
    body: JSON.stringify(data),
  }),
  remove: async (id: string) => {
    const snapshot = await transport.response<any>(`/projects/${encodeURIComponent(id)}`);
    return confirmedRequest(`/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        'if-match': snapshot.revision || '',
        'x-idempotency-key': crypto.randomUUID(),
      },
    });
  },
  clone: (id: string) => request(`/projects/${encodeURIComponent(id)}/clone`, { method: 'POST', headers: { 'x-idempotency-key': crypto.randomUUID() } }),
  runtimeData: (id: string) => request(`/projects/${encodeURIComponent(id)}/runtime-data`),
  batchRows: (input: {
    projectId: string;
    tableId: string;
    sheetName: string;
    baseRevision: string;
    baseVersion?: string;
    adds?: Record<string, unknown>[];
    updates?: Array<{ rowKey: string; changes: Record<string, unknown> }>;
    deletes?: string[];
  }) => confirmedRequest('/projects/data/batch', {
    method: 'POST',
    headers: {
      'if-match': input.baseRevision,
      'x-idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  }) as Promise<any>,
  importDataSource: async (id: string, file: File, options?: { mode?: 'create' | 'replace'; tableId?: string; fileName?: string }) => {
    const snapshot = await transport.response<any>(`/projects/${encodeURIComponent(id)}`);
    const formData = new FormData();
    formData.append('file', file, options?.fileName || file.name);
    formData.append('mode', options?.mode || 'create');
    if (options?.tableId) formData.append('tableId', options.tableId);
    return confirmedRequest(`/projects/${encodeURIComponent(id)}/data-sources/import`, {
      method: 'POST',
      headers: {
        'if-match': snapshot.revision || '',
        'x-idempotency-key': crypto.randomUUID(),
      },
      body: formData,
    }) as Promise<any>;
  },
  downloadPackage: async (id: string, fileName: string) => {
    const response = await transport.raw(`/projects/${encodeURIComponent(id)}/package`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName || id}.formflow`;
    anchor.click();
    URL.revokeObjectURL(url);
  },
  importPackage: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return transport.json<any>('/projects/package/import', {
      method: 'POST',
      body: formData,
    });
  },
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
    return transport.json<any>('/files/upload', { method: 'POST', body: formData });
  },
};

// ── 数据管理 ──────────────────────────────────────

export const dataApi = {
  parse: (fileId: string, sheetName?: string) => request('/data/parse', { method: 'POST', body: JSON.stringify({ fileId, sheetName }) }),
  get: (fileId: string, sheetName: string) => request(`/data/${fileId}/${sheetName}`),
  getRows: (fileId: string, sheetName: string, page = 1, pageSize = 50) => request(`/data/${fileId}/${sheetName}/rows?page=${page}&pageSize=${pageSize}`),
  getColumns: (fileId: string, sheetName: string) => request(`/data/${fileId}/${sheetName}/columns`),
  export: (data: any[], format: string, fileName?: string) => transport.raw('/data/export', { method: 'POST', body: JSON.stringify({ data, format, fileName }) }),
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
  create: (projectId: string, data: any, metadata: { baseRevision: string; idempotencyKey: string }) => request(`/workflows/${projectId}`, { method: 'POST', headers: { 'if-match': metadata.baseRevision, 'x-idempotency-key': metadata.idempotencyKey }, body: JSON.stringify(data) }),
  update: (projectId: string, workflowId: string, data: any, metadata: { baseRevision: string; idempotencyKey: string }) => request(`/workflows/${projectId}/${workflowId}`, { method: 'PUT', headers: { 'if-match': metadata.baseRevision, 'x-idempotency-key': metadata.idempotencyKey }, body: JSON.stringify(data) }),
  remove: (projectId: string, workflowId: string, metadata: { baseRevision: string; idempotencyKey: string; confirmed: true }) => request(`/workflows/${projectId}/${workflowId}`, { method: 'DELETE', headers: { 'if-match': metadata.baseRevision, 'x-idempotency-key': metadata.idempotencyKey, 'x-confirm-destructive': String(metadata.confirmed) } }),
};

// ── 行为管理 ──────────────────────────────────────

export const behaviorApi = {
  list: (projectId: string) => request(`/behaviors/${projectId}`),
  create: (projectId: string, data: any, metadata: { baseRevision: string; idempotencyKey: string }) => request(`/behaviors/${projectId}`, { method: 'POST', headers: { 'if-match': metadata.baseRevision, 'x-idempotency-key': metadata.idempotencyKey }, body: JSON.stringify(data) }),
  update: (projectId: string, behaviorId: string, data: any, metadata: { baseRevision: string; idempotencyKey: string }) => request(`/behaviors/${projectId}/${behaviorId}`, { method: 'PUT', headers: { 'if-match': metadata.baseRevision, 'x-idempotency-key': metadata.idempotencyKey }, body: JSON.stringify(data) }),
  remove: (projectId: string, behaviorId: string, metadata: { baseRevision: string; idempotencyKey: string; confirmed: true }) => request(`/behaviors/${projectId}/${behaviorId}`, { method: 'DELETE', headers: { 'if-match': metadata.baseRevision, 'x-idempotency-key': metadata.idempotencyKey, 'x-confirm-destructive': String(metadata.confirmed) } }),
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
    history: (query: { q?: string; status?: 'active' | 'attention' | 'completed'; projectId?: string; archived?: boolean; cursor?: string; limit?: number } = {}) => { const params = new URLSearchParams(); if (query.q) params.set('q', query.q); if (query.status) params.set('status', query.status); if (query.projectId) params.set('projectId', query.projectId); if (query.archived) params.set('archived', 'true'); if (query.cursor) params.set('cursor', query.cursor); if (query.limit) params.set('limit', String(query.limit)); return request(`/ai/project-agent/v2/sessions/history?${params}`); },
    createSession: (data: { projectId?: string; projectIds?: string[]; title?: string; profileId?: string; capabilityBundleVersionId?: string }) => request('/ai/project-agent/v2/sessions', { method: 'POST', body: JSON.stringify(data) }),
    setProjects: (id: string, data: { projectIds: string[]; currentProjectId?: string }) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}/projects`, { method: 'PUT', body: JSON.stringify(data) }),
    getSession: (id: string, projectId?: string) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
    turn: (id: string, data: { prompt: string; projectId?: string }) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}/turns`, { method: 'POST', body: JSON.stringify(data) }),
    retryTurn: (id: string, projectId?: string) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}/turns/retry`, { method: 'POST', body: JSON.stringify({ projectId }) }),
    confirmPlan: (sessionId: string, planId: string, data: { projectId?: string; requirementsAcknowledged: boolean; requirementRevision: number }) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(sessionId)}/plans/${encodeURIComponent(planId)}/confirm`, { method: 'POST', body: JSON.stringify(data) }),
    control: (id: string, data: { action: 'pause' | 'continue' | 'stop' | 'retry' | 'repair'; projectId?: string }) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}/control`, { method: 'POST', body: JSON.stringify(data) }),
    decideOperation: (sessionId: string, operationId: string, data: { approved: boolean; automatic?: boolean; projectId?: string }) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(sessionId)}/operations/${encodeURIComponent(operationId)}/decision`, { method: 'POST', body: JSON.stringify(data) }),
    archive: (id: string, projectId?: string) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, { method: 'DELETE' }),
    permanentlyDelete: (id: string, projectId?: string) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}/permanent${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, { method: 'DELETE', body: JSON.stringify({ confirmed: true }) }),
    updateMetadata: (id: string, data: { title?: string; pinned?: boolean }, projectId?: string) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, { method: 'PATCH', body: JSON.stringify(data) }),
    restore: (id: string, projectId?: string) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}/restore${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, { method: 'POST' }),
    events: (id: string, afterSeq = 0, projectId?: string) => request(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}/events?afterSeq=${afterSeq}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}`),
    streamEvents: async (id: string, afterSeq: number, onEvent: (event: any) => void, signal?: AbortSignal, projectId?: string, lifecycle?: { onOpen?(): void; onClose?(): void; onState?(state: ReconnectingStreamState): void; reconnect?: boolean }) => {
      const controller = signal ? undefined : new AbortController();
      const activeSignal = signal || controller!.signal;
      const open = async (cursor: number, streamSignal: AbortSignal) => {
        const stream = await transport.stream(`/ai/project-agent/v2/sessions/${encodeURIComponent(id)}/events?afterSeq=${cursor}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}`, { signal: streamSignal });
        return stream.frames;
      };
      const consumeFrame = (frame: { data: string; id?: string }, cursor: number) => {
        try {
          const event = JSON.parse(frame.data);
          onEvent(event);
          return Math.max(cursor, Number(event.seq || frame.id || 0));
        } catch {
          return cursor;
        }
      };
      if (!lifecycle?.reconnect) {
        const frames = await open(afterSeq, activeSignal);
        lifecycle?.onOpen?.();
        try {
          let cursor = afterSeq;
          for await (const frame of frames) cursor = consumeFrame(frame, cursor);
          return cursor;
        } finally {
          lifecycle?.onClose?.();
        }
      }
      return consumeReconnectingStream({
        signal: activeSignal,
        cursor: afterSeq,
        onState: (state) => {
          lifecycle?.onState?.(state);
          if (state === 'connected') lifecycle?.onOpen?.();
          if (state === 'reconnecting' || state === 'disconnected') lifecycle?.onClose?.();
        },
        open,
        onItem: consumeFrame,
      });
    },
    capabilityBundles: {
      list: () => request('/ai/project-agent/v2/capability-bundles'),
      experts: (id: string) => request(`/ai/project-agent/v2/capability-bundles/${encodeURIComponent(id)}/experts`),
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
