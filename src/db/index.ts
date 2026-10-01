import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

export * from "./schema";
export type Database = PostgresJsDatabase<typeof schema>;

export function createDb(connectionString: string): Database {
  const client = postgres(connectionString, { max: 1 });
  return drizzle(client, { schema });
}

export function getDb(env?: {
  HYPERDRIVE?: { connectionString: string };
  DB?: { connectionString?: string };
}): Database {
  const connString =
    env?.HYPERDRIVE?.connectionString ||
    env?.DB?.connectionString ||
    (typeof process !== "undefined" && process.env ? process.env.DATABASE_URL : undefined) ||
    "postgres://postgres:3c412f0353f1ec974266c3613f9f9500@127.0.0.1:5432/reedrich";
  return createDb(connString);
}
