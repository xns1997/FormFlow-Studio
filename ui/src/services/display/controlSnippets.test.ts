import assert from 'node:assert/strict';
import test from 'node:test';
import { getControlSnippetExamples } from './controlSnippets';

test('control snippet examples prefer peer fields, buttons and result tables when available', () => {
  const examples = getControlSnippetExamples({
    currentField: 'customerName',
    eventName: 'onClick',
    components: [
      { id: 'customer_name', type: 'text', x: 0, y: 0, width: 0, height: 0, fieldBinding: 'customerName', props: { name: 'customerName' } },
      { id: 'status_hint', type: 'text', x: 0, y: 0, width: 0, height: 0, fieldBinding: 'statusHint', props: { name: 'statusHint' } },
      { id: 'save_lead', type: 'button', x: 0, y: 0, width: 0, height: 0, props: { name: 'saveLead' } },
      { id: 'approval_results', type: 'table', x: 0, y: 0, width: 0, height: 0, fieldBinding: 'approvalResults', props: { name: 'approvalResults' } },
    ],
  });
  assert.ok(examples.some((item) => item.code.includes('controls.customerName.value')));
  assert.ok(examples.some((item) => item.code.includes('controls.statusHint.value')));
  assert.ok(examples.some((item) => item.code.includes('controls.saveLead.disabled')));
  assert.ok(examples.some((item) => item.code.includes('controls.approvalResults.value')));
  assert.ok(examples.some((item) => item.code.includes('nextSequence(')));
  assert.ok(examples.some((item) => item.code.includes('fillForm(')));
  assert.ok(examples.some((item) => item.code.includes('requireFields(')));
  assert.ok(examples.some((item) => item.code.includes('resetForm(')));
});

test('control snippet examples still provide a readable current-control example when peers are absent', () => {
  const examples = getControlSnippetExamples({
    currentField: 'amount',
    eventName: 'onChange',
    components: [
      { id: 'amount', type: 'number', x: 0, y: 0, width: 0, height: 0, fieldBinding: 'amount', props: { name: 'amount' } },
    ],
  });
  assert.equal(examples[0]?.id, 'read-current-control');
  assert.ok(examples[0]?.code.includes('controls.amount.value'));
});
