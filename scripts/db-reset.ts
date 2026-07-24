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

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset the database with NODE_ENV=production.')
  }

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
