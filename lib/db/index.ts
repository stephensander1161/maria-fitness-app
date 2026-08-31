import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * The pool is created on first query, not at module load — otherwise Next's
 * build-time page-data collection would demand DATABASE_URL just to read the
 * module. The globalThis cache keeps dev hot-reload from opening a pool per edit.
 */
const globalForDb = globalThis as unknown as { _sql?: ReturnType<typeof postgres>; _db?: Db };

function connect(): Db {
  if (globalForDb._db) return globalForDb._db;

  const sql =
    globalForDb._sql ??
    postgres(env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      prepare: false, // required behind a connection pooler (Neon / PgBouncer)
    });

  const instance = drizzle(sql, { schema });
  if (process.env.NODE_ENV !== "production") {
    globalForDb._sql = sql;
    globalForDb._db = instance;
  }
  return instance;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = connect() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
