/**
 * Runs once before the e2e suite: restore the database to its seeded state.
 *
 * Two tests deliberately mutate seeded rows — renaming post `…0101` is the
 * *point* of the PATCH regression test — so without this the suite passes on a
 * freshly reset database and fails on every run after, with a failure that
 * looks like a broken page rather than stale state. That is an expensive false
 * negative for an agent, which will go debugging its own change.
 *
 * `db:reset` refuses any non-local host, so this cannot touch a remote
 * database (see `scripts/db-reset.ts`).
 */
import { execSync } from 'node:child_process'

export default function globalSetup() {
  execSync('pnpm db:reset', { stdio: 'inherit' })
}
