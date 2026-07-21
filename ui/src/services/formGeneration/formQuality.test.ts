import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent } from '../../project/types';
import { buildDevelopmentQuality, generateFormTestCases, runGeneratedFormTests } from './formQuality';

const components: DesignComponent[] = [
  { id: 'name', type: 'input', x: 0, y: 0, width: 100, height: 40, fieldBinding: '姓名', props: { name: '姓名', required: true } },
  { id: 'age', type: 'number', x: 0, y: 50, width: 100, height: 40, fieldBinding: '年龄', props: { name: '年龄', min: 18, max: 60 } },
  { id: 'dept', type: 'select', x: 0, y: 100, width: 100, height: 40, fieldBinding: '部门', props: { name: '部门', options: [{ label: '技术部', value: 'tech' }] } },
];

test('generated tests cover normal, empty, boundary, wrong type and enum outside values', () => {
  const cases = generateFormTestCases(components);
  assert.deepEqual(new Set(cases.map((item) => item.category)), new Set(['normal', 'required', 'boundary', 'type', 'enum']));
  const results = runGeneratedFormTests(components, cases);
  assert.equal(results.every((item) => item.passed), true, results.filter((item) => !item.passed).map((item) => item.name).join(','));
});

test('quality summary exposes task readiness and publish blockers from the same checks', () => {
  const quality = buildDevelopmentQuality(components, [], []);
  assert.equal(quality.tasks.length, 5);
  assert.equal(quality.coverage, 100);
  assert.equal(quality.readyToPublish, true);
});
