import assert from 'node:assert/strict';
import test from 'node:test';
import { getConformanceCases } from './conformance/cases';
import { coverageGaps, evaluateCase } from './conformance/runner';
import { compileBehaviorDslRegex } from './parserRegex';
import { compileBehaviorDsl } from './parser';
import { compilationIdentity } from './fuzzer';

test('conformance suite passes all documented MUST constraints and FFR codes', () => {
  const failures: string[] = [];
  for (const def of getConformanceCases()) {
    const result = evaluateCase(def);
    if (!result.passed) failures.push(`${def.id}: ${result.problems.join('; ')}`);
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('conformance suite covers every reachable FFR code with at least one case', () => {
  assert.deepEqual(coverageGaps(), [], `FFR 码缺少符合性用例：${coverageGaps().join('、')}`);
});

test('new parser matches legacy parser exactly on conformance corpus (except documented fixes)', () => {
  for (const def of getConformanceCases()) {
    const oldResult = compileBehaviorDslRegex(def.source, def.context);
    const newResult = compileBehaviorDsl(def.source, def.context);
    if (def.expect.exact !== false) {
      assert.equal(compilationIdentity(oldResult, newResult), null, `${def.id}: 差分不一致`);
      assert.deepEqual(newResult.diagnostics, oldResult.diagnostics, `${def.id}: 诊断不完全一致`);
      assert.deepEqual(newResult.preview, oldResult.preview, `${def.id}: preview 不一致`);
    } else {
      assert.equal(compilationIdentity(oldResult, newResult, { strict: false }), null, `${def.id}: 差分不一致（新检查/修复用例）`);
    }
  }
});

test('compile output is byte-deterministic (G4)', () => {
  const source = 'when $部门 == "技术部" -> show(@tech-stack); require($技术栈)\nelse -> hide(@tech-stack); clear($技术栈)\ncompute $合计 = $数量 * $单价 watch($数量, $单价)';
  const first = JSON.stringify(compileBehaviorDsl(source));
  for (let index = 0; index < 50; index += 1) {
    assert.equal(JSON.stringify(compileBehaviorDsl(source)), first);
  }
});
