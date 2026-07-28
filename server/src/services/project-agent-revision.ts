export const MAX_REVISION_RECOMPUTES = 2;

export function applyRuntimeRevision<T extends Record<string, any>>(argumentsValue: T, currentRevision?: string) {
  if (!currentRevision) return { arguments: argumentsValue, replaced: false, previousRevision: argumentsValue.baseRevision as string | undefined };
  const previousRevision = argumentsValue.baseRevision as string | undefined;
  return {
    arguments: { ...argumentsValue, baseRevision: currentRevision } as T,
    replaced: previousRevision !== currentRevision,
    previousRevision,
  };
}

export function nextRevisionConflictCount(current = 0) {
  const count = current + 1;
  return { count, blocked: count > MAX_REVISION_RECOMPUTES };
}

export function approvalRevisionChanged(projectId: string | undefined, approvedRevision: string | undefined, currentRevision: string | undefined) {
  return Boolean(projectId && currentRevision && (!approvedRevision || approvedRevision !== currentRevision));
}

export function requiresProjectStateRead(requiredProjectId: string | undefined, targetProjectId: string | undefined, toolRisk: string | undefined) {
  return Boolean(requiredProjectId && targetProjectId === requiredProjectId && toolRisk !== 'read');
}

export function projectChangedToolObservation() {
  return {
    ok: false,
    error: {
      code: 'PROJECT_STATE_CHANGED',
      message: '项目在操作前发生了变化。运行时已刷新最新状态；请先重新读取目标资源，基于新状态重新计算操作，不要重放旧参数。',
      retryable: true,
      details: { readRequired: true },
    },
    meta: {},
  };
}

export function revisionReadRequiredObservation() {
  return {
    ok: false,
    error: {
      code: 'PROJECT_STATE_READ_REQUIRED',
      message: '项目状态已变化；再次写入前必须先读取目标资源并重新计算修改。',
      retryable: true,
    },
    meta: {},
  };
}
