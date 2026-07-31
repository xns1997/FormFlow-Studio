/**
 * Async route handler wrapper — catches all unhandled errors in async route handlers
 * and forwards them to Express error middleware. Prevents server crash from unhandled
 * promise rejections in route handlers.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void | Response>;

/**
 * Wraps an async route handler so any thrown error or rejected promise
 * is caught and forwarded to Express error middleware.
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => { ... }));
 */
export function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      // Ensure the error is an Error object
      const error = err instanceof Error ? err : new Error(String(err));
      next(error);
    });
  };
}

/**
 * Safe JSON response helper — never throws, always sends a response.
 */
export function safeRespond(res: Response, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  }
}
