const DEFAULT_TOOL_RESULT_MAX_CHARS = 32_000;

function jsonChars(value: unknown) {
  try { return JSON.stringify(value).length; } catch { return Number.POSITIVE_INFINITY; }
}

function previewValue(value: unknown, depth: number, arrayLimit: number): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value;
  if (depth >= 6) return Array.isArray(value) ? `[数组，共 ${value.length} 项]` : '[对象已压缩]';
  if (Array.isArray(value)) {
    const items = value.slice(0, arrayLimit).map((item) => previewValue(item, depth + 1, arrayLimit));
    if (value.length > arrayLimit) items.push({ __truncatedItems: value.length - arrayLimit });
    return items;
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 60).map(([key, item]) => [key, previewValue(item, depth + 1, arrayLimit)]));
  }
  return String(value);
}

/** Keep persisted events and provider checkpoints bounded without hiding that data was omitted. */
export function compactAgentToolResult<T>(value: T, maxChars = DEFAULT_TOOL_RESULT_MAX_CHARS): T | Record<string, unknown> {
  const originalChars = jsonChars(value);
  if (originalChars <= maxChars) return value;
  for (const arrayLimit of [20, 10, 5, 2]) {
    const preview = previewValue(value, 0, arrayLimit);
    const compacted = { __formflowTruncated: true, originalChars, maxChars, preview };
    if (jsonChars(compacted) <= maxChars) return compacted;
  }
  const serialized = (() => { try { return JSON.stringify(value); } catch { return String(value); } })();
  let previewChars = Math.max(0, maxChars - 256);
  while (previewChars > 0) {
    const compacted = { __formflowTruncated: true, originalChars, maxChars, previewText: serialized.slice(0, previewChars) };
    if (jsonChars(compacted) <= maxChars) return compacted;
    previewChars = Math.floor(previewChars * 0.75);
  }
  return { __formflowTruncated: true, originalChars, maxChars };
}

const contextNoiseKeys = new Set(['requestId', 'toolCallId', 'tool_call_id', 'artifactId', 'taskId', 'stepId', 'revision', 'baseRevision', 'idempotencyKey', 'confirmationToken']);

function usefulToolValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[已压缩]';
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => usefulToolValue(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !contextNoiseKeys.has(key) && !key.startsWith('__'))
    .slice(0, 40).map(([key, item]) => [key, usefulToolValue(item, depth + 1)]));
  return typeof value === 'string' && value.length > 1200 ? `${value.slice(0, 1200)}…` : value;
}

/** A concise observation for the model's next tool decision. Full audit data remains in persisted events. */
export function compactToolObservation(toolName: string, result: any, maxChars = 12_000) {
  const error = result?.error;
  const nextStep = error ? toolFailureGuidance(error) : undefined;
  const observation = {
    ok: result?.ok === true,
    status: result?.status || (result?.ok ? 'succeeded' : 'failed'),
    summary: result?.ok ? `${toolName} 已完成` : `${toolName} 未完成：${error?.message || '工具返回失败'}`,
    data: usefulToolValue(result?.data),
    error: error ? {
      code: error.code, message: error.message, path: error.path, retryable: error.retryable === true, nextStep,
      expected: usefulToolValue(error.details?.expectedShape), received: usefulToolValue(error.details?.receivedShape),
      issues: usefulToolValue(error.details?.issues), suggestedArguments: usefulToolValue(error.details?.suggestedArguments),
      correctionInstruction: error.details?.correctionInstruction,
    } : undefined,
    confirmation: result?.status === 'confirmation_required' ? usefulToolValue(result.confirmation?.impact) : undefined,
  };
  return compactAgentToolResult(observation, maxChars);
}

export function toolFailureGuidance(error: any, repeated = false) {
  if (repeated) return '相同方法已失败：不要重放同一工具和参数结构。先读取目标资源与工具 Schema，判断根因后改参数、改用 update/upsert，或明确报告能力阻断。';
  const code = String(error?.code || '').toUpperCase();
  if (/NOT_FOUND/.test(code)) return '先使用 list/get/inspect 确认真实资源和 ID；目标本应存在时修正引用，目标尚未创建时再按需创建。';
  if (/EXISTS|DUPLICATE/.test(code)) return '资源已存在；先读取它，改用 update/upsert 补全，不要重复 create。';
  if (/INVALID|VALIDATION|SCHEMA|ARGUMENT|SYNTAX|REFERENCE|REQUIRED|UNKNOWN/.test(code)) return `只纠正本次工具参数，不要重启任务或原样重放。根据${error?.path ? ` ${error.path} 的` : ''}错误位置、issues、expected 和 suggestedArguments 重新构造；缺少业务值时先读取真实资源。`;
  if (/FORBIDDEN|PERMISSION|OUT_OF_SCOPE|NOT_AVAILABLE/.test(code)) return '不要重试越权操作；明确说明所需角色、能力或用户确认，将阻断项交回协调器。';
  if (error?.retryable === true || /TIMEOUT|UNAVAILABLE|DEADLINE|TEMPORAR/.test(code)) return '这是瞬时错误；保持同一业务意图有限重试，再次失败时先检查服务状态。';
  return '先读取当前资源状态和相关 Schema，说明失败原因，更换参数或工具策略后再执行；不要原样重放。';
}
