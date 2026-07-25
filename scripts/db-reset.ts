/**
 * Drop everything and rebuild: schema -> migrations -> seed.
 *
 * This exists so an agent can restore a known database state unattended,
 * in seconds, without asking a human to intervene.
 */
import { execSync } from 'node:child_process'
import process from 'node:process'
import { consola } from 'consola'
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/app'

/**
 * Hosts this script is willing to drop. `postgres`/`db` cover the usual
 * Compose service names, so it still works from inside a container.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'postgres', 'db'])

/**
 * `NODE_ENV` alone is not a safety net. It is unset in most shells, so a
 * terminal that happens to export a staging `DATABASE_URL` — or a `.env` an
 * agent didn't read — was enough to drop a remote schema while following the
 * documented "run `pnpm db:reset`" instruction. Gate on the host instead,
 * which is the thing that actually decides what gets destroyed.
 */
function assertSafeTarget(url: string) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset the database with NODE_ENV=production.')
  }

  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`DATABASE_URL is not a parseable URL, refusing to reset: ${url}`)
  }

  if (!LOCAL_HOSTS.has(host) && process.env.DB_RESET_ALLOW_REMOTE !== '1') {
    throw new Error(
      `Refusing to drop a non-local database: host "${host}" is not one of `
      + `${[...LOCAL_HOSTS].join(', ')}. This command DROPs the schema. If you `
      + `genuinely mean that host, re-run with DB_RESET_ALLOW_REMOTE=1.`
    )
  }
}

async function main() {
  assertSafeTarget(DATABASE_URL)

  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} })
  try {
    // Drops tables *and* the drizzle migration journal, so `db:migrate`
    // below replays every migration from scratch.
    await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
    await sql.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE;')
    consola.info('Dropped schema `public` and the drizzle journal')
  } finally {
    await sql.end()
  }

  execSync('pnpm db:migrate', { stdio: 'inherit' })
  execSync('pnpm db:seed', { stdio: 'inherit' })
  consola.success('Database reset complete')
}

main().catch((error) => {
  consola.error('Reset failed:', error)
  process.exit(1)
})
