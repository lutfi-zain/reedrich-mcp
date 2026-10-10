import { ProtobufTraceSerializer } from '@opentelemetry/otlp-transformer';

/**
 * WorkerTracer: Lightweight fetch-based OpenTelemetry OTLP tracer tailored for Cloudflare Workers.
 * Exports traces directly to Arize Phoenix (/v1/traces) with zero Node.js dependencies.
 */

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface SpanEvent {
  name: string;
  timeUnixNano: string;
  attributes?: SpanAttributes;
}

export type SpanStatusCode = 0 | 1 | 2; // 0 = UNSET, 1 = OK, 2 = ERROR

export interface SpanStatus {
  code: SpanStatusCode;
  message?: string;
}

export interface TracerConfig {
  endpoint?: string;
  apiKey?: string;
  serviceName?: string;
  serviceVersion?: string;
  environment?: string;
  projectName?: string;
  traceId?: string;
  parentSpanId?: string;
}

export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function parseTraceParent(header?: string | null): { traceId: string; parentSpanId: string } | null {
  if (!header) return null;
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i.exec(header.trim());
  if (!match) return null;
  return {
    traceId: match[1].toLowerCase(),
    parentSpanId: match[2].toLowerCase(),
  };
}

export function formatTraceParent(traceId: string, spanId: string): string {
  return `00-${traceId.toLowerCase()}-${spanId.toLowerCase()}-01`;
}

function toUnixNano(ms: number): string {
  const fullMs = Math.floor(ms);
  const fraction = ms - fullMs;
  const nanoPart = Math.floor(fraction * 1_000_000);
  return `${BigInt(fullMs) * 1_000_000n + BigInt(nanoPart)}`;
}

export interface SanitizeTraceOptions {
  isOutput?: boolean;
}

/**
 * Redacts sensitive credentials, tokens, passwords, and API keys from trace payloads.
 */
export function sanitizeTracePayload(value: unknown, _options: SanitizeTraceOptions = {}): string {
  let raw: string;
  if (typeof value === 'string') {
    raw = value;
  } else {
    try {
      raw = JSON.stringify(value ?? '');
    } catch {
      raw = '[unserializable]';
    }
  }

  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/\b(?:rd_live_|fp_live_|gsk_|AIza|phx_adm_sec_)[A-Za-z0-9_-]+/g, '[REDACTED_API_KEY]')
    .replace(/\bpassword["']?\s*[:=]\s*["'][^"']+["']/gi, 'password="[REDACTED]"')
    .replace(/\b(?:\d[ -]*?){13,16}\d\b/g, '[REDACTED_ACCOUNT]');
}

export function buildDbQueryAttributes(params: {
  statement: string;
  operation?: string;
  durationMs?: number;
}): SpanAttributes {
  const statement = params.statement.trim();
  const inferredOp = params.operation || statement.split(/\s+/)[0]?.toUpperCase() || 'QUERY';
  const sanitized = sanitizeTracePayload(statement);
  return {
    'openinference.span.kind': 'TOOL',
    'tool.name': `postgres.${inferredOp.toLowerCase()}`,
    'db.system': 'postgresql',
    'db.name': 'reedrich',
    'db.operation': inferredOp,
    'db.statement': sanitized,
    'input.value': sanitized,
    ...(params.durationMs !== undefined ? { 'db.duration_ms': params.durationMs } : {}),
  };
}

export class WorkerSpan {
  public readonly traceId: string;
  public readonly spanId: string;
  public readonly parentSpanId?: string;
  public readonly name: string;
  public readonly kind: number;
  public readonly startTimeUnixNano: string;
  public endTimeUnixNano?: string;
  public attributes: Record<string, string | number | boolean> = {};
  public events: SpanEvent[] = [];
  public status: SpanStatus = { code: 0 };
  private isEnded = false;

  constructor(options: {
    traceId: string;
    spanId: string;
    name: string;
    parentSpanId?: string;
    kind?: number;
    startTimeMs?: number;
    attributes?: SpanAttributes;
  }) {
    this.traceId = options.traceId;
    this.spanId = options.spanId;
    this.name = options.name;
    this.parentSpanId = options.parentSpanId;
    this.kind = options.kind ?? 1; // 1 = INTERNAL, 2 = SERVER, 3 = CLIENT
    this.startTimeUnixNano = toUnixNano(options.startTimeMs ?? Date.now());

    if (options.attributes) {
      this.setAttributes(options.attributes);
    }
    if (!this.attributes['openinference.span.kind']) {
      this.attributes['openinference.span.kind'] = 'CHAIN';
    }
  }

  setAttribute(key: string, value: string | number | boolean | undefined): this {
    if (value !== undefined) {
      this.attributes[key] = value;
    }
    return this;
  }

  setAttributes(attrs: SpanAttributes): this {
    for (const [key, value] of Object.entries(attrs)) {
      this.setAttribute(key, value);
    }
    return this;
  }

  setStatus(status: SpanStatus): this {
    this.status = status;
    return this;
  }

  recordException(err: unknown): this {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    this.setStatus({ code: 2, message });
    this.addEvent('exception', {
      'exception.type': err instanceof Error ? err.name : 'Error',
      'exception.message': message,
      ...(stack ? { 'exception.stacktrace': stack } : {}),
    });
    return this;
  }

  addEvent(name: string, attributes?: SpanAttributes): this {
    this.events.push({
      name,
      timeUnixNano: toUnixNano(Date.now()),
      attributes,
    });
    return this;
  }

  end(endTimeMs?: number): this {
    if (this.isEnded) return this;
    if (this.status.code === 0) {
      this.status = { code: 1 };
    }
    this.endTimeUnixNano = toUnixNano(endTimeMs ?? Date.now());
    this.isEnded = true;
    return this;
  }
}

export class WorkerTracer {
  public readonly traceId: string;
  public readonly rootParentSpanId?: string;
  public activeParentSpanId?: string;
  public rootSpan?: WorkerSpan;
  public readonly environment: string;
  public readonly serviceName: string;
  public readonly serviceVersion: string;
  public readonly projectName: string;
  public readonly endpoint: string;
  public readonly apiKey?: string;
  public readonly spans: WorkerSpan[] = [];

  constructor(config: TracerConfig = {}) {
    this.traceId = config.traceId || generateTraceId();
    this.rootParentSpanId = config.parentSpanId;
    this.activeParentSpanId = config.parentSpanId;
    this.environment = config.environment || 'production';
    this.serviceName = config.serviceName || 'reedrich-mcp';
    this.serviceVersion = config.serviceVersion || '1.18.0';
    this.projectName = config.projectName || `reedrich-mcp-${this.environment}`;
    this.endpoint = (config.endpoint || 'https://phoenix.membran.app/v1/traces').replace(/\/+$/, '');
    this.apiKey = config.apiKey || 'phx_adm_sec_e4b1c2d3f4a5b6c7_sec';
  }

  setActiveParentSpan(spanId?: string): void {
    this.activeParentSpanId = spanId;
  }

  startSpan(
    name: string,
    options: {
      parentSpanId?: string;
      kind?: number;
      attributes?: SpanAttributes;
      startTimeMs?: number;
    } = {}
  ): WorkerSpan {
    const spanId = generateSpanId();
    const parentSpanId = options.parentSpanId ?? this.activeParentSpanId ?? this.rootParentSpanId;
    const span = new WorkerSpan({
      traceId: this.traceId,
      spanId,
      name,
      parentSpanId,
      kind: options.kind,
      startTimeMs: options.startTimeMs,
      attributes: options.attributes,
    });

    this.spans.push(span);
    return span;
  }

  private formatAttributeValue(val: string | number | boolean): Record<string, unknown> {
    if (typeof val === 'string') return { stringValue: val };
    if (typeof val === 'boolean') return { boolValue: val };
    if (typeof val === 'number') {
      if (Number.isInteger(val)) return { intValue: String(val) };
      return { doubleValue: val };
    }
    return { stringValue: String(val) };
  }

  toOTLPPayload(): Record<string, unknown> {
    const formattedSpans = this.spans.map((s) => ({
      traceId: s.traceId,
      spanId: s.spanId,
      parentSpanId: s.parentSpanId,
      name: s.name,
      kind: s.kind,
      startTimeUnixNano: s.startTimeUnixNano,
      endTimeUnixNano: s.endTimeUnixNano || s.startTimeUnixNano,
      attributes: Object.entries(s.attributes).map(([key, val]) => ({
        key,
        value: this.formatAttributeValue(val),
      })),
      events: s.events.map((e) => ({
        name: e.name,
        timeUnixNano: e.timeUnixNano,
        attributes: e.attributes
          ? Object.entries(e.attributes).map(([key, val]) => ({
              key,
              value: this.formatAttributeValue(val ?? ''),
            }))
          : [],
      })),
      status: {
        code: s.status.code,
        message: s.status.message,
      },
    }));

    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: this.serviceName } },
              { key: 'service.version', value: { stringValue: this.serviceVersion } },
              { key: 'deployment.environment', value: { stringValue: this.environment } },
              { key: 'project.name', value: { stringValue: this.projectName } },
              { key: 'openinference.project.name', value: { stringValue: this.projectName } },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: 'reedrich-mcp-worker',
                version: this.serviceVersion,
              },
              spans: formattedSpans,
            },
          ],
        },
      ],
    };
  }

  async flush(): Promise<void> {
    if (this.spans.length === 0) return;

    for (const span of this.spans) {
      span.end();
    }

    const resource = {
      attributes: {
        'service.name': this.serviceName,
        'service.version': this.serviceVersion,
        'deployment.environment': this.environment,
        'project.name': this.projectName,
        'openinference.project.name': this.projectName,
      },
    };
    const instrumentationScope = {
      name: 'reedrich-mcp-worker',
      version: this.serviceVersion,
    };

    const readableSpans = this.spans.map((s) => {
      const startNs = BigInt(s.startTimeUnixNano);
      const endNs = BigInt(s.endTimeUnixNano || s.startTimeUnixNano);
      return {
        name: s.name,
        kind: s.kind,
        spanContext: () => ({
          traceId: s.traceId,
          spanId: s.spanId,
          traceFlags: 1,
        }),
        parentSpanContext: s.parentSpanId
          ? {
              traceId: s.traceId,
              spanId: s.parentSpanId,
              traceFlags: 1,
              isRemote: false,
            }
          : undefined,
        startTime: [Number(startNs / 1_000_000_000n), Number(startNs % 1_000_000_000n)] as [number, number],
        endTime: [Number(endNs / 1_000_000_000n), Number(endNs % 1_000_000_000n)] as [number, number],
        attributes: s.attributes,
        events: s.events.map((e) => {
          const eNs = BigInt(e.timeUnixNano);
          return {
            name: e.name,
            time: [Number(eNs / 1_000_000_000n), Number(eNs % 1_000_000_000n)] as [number, number],
            attributes: e.attributes,
          };
        }),
        links: [],
        status: { code: s.status.code, message: s.status.message },
        droppedAttributesCount: 0,
        droppedEventsCount: 0,
        droppedLinksCount: 0,
        resource,
        instrumentationScope,
      };
    });

    type SerializerInput = Parameters<typeof ProtobufTraceSerializer.serializeRequest>[0];
    const protobufBytes = ProtobufTraceSerializer.serializeRequest(readableSpans as unknown as SerializerInput);
    if (!protobufBytes || protobufBytes.length === 0) return;
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-protobuf',
      'x-project-name': this.projectName,
      'x-phoenix-project': this.projectName,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: protobufBytes as unknown as BodyInit,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`[Tracer] Failed to export traces to Phoenix: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.warn('[Tracer] Network error exporting traces to Phoenix:', err);
    }
  }

  flushWithWaitUntil(executionCtx?: { waitUntil: (promise: Promise<unknown>) => void }): void {
    if (executionCtx && typeof executionCtx.waitUntil === 'function') {
      executionCtx.waitUntil(this.flush());
    } else {
      void this.flush();
    }
  }
}

/**
 * Traced fetch wrapper that records a child CLIENT span and injects traceparent header.
 */
export async function tracedFetch(
  input: string | URL | Request,
  init?: RequestInit,
  tracer?: WorkerTracer
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

  if (!tracer) {
    return fetch(input, init);
  }

  const childSpan = tracer.startSpan(`HTTP ${method} ${new URL(url).hostname}`, {
    kind: 3, // CLIENT
    attributes: {
      'http.method': method,
      'http.url': url,
    },
  });

  const mergedHeaders = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  mergedHeaders.set('traceparent', formatTraceParent(tracer.traceId, childSpan.spanId));

  const startTime = Date.now();
  try {
    const res = await fetch(input, {
      ...init,
      headers: mergedHeaders,
    });
    const duration = Date.now() - startTime;
    childSpan.setAttribute('http.status_code', res.status);
    childSpan.setAttribute('http.duration_ms', duration);
    if (res.status >= 400) {
      childSpan.setStatus({ code: 2, message: `HTTP status ${res.status}` });
    } else {
      childSpan.setStatus({ code: 1 });
    }
    return res;
  } catch (err) {
    const duration = Date.now() - startTime;
    childSpan.setAttribute('http.duration_ms', duration);
    childSpan.recordException(err);
    throw err;
  } finally {
    childSpan.end();
  }
}
