/**
 * Runs once before the e2e suite: restore the explicit disposable database to
 * its seeded state. `playwright.config.ts` rejects every target except an
 * E2E_DATABASE_URL whose database name ends in `_e2e`.
 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'

function e2eDatabaseUrl(): string {
  const value = process.env.E2E_DATABASE_URL
  if (!value) throw new Error('E2E_DATABASE_URL is required before the E2E database can be reset.')

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('E2E_DATABASE_URL must be a valid PostgreSQL connection URL.')
  }

  const database = decodeURIComponent(url.pathname).replace(/^\//, '')
  if (!database.endsWith('_e2e') || database.includes('/')) {
    throw new Error('E2E_DATABASE_URL must name a disposable database ending in "_e2e".')
  }

  return value
}

export default function globalSetup() {
  execFileSync('pnpm', ['db:reset'], {
    env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() },
    stdio: 'inherit'
  })
}
