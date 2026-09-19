import type { Context, Next } from 'hono';
import { ServiceError } from '../services/errors';

export interface AppVariables {
  requestId: string;
  userId?: string;
}

export async function observabilityMiddleware(
  c: Context<{ Variables: AppVariables }>,
  next: Next
): Promise<void | Response> {
  const start = Date.now();
  const incomingRequestId = c.req.header('X-Request-ID') || c.req.header('x-request-id');
  const requestId = incomingRequestId && incomingRequestId.trim().length > 0
    ? incomingRequestId.trim()
    : crypto.randomUUID();

  c.set('requestId', requestId);

  try {
    await next();
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    if (err instanceof ServiceError) {
      console.log(JSON.stringify({
        requestId,
        method: c.req.method,
        path: c.req.path,
        errorCode: err.code,
        message: err.message,
        field: err.field,
        durationMs,
      }));
    } else {
      console.error(JSON.stringify({
        requestId,
        method: c.req.method,
        path: c.req.path,
        errorCode: 'INTERNAL',
        message: err instanceof Error ? err.message : String(err),
        durationMs,
      }));
    }
    throw err;
  } finally {
    const duration = Date.now() - start;
    c.header('X-Request-ID', requestId);
    c.header('X-Response-Time', `${duration}ms`);
  }
}
