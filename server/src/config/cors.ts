import type { CorsOptions } from 'cors';
const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173').split(',').map((value) => value.trim()).filter(Boolean);
export const corsOptions: CorsOptions = {
  origin(origin, callback) { if (!origin || origins.includes(origin)) callback(null, true); else callback(new Error(`CORS origin not allowed: ${origin}`)); },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Project-Lock', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86400,
};
