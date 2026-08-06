/**
 * 小任务序列产物核验：用 requireProject 对最终项目做逐项断言。
 * 用法：npx tsx scripts/verify-small-tasks.ts <tempRoot> <projectId>
 */
const [tempRoot, projectId] = process.argv.slice(2);
if (!tempRoot || !projectId) {
  console.error('用法：npx tsx scripts/verify-small-tasks.ts <tempRoot> <projectId>');
  process.exit(2);
}
const { join } = await import('node:path');
process.env.FORMFLOW_PROJECTS_DIR = join(tempRoot, 'projects');
process.env.FORMFLOW_DATA_DIR = join(tempRoot, 'data');
const { requireProject, validateProjectModel } = await import('../server/src/services/project-authoring');

const project = requireProject(projectId);
const checks: Array<[string, boolean, string]> = [];
const add = (name: string, ok: boolean, detail = '') => checks.push([name, ok, detail]);

add('项目存在且元信息齐全', Boolean(project?.config?.id) && Boolean(project?.config?.name), `${project?.config?.id || '?'} · ${project?.config?.name || '?'}`);
const report = validateProjectModel(project);
add('结构校验通过', report.valid, report.errors?.slice(0, 3).map((e: any) => `${e.code}@${e.path}`).join('；') || '');

const tables = project.srcTable || [];
add('至少 2 张数据表', tables.length >= 2, `实际 ${tables.length}`);
for (const table of tables) {
  for (const sheet of table.sheets || []) {
    const rows = Number(sheet.rowCount ?? sheet.rows?.length ?? 0);
    const keys = sheet.config?.keyFields || [];
    add(`表 ${table.id} 主键+示例数据`, keys.length > 0 && rows >= 2, `keys=${JSON.stringify(keys)} rows=${rows}`);
  }
}

const forms = project.forms || [];
add('至少 2 个表单', forms.length >= 2, `实际 ${forms.length}`);
for (const form of forms) {
  const comps = form.design?.components?.length || 0;
  const binds = form.design?.bindings?.length || 0;
  add(`表单 ${form.id} 控件+绑定`, comps >= 1 && binds >= 1, `comps=${comps} binds=${binds}`);
}

const ruleText = forms.map((form: any) => String(form.ruleCode || '')).join('\n');
add('员工表单规则（require($姓名,$手机号)）', /require\(\$姓名/.test(ruleText) && /手机号/.test(ruleText), forms.filter((form: any) => form.ruleCode).map((form: any) => `${form.id}: ${String(form.ruleCode).slice(0, 60)}`).join('；') || '无');

const testing = project.testing || {};
const runs = testing.runs || [];
add('回归测试运行且通过', runs.length > 0 && runs.at(-1)?.passed === true, `runs=${runs.length} lastPassed=${runs.at(-1)?.passed}`);

add('发布预检配置就绪', Boolean(project.release?.mode) && Boolean(project.release?.defaultFormId), JSON.stringify({ mode: project.release?.mode, defaultFormId: project.release?.defaultFormId }));

let failed = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
}
console.log(failed ? `\n核验失败 ${failed} 项` : '\n核验全部通过');
process.exit(failed ? 1 : 0);
