import assert from 'node:assert/strict';
import test from 'node:test';
import { compileAgentRequirements, refreshRequirementCoverage, validateRequirementTaskCoverage } from './project-agent-requirements';

test('需求编译产生稳定 ID 和领域场景', () => {
  const prompt = '- 选择设备后自动带出设备名称、区域和责任人\n- 复核不通过时退回处理中\n- 最终执行交付预检';
  const first = compileAgentRequirements(prompt); const second = compileAgentRequirements(prompt);
  assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
  assert.deepEqual(first.map((item) => item.domain), ['behavior', 'workflow', 'delivery']);
});

test('规划拒绝没有任务覆盖的 supported 需求', () => {
  const requirements = compileAgentRequirements('需要实现设备信息自动带出');
  assert.throws(() => validateRequirementTaskCoverage(requirements, []), /规划未覆盖需求/);
});

test('只有任务通过且有需求或场景证据时才标记 verified', () => {
  const requirements = compileAgentRequirements('需要实现设备信息自动带出'); const id = requirements[0].id;
  const task: any = { id: 'behavior', requirementIds: [id], status: 'passed', evidenceArtifactIds: ['evidence'] };
  const without = refreshRequirementCoverage(structuredClone(requirements), [task], [{ id: 'evidence', taskId: 'behavior', kind: 'verification' } as any]);
  assert.equal(without.complete, false);
  const withEvidence = refreshRequirementCoverage(structuredClone(requirements), [task], [{ id: 'evidence', taskId: 'behavior', kind: 'scenario_result' } as any]);
  assert.equal(withEvidence.complete, true);
});
