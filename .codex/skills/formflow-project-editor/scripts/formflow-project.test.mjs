import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('./formflow-project.mjs', import.meta.url));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'formflow-skill-test-'));
  await writeFile(join(root, 'people.csv'), 'id,name\n1,Ada\n2,Lin\n');
  await writeFile(join(root, 'create.yaml'), `
project: { id: people-app, name: People App }
now: 2026-07-13T00:00:00.000Z
data:
  - id: people
    path: ./people.csv
    sheets: { Sheet1: { key: [id] } }
forms:
  - id: edit-person
    name: Edit Person
    mode: edit
    components:
      - { id: root, type: form, children: [save] }
      - id: save
        type: button
        parentId: root
        props:
          flowTriggers:
            onClick: { enabled: true, workflowId: save-person }
workflows:
  - id: save-person
    name: Save Person
    nodes:
      - { id: input, specId: "generic:value-input" }
      - { id: display, specId: "generic:display-table" }
    edges:
      - { source: input, target: display, sourceHandle: "out:value", targetHandle: "in:data" }
outputs: [{ id: export, name: Export, format: csv }]
`);
  return root;
}

test('creates, validates, inspects, normalizes, and packs deterministically', async () => {
  const root = await fixture(); const project = join(root, 'people.formflow');
  await run(process.execPath, [cli, 'create', join(root, 'create.yaml'), '--out', project]);
  const validation = JSON.parse((await run(process.execPath, [cli, 'validate', project, '--json'])).stdout);
  assert.equal(validation.valid, true);
  const inspected = JSON.parse((await run(process.execPath, [cli, 'inspect', `${project}.zip`, '--json'])).stdout);
  assert.equal(inspected.data[0].sheets[0].key[0], 'id');
  await writeFile(join(root, 'patch.yaml'), `
now: 2026-07-14T00:00:00.000Z
project: { name: People App v2 }
delete: { outputs: [export] }
upsert:
  outputs: [{ id: export-json, name: Export JSON, format: json }]
`);
  const normalized = join(root, 'people-v2.formflow');
  await run(process.execPath, [cli, 'normalize', project, '--spec', join(root, 'patch.yaml'), '--out', normalized]);
  const projectJson = JSON.parse(await readFile(join(normalized, 'project.json'), 'utf8'));
  assert.equal(projectJson.config.name, 'People App v2');
  const zip2 = join(root, 'second.zip');
  await run(process.execPath, [cli, 'pack', normalized, '--out', zip2]);
  assert.deepEqual(await readFile(`${normalized}.zip`), await readFile(zip2));
});

test('rejects an invalid workflow port without publishing output', async () => {
  const root = await fixture();
  const spec = (await readFile(join(root, 'create.yaml'), 'utf8')).replace('out:value', 'out:not-a-port');
  await writeFile(join(root, 'invalid.yaml'), spec);
  await assert.rejects(run(process.execPath, [cli, 'create', join(root, 'invalid.yaml'), '--out', join(root, 'bad.formflow')]), /VALIDATION_FAILED/);
});

test('rejects unknown structural fields during normalization', async () => {
  const root = await fixture(); const project = join(root, 'people.formflow');
  await run(process.execPath, [cli, 'create', join(root, 'create.yaml'), '--out', project]);
  const formPath = join(project, 'forms', 'edit-person.json');
  const form = JSON.parse(await readFile(formPath, 'utf8')); form.futureExtension = true;
  await writeFile(formPath, JSON.stringify(form, null, 2));
  await writeFile(join(root, 'empty-patch.yaml'), 'now: 2026-07-15T00:00:00.000Z\n');
  await assert.rejects(run(process.execPath, [cli, 'normalize', project, '--spec', join(root, 'empty-patch.yaml'), '--out', join(root, 'normalized.formflow')]), /VALIDATION_FAILED/);
});
