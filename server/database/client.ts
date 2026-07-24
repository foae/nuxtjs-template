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
  const client = postgres(url, { max, onnotice: () => {} })
  return {
    db: drizzle(client, { schema, casing: 'snake_case' }),
    close: () => client.end()
  }
}
