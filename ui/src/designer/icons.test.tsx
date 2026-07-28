import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesignerIcon } from './icons';

test('workflow uses a registered vector icon instead of rendering its key as text', () => {
  const html = renderToStaticMarkup(<DesignerIcon name="workflow" />);
  assert.match(html, /<svg/);
  assert.doesNotMatch(html, />workflow</);
});
