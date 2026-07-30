import { llmManagement } from '../services/llm-management';
import { isRetryableLlmRpcError, llmProviderClient, type LlmMessage } from '../services/llm-provider-client';
import type { AgentSessionV2 } from '../services/project-agent-v2-store';
import type { RunContext } from './types';

/**
 * Send a chat request to the LLM provider with automatic route failover.
 * Tries each route in the profile until one succeeds.
 */
export async function chat(
  session: AgentSessionV2,
  run: RunContext,
  messages: LlmMessage[],
  responseSchema?: Record<string, unknown>,
  maxTokens = 8192,
) {
  const profile = llmManagement.resolveProfile(session.profileId, {
    tenantId: run.tenantId,
    projectId: session.projectId,
  });
  let lastError: unknown;
  for (const [index, route] of profile.routes.entries()) {
    try {
      return await llmProviderClient.chat({
        connection: llmManagement.resolveConnection(route, {
          tenantId: run.tenantId,
          projectId: session.projectId,
        }),
        messages,
        responseSchema,
        maxTokens,
        temperature: profile.defaults.temperature,
        requestId: run.requestId,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableLlmRpcError(error) || index === profile.routes.length - 1) throw error;
    }
  }
  throw lastError || new Error('没有可用模型路由');
}
