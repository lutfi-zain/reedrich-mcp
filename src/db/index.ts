import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import type { Logger } from "drizzle-orm/logger";
import * as schema from "./schema";
import { buildDbQueryAttributes, type WorkerTracer } from "../observability/tracer";

export * from "./schema";
export type Database = PostgresJsDatabase<typeof schema>;

const clientCache = new Map<string, Sql>();

export class TracingLogger implements Logger {
  constructor(private tracer: WorkerTracer) {}

  logQuery(query: string, _params: unknown[]): void {
    const trimmed = query.trim();
    const op = trimmed.split(/\s+/)[0]?.toUpperCase() || 'QUERY';
    const firstTableMatch = trimmed.match(/(?:from|into|update|join)\s+["`]?([a-zA-Z0-9_]+)["`]?/i);
    const target = firstTableMatch ? ` ${firstTableMatch[1]}` : '';

    const span = this.tracer.startSpan(`db.query: ${op}${target}`, {
      kind: 3, // CLIENT
      attributes: buildDbQueryAttributes({
        statement: query,
        operation: op,
      }),
    });
    span.setStatus({ code: 1 });
    span.end();
  }
}

export function createDb(
  connectionString: string,
  isWorker: boolean = false,
  tracer?: WorkerTracer
): Database {
  const logger = tracer ? new TracingLogger(tracer) : undefined;
  if (isWorker) {
    const client = postgres(connectionString, { max: 1 });
    return drizzle(client, { schema, logger });
  }

  let client = clientCache.get(connectionString);
  if (!client) {
    client = postgres(connectionString, { max: 10, idle_timeout: 1 });
    clientCache.set(connectionString, client);
  }
  return drizzle(client, { schema, logger });
}

export async function closeAllDbs(): Promise<void> {
  for (const client of clientCache.values()) {
    try {
      await client.end({ timeout: 1 });
    } catch {}
  }
  clientCache.clear();
}

export function getDb(
  env?: {
    HYPERDRIVE?: { connectionString: string };
    DB?: { connectionString?: string };
    tracer?: WorkerTracer;
  },
  tracer?: WorkerTracer
): Database {
  const isWorker = Boolean(env?.HYPERDRIVE?.connectionString);
  const connString =
    env?.HYPERDRIVE?.connectionString ||
    env?.DB?.connectionString ||
    (typeof process !== "undefined" && process.env ? process.env.DATABASE_URL : undefined) ||
    "postgres://postgres:3c412f0353f1ec974266c3613f9f9500@127.0.0.1:5432/reedrich";
  const activeTracer = tracer || env?.tracer;
  return createDb(connString, isWorker, activeTracer);
}
