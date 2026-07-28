import assert from 'node:assert/strict';
import test from 'node:test';
import { currentExpertRepairDecision, MAX_CURRENT_EXPERT_REPAIRS } from './project-agent-expert-repair';

test('ordinary execution and verification failures stay with the current expert', () => {
  assert.equal(currentExpertRepairDecision({ message: '任务验收失败：1 个结构错误', repairCycles: 0 }), 'repair_current');
  assert.equal(currentExpertRepairDecision({ message: 'INVALID_ARGUMENT：item.type 无效', repairCycles: 1 }), 'repair_current');
});

test('current expert repair is bounded and does not absorb infrastructure or safety failures', () => {
  assert.equal(currentExpertRepairDecision({ message: '任务验收失败', repairCycles: MAX_CURRENT_EXPERT_REPAIRS }), 'request_assistance');
  assert.equal(currentExpertRepairDecision({ message: 'UNAVAILABLE: 模型服务不可用', repairCycles: 0 }), 'retry_infrastructure');
  assert.equal(currentExpertRepairDecision({ message: 'FORBIDDEN: 越权操作', repairCycles: 0 }), 'return_to_coordinator');
  assert.equal(currentExpertRepairDecision({ message: '质量门禁未通过', repairCycles: 0, qualityGateFailure: true }), 'request_assistance');
});
