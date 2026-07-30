import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexSource = readFileSync(join(root, 'server/src/index.ts'), 'utf8');
const specPath = join(root, 'server/public/swagger.json');
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const operationTemplateSource = readFileSync(join(root, 'server/src/services/template-operation-center.ts'), 'utf8');
const imports = new Map();

for (const match of indexSource.matchAll(/import\s+(?:\{\s*([A-Za-z0-9_]+)\s*\}|([A-Za-z0-9_]+))\s+from\s+'(\.\/routes\/[^']+)'/g)) {
  imports.set(match[1] || match[2], `${match[3]}.ts`);
}

const mounts = [];
for (const match of indexSource.matchAll(/app\.use\(\s*'([^']+)'\s*,\s*([A-Za-z0-9_]+)\s*\)/g)) {
  if (!match[1].startsWith('/api/')) continue;
  const source = imports.get(match[2]);
  if (source) mounts.push({ prefix: match[1].slice(4), source });
}

const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
const generatedPaths = {};
for (const { prefix, source } of mounts) {
  const routeSource = readFileSync(join(root, 'server/src', source), 'utf8');
  for (const match of routeSource.matchAll(/router\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g)) {
    const method = match[1];
    if (!methods.has(method)) continue;
    const suffix = match[3] === '/' ? '' : match[3];
    const path = `${prefix}${suffix}`.replace(/:([A-Za-z0-9_]+)/g, '{$1}').replace(/\/+/g, '/') || '/';
    const parameters = [...path.matchAll(/\{([^}]+)\}/g)].map((parameter) => ({
      name: parameter[1], in: 'path', required: true, schema: { type: 'string' },
    }));
    generatedPaths[path] ||= {};
    generatedPaths[path][method] = {
      tags: [prefix.split('/').filter(Boolean)[0] || 'system'],
      summary: `${method.toUpperCase()} ${path}`,
      ...(parameters.length ? { parameters } : {}),
      responses: { 200: { description: 'Successful response' }, 400: { $ref: '#/components/responses/BadRequest' } },
    };
  }
}

spec.info.version = '1.2.0';
spec.info.description = 'FormFlow public HTTP API. Generated route coverage is enriched by curated operation descriptions.';
spec.components ||= {};
spec.components.responses ||= {};
spec.components.responses.BadRequest = { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
for (const [path, operations] of Object.entries(spec.paths || {})) {
  generatedPaths[path] = { ...(generatedPaths[path] || {}), ...operations };
}
spec.paths = Object.fromEntries(Object.entries(generatedPaths).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
const operationTemplates = [...operationTemplateSource.matchAll(
  /base\(\{\s*id:\s*'([^']+)',\s*category:\s*'([^']+)',\s*name:\s*'([^']+)',\s*description:\s*'([^']+)'/g,
)].map((match) => ({ id: match[1], category: match[2], name: match[3], description: match[4] }));
writeFileSync(join(root, 'server/public/operation-templates.json'), `${JSON.stringify(operationTemplates, null, 2)}\n`);
console.log(`Generated ${Object.values(spec.paths).reduce((sum, operations) => sum + Object.keys(operations).length, 0)} OpenAPI operations across ${Object.keys(spec.paths).length} paths and ${operationTemplates.length} operation template references.`);
