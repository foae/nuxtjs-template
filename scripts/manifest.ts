/**
 * Content manifests for generated trees (`docs/vendor/nuxt/`,
 * `.agents/skills/nuxt-ui/`).
 *
 * `pnpm verify`'s "vendored docs pinned" check only compares each tree's
 * VERSION file against the installed package version — it has no way to
 * notice a hand-edit *inside* the tree, even though CLAUDE.md rule 13 says
 * such an edit is silently destroyed by the next sync. A MANIFEST.sha256
 * (one `<hex>  <path>` line per file, sorted) makes that drift detectable:
 * `writeManifest` is called by docs-sync.ts / skills-sync.ts right after
 * they finish (re)writing a tree, and `verifyManifest` is called by
 * verify.ts to catch anything that no longer matches.
 *
 * CLI:
 *   tsx scripts/manifest.ts write <dir>...
 *   tsx scripts/manifest.ts verify <dir>...
 */
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { consola } from 'consola'

const MANIFEST_NAME = 'MANIFEST.sha256'

/** POSIX-style relative path, regardless of platform separators. */
function toPosix(path: string): string {
  return path.split(sep).join('/')
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  const files: string[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (entry.name === MANIFEST_NAME) continue

    const abs = resolve(entry.parentPath, entry.name)
    files.push(toPosix(relative(dir, abs)))
  }
  return files.sort()
}

async function hashFile(dir: string, relPath: string): Promise<string> {
  const buf = await readFile(resolve(dir, relPath))
  return createHash('sha256').update(buf).digest('hex')
}

/** Walks `dir` and writes `<dir>/MANIFEST.sha256`. */
export async function writeManifest(dir: string): Promise<void> {
  const files = await listFiles(dir)
  const lines = await Promise.all(
    files.map(async file => `${await hashFile(dir, file)}  ${file}`)
  )
  await writeFile(resolve(dir, MANIFEST_NAME), `${lines.join('\n')}\n`)
}

/**
 * Compares `dir` against its MANIFEST.sha256. Returns a list of
 * human-readable problems — empty means the tree is clean.
 */
export async function verifyManifest(dir: string): Promise<string[]> {
  const problems: string[] = []
  const manifestPath = resolve(dir, MANIFEST_NAME)

  let manifestRaw: string
  try {
    manifestRaw = await readFile(manifestPath, 'utf8')
  } catch {
    return [`${dir}: ${MANIFEST_NAME} missing`]
  }

  const listed = new Map<string, string>()
  for (const line of manifestRaw.split('\n')) {
    if (line.trim() === '') continue
    const [hash, ...rest] = line.split('  ')
    const path = rest.join('  ')
    if (!hash || !path) continue
    listed.set(path, hash)
  }

  const onDisk = new Set(await listFiles(dir))

  for (const [path, expectedHash] of listed) {
    if (!onDisk.has(path)) {
      problems.push(`${dir}: ${path} listed in manifest but missing on disk`)
      continue
    }

    const actualHash = await hashFile(dir, path)
    if (actualHash !== expectedHash) {
      problems.push(`${dir}: ${path} does not match its recorded hash`)
    }
  }

  for (const path of onDisk) {
    if (!listed.has(path)) {
      problems.push(`${dir}: ${path} present on disk but not listed in manifest`)
    }
  }

  return problems
}

async function main() {
  const [mode, ...dirs] = process.argv.slice(2)

  if ((mode !== 'write' && mode !== 'verify') || dirs.length === 0) {
    consola.error('Usage: tsx scripts/manifest.ts <write|verify> <dir>...')
    process.exit(1)
  }

  let hadProblems = false

  for (const dir of dirs) {
    const resolved = resolve(dir)
    if (mode === 'write') {
      await writeManifest(resolved)
      consola.success(`Wrote ${MANIFEST_NAME} for ${dir}`)
    } else {
      const problems = await verifyManifest(resolved)
      if (problems.length === 0) {
        consola.success(`${dir}: manifest matches`)
      } else {
        hadProblems = true
        for (const problem of problems) consola.error(problem)
      }
    }
  }

  if (hadProblems) process.exit(1)
}

// Only run the CLI when this file is the entry point, not when imported by
// docs-sync.ts / skills-sync.ts / verify.ts.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    consola.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
