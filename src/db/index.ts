import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Lazily connected.
 *
 * Importing this module must not require DATABASE_URL — `next build` and the
 * Docker image build both evaluate route modules with no database in reach.
 * The connection is created on first actual use instead.
 */
type Sql = ReturnType<typeof postgres>;
const globalForDb = globalThis as unknown as {
  __sql?: Sql;
  __db?: PostgresJsDatabase<typeof schema>;
};

function connect(): { sql: Sql; db: PostgresJsDatabase<typeof schema> } {
  if (globalForDb.__sql && globalForDb.__db) {
    return { sql: globalForDb.__sql, db: globalForDb.__db };
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const sql = postgres(connectionString, { max: 10 });
  const db = drizzle(sql, { schema });
  globalForDb.__sql = sql;
  globalForDb.__db = db;
  return { sql, db };
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_t, prop, receiver) {
    return Reflect.get(connect().db as object, prop, receiver);
  },
});

export const sql = new Proxy((() => {}) as unknown as Sql, {
  get(_t, prop, receiver) {
    return Reflect.get(connect().sql as object, prop, receiver);
  },
  apply(_t, _thisArg, args) {
    return (connect().sql as unknown as (...a: unknown[]) => unknown)(...args);
  },
});

export { schema };
