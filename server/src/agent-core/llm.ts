/**
 * LLM channel wrapper. Only chat/chatStream are used (no agent runtime).
 * Falls back across a profile's routes on retryable RPC errors.
 */
import { llmManagement } from '../services/llm-management';
import type { ModelPurpose } from '../services/llm-management';
import { isRetryableLlmRpcError, llmProviderClient, type LlmMessage } from '../services/llm-provider-client';
import type { AgentThread, RunContext } from './types';

export interface ChatOptions {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  responseSchema?: Record<string, unknown>;
  /** 模型路由用途：plan/decision/summarize/verify（缺省 decision）。 */
  purpose?: ModelPurpose;
}

function connectionFor(thread: AgentThread, run: RunContext, routeIndex: number, purpose: ModelPurpose = 'decision') {
  const profile = llmManagement.resolveProfile(thread.profileId, { tenantId: run.tenantId, projectId: thread.currentProjectId });
  const route = routeIndex === 0
    ? llmManagement.resolvePurposeRoute(profile, purpose, { tenantId: run.tenantId, projectId: thread.currentProjectId })
    : profile.routes[routeIndex];
  if (!route) throw new Error('模型 Profile 没有可用路由');
  return { profile, route, connection: llmManagement.resolveConnection(route, { tenantId: run.tenantId, projectId: thread.currentProjectId }) };
}

export async function chat(thread: AgentThread, run: RunContext, options: ChatOptions) {
  const profile = llmManagement.resolveProfile(thread.profileId, { tenantId: run.tenantId, projectId: thread.currentProjectId });
  const purpose = options.purpose ?? 'decision';
  let lastError: unknown;
  for (let index = 0; index < profile.routes.length; index += 1) {
    try {
      const route = index === 0
        ? llmManagement.resolvePurposeRoute(profile, purpose, { tenantId: run.tenantId, projectId: thread.currentProjectId })
        : profile.routes[index];
      if (!route) throw new Error('模型 Profile 没有可用路由');
      return await llmProviderClient.chat({
        connection: llmManagement.resolveConnection(route, { tenantId: run.tenantId, projectId: thread.currentProjectId }),
        messages: options.messages,
        temperature: options.temperature ?? profile.defaults.temperature ?? 0.2,
        maxTokens: options.maxTokens ?? profile.defaults.maxTokens ?? 2048,
        responseSchema: options.responseSchema,
        requestId: run.requestId,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableLlmRpcError(error) || index === profile.routes.length - 1) throw error;
    }
  }
  throw lastError || new Error('没有可用模型路由');
}

export function streamChat(thread: AgentThread, run: RunContext, options: ChatOptions, onEvent: (event: { type: string; data: any; requestId: string }) => void) {
  const { profile, connection } = connectionFor(thread, run, 0, options.purpose ?? 'decision');
  return llmProviderClient.chatStream({
    connection,
    messages: options.messages,
    temperature: options.temperature ?? profile.defaults.temperature ?? 0.2,
    maxTokens: options.maxTokens ?? profile.defaults.maxTokens ?? 2048,
    responseSchema: options.responseSchema,
    requestId: run.requestId,
  }, onEvent);
}
