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
 *   5. vendored docs pinned  docs/skill mirror still matches the lockfile
 *
 * Every step runs even if an earlier one fails, then results are summarised
 * at the end. That is deliberate: each invocation costs an agent a round
 * trip, so one run should surface every problem rather than only the first.
 */
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { consola } from 'consola'

const MIGRATIONS_DIR = 'server/database/migrations'

/**
 * Mirrors whose whole value is being version-exact. `docs:sync` and
 * `skills:sync` pin to the installed package's git tag, but nothing stops a
 * dependency bump from moving the lockfile and leaving the mirror behind —
 * at which point the docs an agent is told to trust describe a version this
 * project does not have.
 */
const VENDORED = [
  { label: 'Nuxt docs', file: 'docs/vendor/nuxt/VERSION', pkg: 'nuxt', fix: 'pnpm docs:sync' },
  { label: 'Nuxt UI skill', file: '.agents/skills/nuxt-ui/VERSION', pkg: '@nuxt/ui', fix: 'pnpm skills:sync' }
]

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
 * Migration files git has never seen.
 *
 * This is the other half of the freshness check, and it is needed because the
 * first half is stateful: once a failed run has generated `0002_x.sql`, the
 * schema and the migrations directory agree again — so the NEXT run generates
 * nothing, reports green, and leaves a migration in the working tree that no
 * deploy will ever apply. Staging the file is enough to acknowledge it;
 * committing stays your call, not this script's.
 */
function untrackedMigrations(): string[] {
  try {
    return execSync(`git status --porcelain -- ${MIGRATIONS_DIR}`, { encoding: 'utf8' })
      .split('\n')
      .filter(line => line.startsWith('??'))
      .map(line => line.slice(3).trim())
  } catch {
    return [] // not a git checkout — nothing to compare against
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

  const untracked = untrackedMigrations()
  if (untracked.length > 0) {
    results.push({
      name,
      ok: false,
      ms: Date.now() - started,
      hint: `Migration not in git: ${untracked.join(', ')}. Review it, then `
        + `\`git add\` it — otherwise the next verify passes green with a `
        + `migration no deploy will apply.`
    })
    return false
  }

  results.push({ name, ok: true, ms: Date.now() - started })
  return true
}

/**
 * The vendored mirrors claim to match the installed version. Nothing else
 * enforces that, so a dependency bump can leave an agent reading docs for a
 * version this project doesn't run. Cheap: two files, no network.
 */
function checkVendoredDocsPinned(): boolean {
  const started = Date.now()
  const name = 'vendored docs pinned'
  consola.start(name)

  const stale: string[] = []
  for (const { label, file, pkg, fix } of VENDORED) {
    let installed: string | undefined
    try {
      installed = (JSON.parse(
        readFileSync(`node_modules/${pkg}/package.json`, 'utf8')
      ) as { version?: string }).version
    } catch {
      continue // package not installed — nothing to compare against
    }

    let vendored: string | undefined
    try {
      vendored = readFileSync(file, 'utf8').trim()
    } catch {
      stale.push(`${label}: ${file} missing — run \`${fix}\``)
      continue
    }

    if (vendored !== installed) {
      stale.push(`${label}: mirrored ${vendored}, installed ${installed} — run \`${fix}\``)
    }
  }

  if (stale.length > 0) {
    results.push({ name, ok: false, ms: Date.now() - started, hint: stale.join('; ') })
    return false
  }

  results.push({ name, ok: true, ms: Date.now() - started })
  return true
}

run('typecheck', 'pnpm run typecheck', 'Fix the type errors above.')
run('lint', 'pnpm run lint', 'Run `pnpm lint:fix` to auto-fix what can be fixed.')
run('test', 'pnpm run test', 'A failing schema-drift test means shared/schemas no longer matches the Drizzle schema.')
checkMigrationsFresh()
checkVendoredDocsPinned()

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
