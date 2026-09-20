import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { ESLint } from 'eslint'

/** Compute fixes first; refuse the entire batch before any source-file writes. */
export async function lintPaths(repository: string, requested: string[]) {
  const root = realpathSync(repository)
  const paths: string[] = []
  const missing: string[] = []
  const ignored: string[] = []

  function assertInsideRepo(path: string): void {
    const fromRoot = relative(root, path)
    if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new Error(`Refusing path outside the repository: ${path}`)
    }
  }

  for (const input of requested.length ? requested : [root]) {
    if (!input.trim()) throw new Error('Refusing an empty path; omit arguments to check the whole repository.')
    const path = resolve(root, input)
    assertInsideRepo(path)
    try {
      assertInsideRepo(realpathSync(path))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        missing.push(input)
        continue
      }
      throw error
    }
    paths.push(path)
  }

  if (!paths.length) return { skipped: true, missing, ignored, output: '', errorCount: 0 }

  const eslint = new ESLint({
    cwd: root,
    fix: true,
    cache: true,
    globInputPaths: false,
    errorOnUnmatchedPattern: false,
    warnIgnored: false,
    cacheLocation: `${resolve(root, 'node_modules/.cache/eslint')}${sep}`
  })
  const selected = new Map<string, ESLint.LintResult>()
  for (const path of paths) {
    const matches = await eslint.lintFiles([path])
    if (!matches.length) ignored.push(relative(root, path) || '.')
    for (const result of matches) selected.set(result.filePath, result)
  }
  const results = [...selected.values()]
  // Directory expansion can discover symlinked files not present in argv.
  // ESLint computes fixes in memory; only outputFixes writes source files.
  for (const result of results) {
    assertInsideRepo(realpathSync(result.filePath))
  }
  await ESLint.outputFixes(results)
  const formatter = await eslint.loadFormatter()
  return {
    skipped: results.length === 0,
    missing,
    ignored,
    output: await formatter.format(results),
    errorCount: results.reduce((count, result) => count + result.errorCount, 0)
  }
}
