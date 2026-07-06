// 后端 API 客户端

export const API_BASE = (((import.meta as any).env?.VITE_API_BASE) || '/api').replace(/\/$/, '');

export async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
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

// ── Describe 分析 ──────────────────────────────────────

export const describeApi = {
  get: (fileId: string, sheet?: string) => request(`/describe/${fileId}${sheet ? `?sheet=${encodeURIComponent(sheet)}` : ''}`),
  delete: (fileId: string) => request(`/describe/${fileId}`, { method: 'DELETE' }),
};
