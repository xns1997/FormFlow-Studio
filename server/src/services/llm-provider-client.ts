import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { env } from '../config/env';
import { markAiRpcFailure, markAiRpcSuccess } from './runtime-health';

export interface ProviderConnectionSnapshot { provider: string; baseUrl: string; apiKey: string; model: string; timeoutMs: number; headers?: Record<string, string>; }
export interface LlmMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string; toolCallId?: string; }
export interface LlmChatInput { connection: ProviderConnectionSnapshot; messages: LlmMessage[]; temperature?: number; maxTokens?: number; tools?: unknown[]; responseSchema?: Record<string, unknown>; requestId: string; }

const protoPath = join(env.repositoryRoot, 'llm-provider', 'proto', 'llm_provider.proto');
const definition = protoLoader.loadSync(protoPath, { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true });
const descriptor = grpc.loadPackageDefinition(definition) as any;
const Service = descriptor.formflow.llm.v1.LlmProvider;

function credentials() {
  const caPath = process.env.LLM_PROVIDER_TLS_CA;
  const certPath = process.env.LLM_PROVIDER_TLS_CERT;
  const keyPath = process.env.LLM_PROVIDER_TLS_KEY;
  if (caPath) return grpc.credentials.createSsl(readFileSync(caPath), keyPath && certPath ? readFileSync(keyPath) : undefined, keyPath && certPath ? readFileSync(certPath) : undefined);
  if (process.env.LLM_PROVIDER_REQUIRE_MTLS === 'true') throw new Error('LLM_PROVIDER_REQUIRE_MTLS=true 时必须配置 LLM_PROVIDER_TLS_CA/CERT/KEY');
  return grpc.credentials.createInsecure();
}

function metadata() {
  const value = new grpc.Metadata();
  const secret = process.env.LLM_PROVIDER_SERVICE_TOKEN || 'formflow-provider-development-token';
  const expires = Math.floor(Date.now() / 1000) + 60;
  const unsigned = `v1.${expires}.${randomUUID()}`;
  const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('hex')}`;
  value.set('authorization', `Bearer ${token}`);
  return value;
}

function parseJson(value: string, fallback: unknown) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }

export const llmProviderGrpcTarget = process.env.LLM_PROVIDER_GRPC_URL || '127.0.0.1:50051';
const grpcMaxMessageBytes = Number(process.env.LLM_PROVIDER_GRPC_MAX_MESSAGE_BYTES || 16 * 1024 * 1024);

export class LlmProviderRpcError extends Error {
  constructor(message: string, public grpcCode: number, public httpStatus: number) { super(message); }
}

export function normalizeLlmProviderRpcError(error: Pick<grpc.ServiceError, 'code' | 'details' | 'message'>) {
  const httpStatus = error.code === grpc.status.UNAVAILABLE ? 503 : error.code === grpc.status.DEADLINE_EXCEEDED ? 504 : error.code === grpc.status.FAILED_PRECONDITION || error.code === grpc.status.INVALID_ARGUMENT ? 422 : 502;
  const unavailable = error.code === grpc.status.UNAVAILABLE;
  const localConnectionFailure = unavailable && /no connection established|failed to connect to all addresses|econnrefused|socket closed/i.test(`${error.details} ${error.message}`);
  const message = localConnectionFailure
    ? `模型服务未运行或无法连接（目标 ${llmProviderGrpcTarget}）。本地请运行 npm run dev:provider，或使用 npm run dev:all。`
    : error.details || error.message;
  return new LlmProviderRpcError(message, error.code, httpStatus);
}

class LlmProviderClient {
  private client = new Service(llmProviderGrpcTarget, credentials(), {
    ...(process.env.LLM_PROVIDER_TLS_SERVER_NAME ? { 'grpc.ssl_target_name_override': process.env.LLM_PROVIDER_TLS_SERVER_NAME } : {}),
    'grpc.max_receive_message_length': grpcMaxMessageBytes,
    'grpc.max_send_message_length': grpcMaxMessageBytes,
  });

  private unary(method: string, payload: unknown, timeoutMs?: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const callback = (error: grpc.ServiceError | null, response: unknown) => {
        if (error) {
          const normalized = normalizeLlmProviderRpcError(error);
          if ([grpc.status.UNAVAILABLE, grpc.status.DEADLINE_EXCEEDED, grpc.status.UNAUTHENTICATED, grpc.status.INTERNAL].includes(error.code)) markAiRpcFailure(normalized);
          else markAiRpcSuccess();
          reject(normalized);
          return;
        }
        markAiRpcSuccess();
        resolve(response);
      };
      if (timeoutMs) this.client[method](payload, metadata(), { deadline: Date.now() + timeoutMs }, callback);
      else this.client[method](payload, metadata(), callback);
    });
  }

  async health() { return this.unary('Health', {}, 3_000); }
  async listModels(connection: ProviderConnectionSnapshot, requestId: string) { const response = await this.unary('ListModels', { connection, requestId }); return { models: response.models || [], requestId: response.requestId }; }
  async listPlugins(requestId: string) { const response = await this.unary('ListPlugins', { requestId }); return { plugins: response.plugins || [], requestId: response.requestId }; }

  async chat(input: LlmChatInput) {
    const response = await this.unary('Chat', {
      connection: input.connection, messages: input.messages, temperature: input.temperature ?? 0.2, maxTokens: input.maxTokens || 0,
      toolsJson: JSON.stringify(input.tools || []), responseSchemaJson: input.responseSchema ? JSON.stringify(input.responseSchema) : '', requestId: input.requestId,
    });
    return { content: response.content || '', model: response.model, usage: parseJson(response.usageJson, {}), toolCalls: parseJson(response.toolCallsJson, []), structured: parseJson(response.structuredJson, undefined), requestId: response.requestId };
  }

  chatStream(input: LlmChatInput, onEvent: (event: { type: string; data: any; requestId: string }) => void) {
    const call = this.client.ChatStream({ connection: input.connection, messages: input.messages, temperature: input.temperature ?? 0.2, maxTokens: input.maxTokens || 0, toolsJson: JSON.stringify(input.tools || []), responseSchemaJson: input.responseSchema ? JSON.stringify(input.responseSchema) : '', requestId: input.requestId }, metadata());
    call.on('data', (event: any) => onEvent({ type: event.type, data: parseJson(event.dataJson, {}), requestId: event.requestId }));
    return { call, done: new Promise<void>((resolve, reject) => { call.on('end', resolve); call.on('error', (error: grpc.ServiceError) => reject(normalizeLlmProviderRpcError(error))); }) };
  }

  async embed(connection: ProviderConnectionSnapshot, input: string[], requestId: string) {
    const response = await this.unary('Embed', { connection, input, requestId });
    return { embeddings: (response.embeddings || []).sort((a: any, b: any) => a.index - b.index).map((item: any) => item.values), model: response.model, usage: parseJson(response.usageJson, {}), requestId: response.requestId };
  }

  async startAgent(definition: unknown, input: unknown, connection: ProviderConnectionSnapshot, requestId: string, tenantId = '', projectId = '') {
    return this.normalizeRun(await this.unary('StartAgentRun', { definitionJson: JSON.stringify(definition), inputJson: JSON.stringify(input), connection, requestId, tenantId, projectId }));
  }
  async resumeAgent(runId: string, toolResults: unknown[], requestId: string, connection: ProviderConnectionSnapshot) { return this.normalizeRun(await this.unary('ResumeAgentRun', { runId, toolResultsJson: JSON.stringify(toolResults), requestId, connection })); }
  async getAgent(runId: string, requestId: string) { return this.normalizeRun(await this.unary('GetAgentRun', { runId, requestId })); }
  private normalizeRun(response: any) { return { runId: response.runId, status: response.status, state: parseJson(response.stateJson, {}), events: parseJson(response.eventsJson, []), requestId: response.requestId, tenantId: response.tenantId || '', projectId: response.projectId || '' }; }
}

export const llmProviderClient = new LlmProviderClient();

export function isRetryableLlmRpcError(error: unknown) {
  return error instanceof LlmProviderRpcError && [grpc.status.UNAVAILABLE, grpc.status.DEADLINE_EXCEEDED, grpc.status.RESOURCE_EXHAUSTED].includes(error.grpcCode);
}
