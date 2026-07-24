/**
 * `pnpm verify` — the one command to run before declaring work finished.
 *
 * Runs every check that can fail without a database, so it works on a fresh
 * clone, in CI, and on an agent's machine with nothing running:
 *
 *   1. typecheck            app, server, shared, and root-level tooling
 *   2. lint                 @nuxt/eslint flat config
 *   3. test                 unit tests, including the schema-drift detector
 *   4. migration freshness  schema edited but no migration committed
 *
 * Every step runs even if an earlier one fails, then results are summarised
 * at the end. That is deliberate: each invocation costs an agent a round
 * trip, so one run should surface every problem rather than only the first.
 */
import { execSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import process from 'node:process'
import { consola } from 'consola'

const MIGRATIONS_DIR = 'server/database/migrations'

interface Result {
  name: string
  ok: boolean
  ms: number
  hint?: string
}

const results: Result[] = []

function run(name: string, command: string, hint?: string): boolean {
  const started = Date.now()
  consola.start(name)
  try {
    execSync(command, { stdio: 'inherit' })
    results.push({ name, ok: true, ms: Date.now() - started })
    return true
  } catch {
    results.push({ name, ok: false, ms: Date.now() - started, hint })
    return false
  }
}

function listMigrations(): string[] {
  try {
    return readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
  } catch {
    return []
  }
}

/**
 * Detects the failure Drizzle makes easy to hit: editing `schema.ts` without
 * running `db:generate`. Types still compile — the types come straight from
 * the schema file — so nothing complains until deploy time, when the database
 * turns out to be missing a column.
 *
 * Running `drizzle-kit generate` here is safe: with no schema change it is a
 * no-op. If it does produce a file, the schema was stale, and the generated
 * migration is left in place so the fix is just "review and commit".
 */
function checkMigrationsFresh(): boolean {
  const started = Date.now()
  const name = 'migration freshness'
  consola.start(name)

  const before = listMigrations()
  try {
    execSync('pnpm exec drizzle-kit generate', { stdio: 'pipe' })
  } catch (error) {
    consola.error('drizzle-kit generate failed')
    consola.error(String((error as { stdout?: Buffer }).stdout ?? error))
    results.push({ name, ok: false, ms: Date.now() - started })
    return false
  }

  const created = listMigrations().filter(f => !before.includes(f))
  if (created.length > 0) {
    results.push({
      name,
      ok: false,
      ms: Date.now() - started,
      hint: `Schema changed with no committed migration. Generated ${created.join(', ')} — review it, then commit it (and run \`pnpm db:migrate\`).`
    })
    return false
  }

  results.push({ name, ok: true, ms: Date.now() - started })
  return true
}

run('typecheck', 'pnpm run typecheck', 'Fix the type errors above.')
run('lint', 'pnpm run lint', 'Run `pnpm lint:fix` to auto-fix what can be fixed.')
run('test', 'pnpm run test', 'A failing schema-drift test means shared/schemas no longer matches the Drizzle schema.')
checkMigrationsFresh()

const failed = results.filter(r => !r.ok)

consola.log('')
consola.box(
  results
    .map(r => `${r.ok ? '✔' : '✖'} ${r.name.padEnd(20)} ${(r.ms / 1000).toFixed(1)}s`)
    .join('\n')
)

if (failed.length > 0) {
  for (const f of failed) {
    if (f.hint) consola.warn(`${f.name}: ${f.hint}`)
  }
  consola.error(`verify failed (${failed.length}/${results.length})`)
  process.exit(1)
}

consola.success(`verify passed (${results.length}/${results.length})`)
