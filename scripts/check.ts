/**
 * `pnpm check [files...]` — fast feedback after an edit, not the final gate.
 * ESLint --fix MUTATES the given paths (the whole repo when none are given).
 * Cached lint cannot see imported type changes; run `pnpm verify` before done.
 * Typecheck and the full unit suite run even if path validation or lint fails.
 * No database, migration generation, or vendored-manifest checks run here.
 */
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { consola } from 'consola'
import { lintPaths } from './check-lint'

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
const results: { name: string, status: 'passed' | 'failed' | 'skipped', ms: number, hint: string }[] = []

async function lint(): Promise<'passed' | 'skipped'> {
  if (!process.argv.slice(2).length) consola.warn('No paths supplied; autofixing the whole repository.')
  const result = await lintPaths(root, process.argv.slice(2))
  for (const path of result.missing) consola.warn(`Skipping missing path: ${path}`)
  for (const path of result.ignored) consola.warn(`Skipping path with no lintable files: ${path}`)
  if (result.skipped) {
    consola.warn('No lintable paths; ESLint skipped (not falling back to the whole repository).')
    return 'skipped'
  }
  if (result.output) consola.log(result.output)
  if (result.errorCount) throw new Error(`ESLint reported ${result.errorCount} error(s).`)
  return 'passed'
}

function exec(args: string[]): 'passed' {
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`pnpm ${args[0]} failed (${result.signal ?? result.status ?? 'unknown exit'}).`)
  }
  return 'passed'
}

async function run(name: string, action: () => 'passed' | 'skipped' | Promise<'passed' | 'skipped'>, hint: string): Promise<void> {
  const started = Date.now()
  consola.start(name)
  let status: 'passed' | 'failed' | 'skipped'
  try {
    status = await action()
  } catch (error) {
    status = 'failed'
    consola.error(error instanceof Error ? error.message : String(error))
  }
  results.push({ name, status, ms: Date.now() - started, hint })
}

await run('lint (cached fix)', lint, 'Fix the lint errors or pass nonempty paths inside this repository.')
await run('typecheck', () => exec(['run', 'typecheck']), 'Fix the type errors above.')
await run('test', () => exec(['run', 'test']), 'Fix the failing unit tests; all units run because schema drift uses dynamic imports.')

consola.log('')
consola.box(results.map(r => `${r.status.toUpperCase().padEnd(7)} ${r.name.padEnd(20)} ${(r.ms / 1000).toFixed(1)}s`).join('\n'))

const failed = results.filter(r => r.status === 'failed')
const skipped = results.filter(r => r.status === 'skipped')
if (failed.length) {
  for (const result of failed) consola.warn(`${result.name}: ${result.hint}`)
  consola.error(`check failed (${failed.length}/${results.length}); ${skipped.length} skipped`)
  process.exitCode = 1
} else {
  consola.success(`check passed (${results.length - skipped.length}/${results.length}); ${skipped.length} skipped; run pnpm verify before declaring done.`)
}
