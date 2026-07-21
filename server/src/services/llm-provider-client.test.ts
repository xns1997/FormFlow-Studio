import assert from 'node:assert/strict';
import test from 'node:test';
import * as grpc from '@grpc/grpc-js';
import { llmProviderGrpcTarget, normalizeLlmProviderRpcError } from './llm-provider-client';

test('llm provider defaults to an IPv4 loopback target', () => {
  assert.equal(llmProviderGrpcTarget, process.env.LLM_PROVIDER_GRPC_URL || '127.0.0.1:50051');
});

test('unavailable provider errors include an actionable recovery command', () => {
  const error = normalizeLlmProviderRpcError({
    code: grpc.status.UNAVAILABLE,
    details: 'No connection established',
    message: 'connect ECONNREFUSED ::1:50051',
  });

  assert.equal(error.httpStatus, 503);
  assert.match(error.message, /npm run dev:provider/);
  assert.match(error.message, /npm run dev:all/);
  assert.doesNotMatch(error.message, /::1/);
});

test('upstream provider errors are not mislabeled as a stopped local service', () => {
  const error = normalizeLlmProviderRpcError({
    code: grpc.status.UNAVAILABLE,
    details: '模型服务返回 429: rate limit exceeded',
    message: 'upstream unavailable',
  });

  assert.equal(error.httpStatus, 503);
  assert.match(error.message, /429/);
  assert.doesNotMatch(error.message, /npm run dev:provider/);
});
