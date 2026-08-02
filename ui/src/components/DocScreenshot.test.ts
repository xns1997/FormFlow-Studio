import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocStepScreenshots } from './DocScreenshot';
import { loadDocCatalog } from '../services/io/docs/catalog';
import { buildDocIllustrationPlan } from '../services/io/docs/doc-illustration-plan';

function escapeAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

test('only instructional steps render accessible product screenshots', async () => {
  const entries = await loadDocCatalog();
  let renderedSteps = 0;
  for (const entry of entries) {
    const plan = buildDocIllustrationPlan(entry);
    for (const block of entry.blocks) {
      const stepMarkup = renderToStaticMarkup(createElement(DocStepScreenshots, { entry, blockId: block.id }));
      for (const screenshot of plan.stepsByBlock[block.id] || []) {
        assert.match(stepMarkup, /<figure[^>]+data-doc-screenshot=/);
        assert.match(stepMarkup, /<img[^>]+width="3200"[^>]+height="2000"/);
        assert.match(stepMarkup, /<source[^>]+media="\(max-width: 900px\)"[^>]+-1x\.png/);
        assert.ok(stepMarkup.includes(`alt="${escapeAttribute(screenshot.alt)}"`));
        assert.ok(stepMarkup.includes(escapeAttribute(screenshot.callout)));
        assert.ok(stepMarkup.includes(`<strong>步骤 ${screenshot.sequence}</strong>`));
        assert.ok(stepMarkup.includes(`<span>${escapeAttribute(screenshot.instruction)}</span>`));
        assert.doesNotMatch(stepMarkup, /Playwright|高清截图/);
        renderedSteps += 1;
      }
      assert.doesNotMatch(stepMarkup, /<svg/);
    }
  }
  const syntaxReference = entries.find((entry) => entry.id === 'topic:behavior-rule-syntax');
  assert.ok(syntaxReference);
  assert.equal(renderToStaticMarkup(createElement(DocStepScreenshots, { entry: syntaxReference, blockId: 'overview' })), '');
  const bestPractices = entries.find((entry) => entry.id === 'topic:best-practices');
  assert.ok(bestPractices);
  assert.equal(renderToStaticMarkup(createElement(DocStepScreenshots, { entry: bestPractices, blockId: 'section-1' })), '');
  assert.ok(renderedSteps >= 30);
});
