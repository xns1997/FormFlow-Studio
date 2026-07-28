export const MAX_CURRENT_EXPERT_REPAIRS = 2;

export function currentExpertRepairDecision(input: { message: string; repairCycles: number; qualityGateFailure?: boolean }) {
  const infrastructureFailure = /UNAVAILABLE|DEADLINE|temporar|timeout|连接|模型路由|服务不可用/i.test(input.message);
  const hardBoundaryFailure = /越权|与已确认计划|用户拒绝|FORBIDDEN|PERMISSION|OUT_OF_SCOPE/i.test(input.message);
  if (!input.qualityGateFailure && !infrastructureFailure && !hardBoundaryFailure && input.repairCycles < MAX_CURRENT_EXPERT_REPAIRS) return 'repair_current' as const;
  if (infrastructureFailure) return 'retry_infrastructure' as const;
  if (hardBoundaryFailure) return 'return_to_coordinator' as const;
  return 'request_assistance' as const;
}
