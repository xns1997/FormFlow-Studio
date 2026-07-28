import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layoutSource = readFileSync(new URL('../pages/home/Layout.tsx', import.meta.url), 'utf8');
const drawerSource = readFileSync(new URL('./ProjectAgentDrawer.tsx', import.meta.url), 'utf8');

test('project agent is mounted from the top navigation with the nav launcher variant', () => {
  assert.match(layoutSource, /<ProjectAgentDrawer projectId=\{projectId \|\| undefined\} launcherVariant="nav" \/>/);
});

test('layout no longer keeps a separate floating project agent mount at the page root', () => {
  assert.equal((layoutSource.match(/<ProjectAgentDrawer projectId=\{projectId \|\| undefined\}/g) || []).length, 1);
});

test('project agent drawer supports a fixed right sidebar variant from the top navigation', () => {
  assert.match(drawerSource, /launcherVariant = 'floating'/);
  assert.match(drawerSource, /project-agent-nav-trigger nav-link/);
  assert.match(drawerSource, /resolveDrawerPosition\(launcherVariant, width\)/);
  assert.match(drawerSource, /project-agent-drawer-anchored/);
  assert.match(drawerSource, /createPortal\(drawerNode, document\.body\)/);
  assert.match(drawerSource, /top:\s*topbarHeight/);
});
