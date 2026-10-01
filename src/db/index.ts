import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

export * from "./schema";
export type Database = PostgresJsDatabase<typeof schema>;

const clientCache = new Map<string, Sql>();

export function createDb(connectionString: string, isWorker: boolean = false): Database {
  if (isWorker) {
    const client = postgres(connectionString, { max: 1 });
    return drizzle(client, { schema });
  }

  let client = clientCache.get(connectionString);
  if (!client) {
    client = postgres(connectionString, { max: 10, idle_timeout: 1 });
    clientCache.set(connectionString, client);
  }
  return drizzle(client, { schema });
}

export async function closeAllDbs(): Promise<void> {
  for (const client of clientCache.values()) {
    try {
      await client.end({ timeout: 1 });
    } catch {}
  }
  clientCache.clear();
}

export function getDb(env?: {
  HYPERDRIVE?: { connectionString: string };
  DB?: { connectionString?: string };
}): Database {
  const isWorker = Boolean(env?.HYPERDRIVE?.connectionString);
  const connString =
    env?.HYPERDRIVE?.connectionString ||
    env?.DB?.connectionString ||
    (typeof process !== "undefined" && process.env ? process.env.DATABASE_URL : undefined) ||
    "postgres://postgres:3c412f0353f1ec974266c3613f9f9500@127.0.0.1:5432/reedrich";
  return createDb(connString, isWorker);
}
