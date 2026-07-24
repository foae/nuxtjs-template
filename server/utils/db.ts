/**
 * Database access for server routes. Files in `server/utils/` are
 * auto-imported across the server, so `useDb()` and `tables` are available
 * in any route with no import statement:
 *
 *   const rows = await useDb().select().from(tables.posts)
 *
 * Scripts outside Nitro (seed, reset) use `createDb()` from
 * `server/database/client.ts` instead — `useRuntimeConfig()` does not
 * exist there.
 */
import type { Db, DbHandle } from '../database/client'
import { createDb } from '../database/client'
import * as schema from '../database/schema'

export { schema as tables }

let handle: DbHandle | undefined

export function useDb(): Db {
  if (handle) return handle.db

  // `process.env` FIRST, runtimeConfig second — this order matters.
  //
  // Nuxt only overrides `runtimeConfig.databaseUrl` from `NUXT_DATABASE_URL`,
  // not `DATABASE_URL`. A production container started with just DATABASE_URL
  // therefore keeps the empty build-time default, and postgres.js silently
  // falls back to localhost — you get ECONNREFUSED inside the container while
  // the database is plainly reachable. Reading process.env directly keeps the
  // promise that DATABASE_URL is the only name to get right.
  const url = process.env.DATABASE_URL || useRuntimeConfig().databaseUrl
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env, then run `pnpm db:up`. '
      + 'In production, pass DATABASE_URL (or NUXT_DATABASE_URL) to the container.'
    )
  }

  // One pool per process — Nitro reuses this module across requests, so a
  // per-request connection would exhaust Postgres under any real load.
  handle = createDb(url)
  return handle.db
}

/** Close the pool so tests and scripts can exit cleanly. */
export async function closeDb(): Promise<void> {
  await handle?.close()
  handle = undefined
}
