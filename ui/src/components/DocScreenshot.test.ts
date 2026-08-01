import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DocScreenshot, { DocStepScreenshots } from './DocScreenshot';
import { loadDocCatalog } from '../services/io/docs/catalog';
import { buildDocIllustrationPlan } from '../services/io/docs/doc-illustration-plan';

function escapeAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

test('every catalog document renders an accessible product screenshot', async () => {
  const entries = await loadDocCatalog();
  for (const entry of entries) {
    const markup = renderToStaticMarkup(createElement(DocScreenshot, { entry }));
    const plan = buildDocIllustrationPlan(entry);
    assert.match(markup, /<figure[^>]+data-doc-screenshot=/);
    assert.match(markup, /<img[^>]+width="3200"[^>]+height="2000"/);
    assert.match(markup, /<source[^>]+media="\(max-width: 900px\)"[^>]+-1x\.png/);
    assert.ok(markup.includes(`alt="${escapeAttribute(plan.hero.alt)}"`));
    assert.ok(markup.includes(escapeAttribute(plan.hero.callout)));
    assert.doesNotMatch(markup, /<svg/);

    for (const block of entry.blocks) {
      const stepMarkup = renderToStaticMarkup(createElement(DocStepScreenshots, { entry, blockId: block.id }));
      for (const screenshot of plan.stepsByBlock[block.id] || []) {
        assert.ok(stepMarkup.includes(`alt="${escapeAttribute(screenshot.alt)}"`));
        assert.ok(stepMarkup.includes(escapeAttribute(screenshot.callout)));
      }
      assert.doesNotMatch(stepMarkup, /<svg/);
    }
  }
});
