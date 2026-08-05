import type { CorsOptions } from 'cors';
const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173').split(',').map((value) => value.trim()).filter(Boolean);
/** CORS 配置（白名单来源 + 凭据）。 */
export const corsOptions: CorsOptions = {
  origin(origin, callback) { if (!origin || origins.includes(origin)) callback(null, true); else callback(new Error(`CORS origin not allowed: ${origin}`)); },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'If-Match',
    'X-Project-Lock',
    'X-Request-Id',
    'X-Idempotency-Key',
    'X-Confirmation-Token',
    'X-Tenant-Id',
  ],
  exposedHeaders: ['ETag', 'X-Project-Revision', 'X-Request-Id'],
  maxAge: 86400,
};
