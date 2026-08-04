/**
 * LLM channel wrapper. Only chat/chatStream are used (no agent runtime).
 * Falls back across a profile's routes on retryable RPC errors.
 */
import { llmManagement } from '../services/llm-management';
import { isRetryableLlmRpcError, llmProviderClient, type LlmMessage } from '../services/llm-provider-client';
import type { AgentThread, RunContext } from './types';

export interface ChatOptions {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  responseSchema?: Record<string, unknown>;
}

function connectionFor(thread: AgentThread, run: RunContext, routeIndex: number) {
  const profile = llmManagement.resolveProfile(thread.profileId, { tenantId: run.tenantId, projectId: thread.currentProjectId });
  const route = profile.routes[routeIndex];
  if (!route) throw new Error('模型 Profile 没有可用路由');
  return { profile, route, connection: llmManagement.resolveConnection(route, { tenantId: run.tenantId, projectId: thread.currentProjectId }) };
}

export async function chat(thread: AgentThread, run: RunContext, options: ChatOptions) {
  const profile = llmManagement.resolveProfile(thread.profileId, { tenantId: run.tenantId, projectId: thread.currentProjectId });
  let lastError: unknown;
  for (let index = 0; index < profile.routes.length; index += 1) {
    try {
      return await llmProviderClient.chat({
        connection: llmManagement.resolveConnection(profile.routes[index], { tenantId: run.tenantId, projectId: thread.currentProjectId }),
        messages: options.messages,
        temperature: options.temperature ?? profile.defaults.temperature ?? 0.2,
        maxTokens: options.maxTokens ?? profile.defaults.maxTokens,
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
  const { profile, connection } = connectionFor(thread, run, 0);
  return llmProviderClient.chatStream({
    connection,
    messages: options.messages,
    temperature: options.temperature ?? profile.defaults.temperature ?? 0.2,
    maxTokens: options.maxTokens ?? profile.defaults.maxTokens,
    responseSchema: options.responseSchema,
    requestId: run.requestId,
  }, onEvent);
}
