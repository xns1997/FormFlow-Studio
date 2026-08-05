import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const docsRequiringMermaid = [
  'docs/readme/beginner-tutorial.md',
  'docs/readme/getting-started.md',
  'docs/readme/overview.md',
  'docs/readme/ai-project-editing.md',
  'docs/project-creation-spec.md',
  'docs/llm-tools-mcp.md',
  'docs/llm-provider.md',
  'docs/pgvector.md',
  'docs/plugin-api-spec.md',
  'docs/low-friction-form-authoring-plan.md',
  'docs/template-operation-center-plan.md',
  'docs/proposals/editor-mode-switching.md',
  'docs/templates/operation-template-catalog.md',
  'docs/templates/crud-project-template.md',
  'docs/behavior-rule-syntax.md',
  'docs/behavior-event-reference.md',
  'docs/readme/mermaid-flowchart-guidelines.md',
  'ui/src/services/io/docs/markdown/behavior-rule-syntax-overview.md',
  'ui/src/services/io/docs/markdown/behavior-rule-syntax-grammar.md',
  'ui/src/services/io/docs/markdown/behavior-rule-syntax-execution.md',
  'ui/src/services/io/docs/markdown/behavior-rule-syntax-examples.md',
  'ui/src/services/io/docs/markdown/flow-nodes-behavior.md',
  'ui/src/services/io/docs/markdown/flow-nodes-scenario.md',
  'ui/src/services/io/docs/markdown/flow-nodes-data-processing.md',
  'ui/src/services/io/docs/markdown/flow-nodes-output.md',
  'ui/src/services/io/docs/markdown/flow-nodes-ml.md',
  'ui/src/services/io/docs/markdown/flow-nodes-excel-edit.md',
  'ui/src/services/io/docs/markdown/flow-nodes-xlsx.md',
  'ui/src/services/io/docs/markdown/getting-started-main-flow.md',
  'ui/src/services/io/docs/markdown/what-is-formflow-data-flow.md',
  'ui/src/services/io/docs/markdown/template-usage-logic-flow.md',
  'ui/src/services/io/docs/markdown/task-understand-create-flow.md',
  'ui/src/services/io/docs/markdown/task-import-model-flow.md',
  'ui/src/services/io/docs/markdown/task-generate-design-flow.md',
  'ui/src/services/io/docs/markdown/task-behavior-workflow-flow.md',
  'ui/src/services/io/docs/markdown/task-apply-templates-flow.md',
  'ui/src/services/io/docs/markdown/task-test-quality-flow.md',
  'ui/src/services/io/docs/markdown/task-use-export-flow.md',
  'ui/src/services/io/docs/markdown/task-package-release-flow.md',
  'ui/src/services/io/docs/markdown/troubleshooting-primary-key-conflict-flow.md',
  'ui/src/services/io/docs/markdown/troubleshooting-excel-import-failed-flow.md',
  'ui/src/services/io/docs/markdown/troubleshooting-submit-validation-flow.md',
  'ui/src/services/io/docs/markdown/troubleshooting-field-linkage-flow.md',
  'ui/src/services/io/docs/markdown/troubleshooting-workflow-call-flow.md',
  'ui/src/services/io/docs/markdown/troubleshooting-release-blocked-flow.md',
  'ui/src/services/io/docs/markdown/troubleshooting-mcp-tool-call-flow.md',
  'ui/src/services/io/docs/markdown/case-customer-intake-flow.md',
  'ui/src/services/io/docs/markdown/case-inventory-maintenance-flow.md',
  'ui/src/services/io/docs/markdown/case-approval-linkage-flow.md',
  'ui/src/services/io/docs/markdown/case-analysis-release-flow.md',
  'ui/src/services/io/docs/markdown/crud-quick-patterns-flow.md',
  '表单编排框架设计.md',
] as const;

const docsExplicitlyWithoutMermaid = [
  'README.md',
  'CHANGELOG.md',
  'docs/readme/README.md',
  'docs/readme/project-layout.md',
  'docs/agent-eval/README.md',
  'docs/agent-eval/baseline.md',
  'research-external-integration-visualization.md',
] as const;

const outOfScopePrefixes = [
  '.codex/',
  'docs/changelog/',
  'docs/compose/plans/',
  'todos/',
] as const;

const outOfScopeExact = [
  'AGENTS.md',
  'CLAUDE.md',
  'CODEX.md',
  'GRILL-ANALYSIS-AGENT-REWRITE.md',
] as const;

function listMarkdownFiles(root: string) {
  const results: string[] = [];
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const relative = join(current, entry.name).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        queue.push(relative);
        continue;
      }
      if (entry.isFile() && relative.endsWith('.md')) results.push(relative);
    }
  }

  return results.sort();
}

function isInAuditScope(path: string) {
  if (outOfScopeExact.includes(path as typeof outOfScopeExact[number])) return false;
  if (outOfScopePrefixes.some((prefix) => path.startsWith(prefix))) return false;
  if (path.startsWith('docs/')) return true;
  if (path.startsWith('ui/src/services/io/docs/markdown/')) return true;
  return [
    'README.md',
    'CHANGELOG.md',
    'research-external-integration-visualization.md',
    '表单编排框架设计.md',
  ].includes(path);
}

function getMermaidBlocks(content: string) {
  return [...content.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)].map((match) => match[1].trim());
}

test('every in-scope markdown doc is either mermaid-required or explicitly exempt', () => {
  const allMarkdown = [
    ...listMarkdownFiles('docs'),
    ...listMarkdownFiles('ui/src/services/io/docs/markdown'),
    ...['README.md', 'CHANGELOG.md', 'research-external-integration-visualization.md', '表单编排框架设计.md'],
  ].filter((path, index, array) => array.indexOf(path) === index);

  const covered = new Set([
    ...docsRequiringMermaid,
    ...docsExplicitlyWithoutMermaid,
  ]);

  for (const path of allMarkdown.filter(isInAuditScope)) {
    assert.ok(covered.has(path as never), `unclassified markdown doc: ${path}`);
  }
});

test('docs that require flowcharts all contain mermaid diagrams', () => {
  for (const path of docsRequiringMermaid) {
    const content = readFileSync(path, 'utf8');
    assert.ok(getMermaidBlocks(content).length > 0, path);
  }
});

test('all in-scope mermaid diagrams follow the allowed top-level styles and quoted flowchart labels', () => {
  const allMarkdown = [
    ...listMarkdownFiles('docs'),
    ...listMarkdownFiles('ui/src/services/io/docs/markdown'),
    ...['README.md', 'CHANGELOG.md', 'research-external-integration-visualization.md', '表单编排框架设计.md'],
  ].filter((path, index, array) => array.indexOf(path) === index);

  for (const path of allMarkdown.filter(isInAuditScope)) {
    const content = readFileSync(path, 'utf8');
    for (const block of getMermaidBlocks(content)) {
      const firstLine = block.split('\n')[0]?.trim();
      assert.ok(
        ['flowchart LR', 'flowchart TD', 'sequenceDiagram'].includes(firstLine),
        `${path}: ${firstLine}`,
      );
      assert.doesNotMatch(block, /\bgraph\s+(TD|LR)\b/, path);
      if (firstLine.startsWith('flowchart')) {
        assert.doesNotMatch(block, /\[[^"\]\n][^\]\n]*\]/, `${path}: unquoted node label`);
      }
    }
  }
});
