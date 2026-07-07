import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readProjectPackage } from '../../../server/src/services/project-package-store';
import { importFromZip } from '../../project/packageManager';
import type { ProjectStructure } from '../../project/types';

const repositoryRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const projectsDir = join(repositoryRoot, 'projects', 'data');

function loadExample(): ProjectStructure {
  const project = readProjectPackage('example_employee_mgmt');
  assert.ok(project);
  return project as ProjectStructure;
}

test('project storage contains the generated industry examples plus support ops package', () => {
  assert.deepEqual(readdirSync(projectsDir).filter((item) => item.endsWith('.formflow')).sort(), [
    'example_check_valve_selection.formflow',
    'example_employee_mgmt.formflow',
    'example_renewable_generation.formflow',
    'example_student_info.formflow',
    'example_support_ops.formflow',
  ]);
  const project = loadExample();
  assert.equal(project.config.version, '2.3.0');
  assert.equal(project.srcTable.length, 1);
  assert.equal(project.workflows.length, 5);
  assert.equal(project.release?.mode, 'use');
  assert.equal(project.outputs.length, 3);
  assert.equal(project.forms?.length ?? 0, 3);
});

test('the distributable example zip is recognized as FormFlow v2 and reconstructs the project', async () => {
  const buffer = readFileSync(join(repositoryRoot, 'projects', 'example_student_info.zip'));
  const file = new File([buffer], 'example_student_info.zip', { type: 'application/zip' });
  const project = await importFromZip(file);
  assert.ok(project);
  assert.equal(project.config.id, 'example_student_info');
  assert.equal(project.release?.mode, 'use');
  assert.equal(project.srcTable[0].id, 'students');
  assert.equal(project.workflows[2].id, 'example_student_info_wf_stats');
  assert.equal(project.forms.length, 3);
});
