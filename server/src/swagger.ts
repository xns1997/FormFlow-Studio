import { Router } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { REPOSITORY_ROOT } from './config/paths';
const router = Router(); const specPath = join(REPOSITORY_ROOT, 'server', 'public', 'swagger.json');
router.get('/openapi.json', (_req, res) => res.json(JSON.parse(readFileSync(specPath, 'utf8'))));
router.get('/', (_req, res) => res.type('html').send(`<!doctype html><html><head><title>FormFlow API</title><meta charset="utf-8"><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:'/api-docs/openapi.json',dom_id:'#swagger-ui',deepLinking:true,persistAuthorization:true})</script></body></html>`));
export { router as swaggerRouter };
