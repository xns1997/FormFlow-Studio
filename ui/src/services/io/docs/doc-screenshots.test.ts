import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { loadDocCatalog } from './catalog';
import { DOC_SCREENSHOTS, DOC_SPECIAL_SCREENSHOTS, LEGACY_DOC_DOMAINS, getDocScreenshot } from './doc-screenshots';

test('every catalog document resolves to an existing 2x product screenshot', async () => {
  const entries = await loadDocCatalog();
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    const screenshot = getDocScreenshot(entry);
    assert.match(screenshot.src, /^\/docs\/screenshots\/.+\.png$/);
    assert.ok(screenshot.label);
  }

  const catalogDomains = new Set(entries.map((entry) => entry.domain));
  assert.deepEqual(new Set(Object.keys(DOC_SCREENSHOTS)), catalogDomains);
  for (const domain of [...Object.values(LEGACY_DOC_DOMAINS), 'events' as const]) {
    assert.ok(DOC_SCREENSHOTS[domain]);
  }

  const uniqueSources = [...new Set([...Object.values(DOC_SCREENSHOTS), ...Object.values(DOC_SPECIAL_SCREENSHOTS)].map((item) => item.src))];
  assert.ok(uniqueSources.length > 1);
  for (const src of uniqueSources) {
    const png = await readFile(resolve('ui/public', src.slice(1)));
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png.readUInt32BE(16), 3200);
    assert.equal(png.readUInt32BE(20), 2000);
    const responsive = await readFile(resolve('ui/public', src.slice(1).replace(/\.png$/, '-1x.png')));
    assert.equal(responsive.toString('ascii', 1, 4), 'PNG');
    assert.equal(responsive.readUInt32BE(16), 1600);
    assert.equal(responsive.readUInt32BE(20), 1000);
  }
});
