import assert from 'node:assert/strict';
import test from 'node:test';
import { materializeAnalyzedRequirements, refreshRequirementCoverage, validateRequirementTaskCoverage } from './project-agent-requirements';

test('大模型分析结果产生稳定 ID 并保留语义需求', () => {
  const analyzed: any[] = [
    { statement: '选择设备后自动带出设备名称、区域和责任人', domain: 'behavior', acceptanceScenarios: ['选择有效设备后三个字段与档案一致'], risk: 'normal' },
    { statement: '复核不通过时将记录退回处理中', domain: 'workflow', acceptanceScenarios: ['驳回后状态为处理中'], risk: 'normal' },
    { statement: '交付前执行发布预检且不自动发布', domain: 'delivery', acceptanceScenarios: ['生成预检结果且未调用发布'], risk: 'high' },
  ];
  const first = materializeAnalyzedRequirements(analyzed); const second = materializeAnalyzedRequirements(analyzed);
  assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
  assert.deepEqual(first.map((item) => item.domain), ['behavior', 'workflow', 'delivery']);
});

test('需求物化不按标点或换行二次拆句', () => {
  const statement = '员工提交报销后进入待审批，部门负责人可通过或驳回；驳回时必须填写意见。';
  const requirements = materializeAnalyzedRequirements([{ statement, domain: 'workflow', acceptanceScenarios: ['提交后进入待审批', '驳回时空意见被拒绝'], risk: 'normal' }]);
  assert.equal(requirements.length, 1); assert.equal(requirements[0].statement, statement);
});

test('规划保留未覆盖需求供用户修改', () => {
  const requirements = materializeAnalyzedRequirements([{ statement: '需要实现设备信息自动带出', domain: 'behavior', acceptanceScenarios: ['选择设备后字段自动填充'], risk: 'normal' }]);
  const result = validateRequirementTaskCoverage(requirements, []);
  assert.equal(result.valid, false); assert.deepEqual(result.uncovered.map((item) => item.statement), ['需要实现设备信息自动带出']);
});

test('只有任务通过且有需求或场景证据时才标记 verified', () => {
  const requirements = materializeAnalyzedRequirements([{ statement: '需要实现设备信息自动带出', domain: 'behavior', acceptanceScenarios: ['选择设备后字段自动填充'], risk: 'normal' }]); const id = requirements[0].id;
  const task: any = { id: 'behavior', requirementIds: [id], status: 'passed', evidenceArtifactIds: ['evidence'] };
  const without = refreshRequirementCoverage(structuredClone(requirements), [task], [{ id: 'evidence', taskId: 'behavior', kind: 'verification' } as any]);
  assert.equal(without.planComplete, true); assert.equal(without.complete, false);
  const withEvidence = refreshRequirementCoverage(structuredClone(requirements), [task], [{ id: 'evidence', taskId: 'behavior', kind: 'scenario_result', data: { requirementIds: [id] } } as any]);
  assert.equal(withEvidence.complete, true);
});
