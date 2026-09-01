/**
 * Connection factory shared by the Nitro server and standalone scripts
 * (seed, reset). Keeping it here means drizzle options — notably
 * `casing: 'snake_case'` — are declared once and can't drift between
 * the running app and the scripts that write to the same database.
 */
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Db = PostgresJsDatabase<typeof schema>

export interface DbHandle {
  db: Db
  close: () => Promise<void>
}

export function createDb(url: string, max = 10): DbHandle {
  // Direct connection to Postgres, so prepared statements stay on (the
  // postgres.js default). If a transaction-mode pooler (PgBouncer, Supabase,
  // Neon pooling) is ever put in front, add `prepare: false` — prepared
  // statements are not supported there and fail confusingly at runtime.
  const client = postgres(url, { max, onnotice: () => {} })
  return {
    db: drizzle(client, { schema, casing: 'snake_case' }),
    close: () => client.end()
  }
}
