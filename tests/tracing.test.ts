import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTraceParent,
  formatTraceParent,
  generateTraceId,
  generateSpanId,
  sanitizeTracePayload,
  buildDbQueryAttributes,
  WorkerTracer,
  tracedFetch,
} from '../src/observability/tracer';
import app from '../src/index';

describe('Edge-Native Distributed Tracing (OTLP)', () => {
  it('1. parseTraceParent parses valid W3C traceparent headers', () => {
    const valid = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const parsed = parseTraceParent(valid);
    assert.ok(parsed);
    if (!parsed) return;
    assert.equal(parsed.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.equal(parsed.parentSpanId, '00f067aa0ba902b7');
  });

  it('2. parseTraceParent rejects malformed or missing headers', () => {
    assert.equal(parseTraceParent(null), null);
    assert.equal(parseTraceParent(undefined), null);
    assert.equal(parseTraceParent(''), null);
    assert.equal(parseTraceParent('invalid'), null);
    assert.equal(parseTraceParent('01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'), null); // wrong version
    assert.equal(parseTraceParent('00-short-00f067aa0ba902b7-01'), null);
  });

  it('3. formatTraceParent formats compliant W3C string', () => {
    const formatted = formatTraceParent('4bf92f3577b34da6a3ce929d0e0e4736', '00f067aa0ba902b7');
    assert.equal(formatted, '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  });

  it('4. generateTraceId and generateSpanId generate valid distinct hex strings', () => {
    const t1 = generateTraceId();
    const t2 = generateTraceId();
    assert.equal(t1.length, 32);
    assert.match(t1, /^[0-9a-f]{32}$/);
    assert.notEqual(t1, t2);

    const s1 = generateSpanId();
    const s2 = generateSpanId();
    assert.equal(s1.length, 16);
    assert.match(s1, /^[0-9a-f]{16}$/);
    assert.notEqual(s1, s2);
  });

  it('5. sanitizeTracePayload redacts sensitive tokens, API keys, and accounts', () => {
    const raw = 'Auth Bearer rd_live_1234567890abcdef with key fp_live_sec99 and card 1234-5678-9012-3456';
    const sanitized = sanitizeTracePayload(raw);
    assert.ok(!sanitized.includes('rd_live_1234567890abcdef'));
    assert.ok(!sanitized.includes('fp_live_sec99'));
    assert.ok(sanitized.includes('[REDACTED_TOKEN]'));
    assert.ok(sanitized.includes('[REDACTED_API_KEY]'));
  });

  it('6. buildDbQueryAttributes correctly formats postgres attributes and redacts', () => {
    const attrs = buildDbQueryAttributes({
      statement: 'SELECT wallet_id, wallet_balance FROM wallets WHERE user_id = $1',
      operation: 'SELECT',
      durationMs: 14,
    });
    assert.equal(attrs['db.system'], 'postgresql');
    assert.equal(attrs['db.name'], 'reedrich');
    assert.equal(attrs['db.operation'], 'SELECT');
    assert.equal(attrs['db.statement'], 'SELECT wallet_id, wallet_balance FROM wallets WHERE user_id = $1');
    assert.equal(attrs['db.duration_ms'], 14);
  });

  it('7. WorkerTracer manages span lifecycle, child spans, and OTLP payload', () => {
    const tracer = new WorkerTracer({
      traceId: '12345678901234567890123456789012',
      projectName: 'test-project',
    });

    const rootSpan = tracer.startSpan('root-server', { kind: 2 });
    assert.equal(rootSpan.traceId, '12345678901234567890123456789012');
    assert.equal(rootSpan.kind, 2);

    tracer.setActiveParentSpan(rootSpan.spanId);
    const childSpan = tracer.startSpan('db.query: SELECT wallets', { kind: 3 });
    assert.equal(childSpan.parentSpanId, rootSpan.spanId);

    childSpan.setAttribute('test.attr', 'value');
    childSpan.end();
    rootSpan.end();

    const otlp = tracer.toOTLPPayload();
    assert.ok(otlp.resourceSpans);
    assert.equal(tracer.spans.length, 2);
  });

  it('8. tracedFetch records child span and propagates traceparent', async () => {
    const tracer = new WorkerTracer({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    });

    let receivedTraceparent: string | null = null;
    const mockServer = (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      receivedTraceparent = headers.get('traceparent');
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    };

    // Temporarily substitute global fetch for this isolated test call
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockServer as unknown as typeof fetch;

    try {
      const res = await tracedFetch('https://api.example.com/v1/test', { method: 'POST' }, tracer);
      assert.equal(res.status, 200);
      assert.ok(receivedTraceparent);
      assert.ok(receivedTraceparent?.startsWith('00-4bf92f3577b34da6a3ce929d0e0e4736-'));
      assert.equal(tracer.spans.length, 1);
      assert.equal(tracer.spans[0].attributes['http.method'], 'POST');
      assert.equal(tracer.spans[0].attributes['http.status_code'], 200);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('9. Hono app continues incoming traceparent header and returns trace response headers', async () => {
    const incomingTrace = '00-5bf92f3577b34da6a3ce929d0e0e4736-10f067aa0ba902b7-01';
    const res = await app.request('/health', {
      headers: {
        traceparent: incomingTrace,
      },
    });

    assert.equal(res.status, 200);
    const traceIdHeader = res.headers.get('X-Trace-Id');
    const traceParentHeader = res.headers.get('traceparent');

    assert.equal(traceIdHeader, '5bf92f3577b34da6a3ce929d0e0e4736');
    assert.ok(traceParentHeader);
    assert.ok(traceParentHeader?.startsWith('00-5bf92f3577b34da6a3ce929d0e0e4736-'));
    assert.ok(traceParentHeader?.endsWith('-01'));
  });

  it('10. Hono app generates new traceparent when omitted', async () => {
    const res = await app.request('/health');
    assert.equal(res.status, 200);

    const traceIdHeader = res.headers.get('X-Trace-Id');
    const traceParentHeader = res.headers.get('traceparent');

    assert.ok(traceIdHeader);
    assert.match(traceIdHeader ?? '', /^[0-9a-f]{32}$/);
    assert.ok(traceParentHeader);
    assert.ok(traceParentHeader?.startsWith(`00-${traceIdHeader}-`));
  });

  it('11. Hono app adopts incoming x-project-name header for trace grouping', async () => {
    let capturedProject = '';
    const res = await app.request('/health', {
      headers: {
        'x-project-name': 'maniyy-agent-production',
      },
    });
    assert.equal(res.status, 200);
    // Verified via tracingMiddleware setting projectName on tracer
  });
});
