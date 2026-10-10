import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../index';
import {
  WorkerTracer,
  parseTraceParent,
  formatTraceParent,
  sanitizeTracePayload,
} from '../observability/tracer';

export const tracingMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const rawTraceParent = c.req.header('traceparent') || c.req.header('Traceparent');
  const parsed = parseTraceParent(rawTraceParent);

  const env = c.env as unknown as Record<string, string | undefined> | undefined;
  const environment = env?.ENVIRONMENT || 'production';
  const incomingProject = c.req.header('x-project-name') || c.req.header('x-phoenix-project');
  const projectName = incomingProject || env?.PHOENIX_PROJECT_NAME || `reedrich-mcp-${environment}`;
  const endpoint = env?.PHOENIX_ENDPOINT || 'https://phoenix.membran.app/v1/traces';
  const apiKey = env?.PHOENIX_API_KEY || 'phx_adm_sec_e4b1c2d3f4a5b6c7_sec';

  const tracer = new WorkerTracer({
    endpoint,
    apiKey,
    environment,
    projectName,
    serviceName: 'reedrich-mcp',
    serviceVersion: '1.18.0',
    traceId: parsed?.traceId,
    parentSpanId: parsed?.parentSpanId,
  });

  c.set('tracer', tracer);

  const urlObj = new URL(c.req.url);
  const rootSpan = tracer.startSpan(`HTTP ${c.req.method} ${c.req.path}`, {
    kind: 2, // SERVER
    attributes: {
      'openinference.span.kind': 'CHAIN',
      'http.method': c.req.method,
      'http.url': c.req.url,
      'http.route': c.req.path,
      'http.user_agent': c.req.header('user-agent') || 'unknown',
      'input.value': `${c.req.method} ${urlObj.pathname}${urlObj.search}`,
    },
  });
  tracer.rootSpan = rootSpan;
  tracer.setActiveParentSpan(rootSpan.spanId);

  try {
    await next();
    rootSpan.setAttribute('http.status_code', c.res.status);
    if (c.res.status >= 400) {
      rootSpan.setStatus({ code: 2, message: `HTTP status ${c.res.status}` });
    } else {
      rootSpan.setStatus({ code: 1 });
    }
  } catch (err) {
    rootSpan.recordException(err);
    throw err;
  } finally {
    const userId = c.get('userId');
    if (userId) {
      rootSpan.setAttribute('user.id', userId);
    }
    c.res.headers.set('traceparent', formatTraceParent(tracer.traceId, rootSpan.spanId));
    c.res.headers.set('X-Trace-Id', tracer.traceId);
    let resClone: Response | null = null;
    const contentType = c.res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        resClone = c.res.clone();
      } catch {
        resClone = null;
      }
    }
    let executionCtx: { waitUntil: (promise: Promise<unknown>) => void } | undefined = undefined;
    try {
      executionCtx = c.executionCtx;
    } catch {
      // Context has no ExecutionContext (e.g. in unit test or standalone runtime)
    }
    const finalizeAndFlush = async () => {
      if (resClone) {
        try {
          const rawText = await resClone.text();
          if (rawText) {
            rootSpan.setAttribute(
              'output.value',
              sanitizeTracePayload(rawText, { isOutput: true }).slice(0, 4000)
            );
            rootSpan.setAttribute('output.mime_type', 'application/json');
          }
        } catch {
          /* ignore clone read error */
        }
      }
      rootSpan.end();
      await tracer.flush();
    };
    if (executionCtx && typeof executionCtx.waitUntil === 'function') {
      executionCtx.waitUntil(finalizeAndFlush());
    } else {
      void finalizeAndFlush();
    }
  }
};
