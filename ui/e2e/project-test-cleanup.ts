import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';

export async function deleteTestProject(request: APIRequestContext, projectId?: string) {
  if (!projectId?.startsWith('proj_')) return;
  const baseUrl = `http://localhost:3103/api/projects/${encodeURIComponent(projectId)}`;
  const snapshot = await request.get(baseUrl);
  if (snapshot.status() === 404) return;
  const revision = snapshot.headers()['x-project-revision'] || snapshot.headers().etag?.replace(/^W\//, '').replace(/^"|"$/g, '');
  if (!revision) return;
  const headers = {
    'if-match': revision,
    'x-idempotency-key': randomUUID(),
  };
  const initial = await request.delete(baseUrl, { headers });
  if (initial.status() !== 409) return;
  const body = await initial.json().catch(() => null);
  const token = body?.confirmation?.token;
  if (!token) return;
  await request.delete(baseUrl, {
    headers: { ...headers, 'x-confirmation-token': token },
  });
}
