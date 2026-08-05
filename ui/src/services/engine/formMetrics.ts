export interface FormInteractionMetrics {
  startedAt: number;
  firstConfigurationAt?: number;
  firstSubmitAt?: number;
  successfulSubmits: number;
  failedSubmits: number;
  fieldChanges: number;
  repairSuccesses: number;
  undoCount: number;
  retryCount: number;
  byControlType: Record<string, { changes: number; submitSuccesses: number; submitFailures: number; repairSuccesses: number; retries: number; undos: number }>;
}

/** 创建空表单交互指标。 */
export function createFormInteractionMetrics(now = Date.now()): FormInteractionMetrics {
  return { startedAt: now, successfulSubmits: 0, failedSubmits: 0, fieldChanges: 0, repairSuccesses: 0, undoCount: 0, retryCount: 0, byControlType: {} };
}

/** 记录一次表单交互事件到指标。 */
export function recordFormMetric(metrics: FormInteractionMetrics, event: 'configure' | 'change' | 'submit-success' | 'submit-failure' | 'repair-success' | 'undo' | 'retry', now = Date.now(), controlType?: string) {
  const next = { ...metrics };
  next.byControlType = Object.fromEntries(Object.entries(metrics.byControlType || {}).map(([key, value]) => [key, { ...value }])) as FormInteractionMetrics['byControlType'];
  if (controlType) {
    const current = next.byControlType[controlType] || { changes: 0, submitSuccesses: 0, submitFailures: 0, repairSuccesses: 0, retries: 0, undos: 0 };
    if (event === 'change') current.changes += 1;
    if (event === 'submit-success') current.submitSuccesses += 1;
    if (event === 'submit-failure') current.submitFailures += 1;
    if (event === 'repair-success') current.repairSuccesses += 1;
    if (event === 'retry') current.retries += 1;
    if (event === 'undo') current.undos += 1;
    next.byControlType[controlType] = current;
  }
  if (event === 'configure' && next.firstConfigurationAt == null) next.firstConfigurationAt = now;
  if (event === 'change') next.fieldChanges += 1;
  if (event === 'submit-success') { next.successfulSubmits += 1; if (next.firstSubmitAt == null) next.firstSubmitAt = now; }
  if (event === 'submit-failure') { next.failedSubmits += 1; if (next.firstSubmitAt == null) next.firstSubmitAt = now; }
  if (event === 'repair-success') next.repairSuccesses += 1;
  if (event === 'undo') next.undoCount += 1;
  if (event === 'retry') next.retryCount += 1;
  return next;
}

/** 汇总表单交互指标。 */
export function summarizeFormMetrics(metrics: FormInteractionMetrics) {
  const attempts = metrics.successfulSubmits + metrics.failedSubmits;
  return {
    timeToFirstSubmitMs: metrics.firstSubmitAt == null ? null : Math.max(0, metrics.firstSubmitAt - metrics.startedAt),
    firstSubmitSuccessRate: attempts ? metrics.successfulSubmits / attempts : null,
    averageFieldChangesPerSubmit: attempts ? metrics.fieldChanges / attempts : 0,
    repairSuccessRate: metrics.failedSubmits ? metrics.repairSuccesses / metrics.failedSubmits : null,
    retries: metrics.retryCount,
    undos: metrics.undoCount,
    byControlType: metrics.byControlType || {},
  };
}

/** 持久化表单交互指标。 */
export function persistFormInteractionMetrics(formId: string, metrics: FormInteractionMetrics, storage?: Pick<Storage, 'setItem'>) {
  if (!formId) return;
  const target = storage || (typeof localStorage !== 'undefined' ? localStorage : undefined);
  try { target?.setItem(`formflow:metrics:${formId}`, JSON.stringify(metrics)); } catch { /* private mode/quota: metrics remain in memory */ }
}

/** 恢复表单交互指标（无记录返回 null）。 */
export function restoreFormInteractionMetrics(formId: string, storage?: Pick<Storage, 'getItem'>): FormInteractionMetrics | null {
  if (!formId) return null;
  const target = storage || (typeof localStorage !== 'undefined' ? localStorage : undefined);
  try {
    const raw = target?.getItem(`formflow:metrics:${formId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FormInteractionMetrics;
    if (!parsed || typeof parsed.startedAt !== 'number' || typeof parsed.successfulSubmits !== 'number') return null;
    return { ...createFormInteractionMetrics(parsed.startedAt), ...parsed, byControlType: parsed.byControlType || {} };
  } catch { return null; }
}
