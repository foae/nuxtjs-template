/**
 * Mirrors the Nuxt documentation into `docs/vendor/nuxt/`, pinned to the
 * exact Nuxt version this project has installed.
 *
 *   pnpm docs:sync
 *
 * Why a mirror at all: grep over local files is the cheapest retrieval an
 * agent has — no network, no MCP tool definitions resident in context, and
 * it works offline.
 *
 * Why the git tag rather than scraping nuxt.com: the website always serves
 * "latest 4.x", which drifts ahead of your lockfile. Reading the installed
 * version and fetching that tag makes the docs and the code structurally
 * incapable of disagreeing. One tarball, not 235 HTTP requests.
 *
 * `6.bridge/` and `7.migration/` are dropped — Nuxt 2 -> 3 legacy that is
 * pure noise in a greenfield Nuxt 4 project and would pollute every grep.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { consola } from 'consola'

// This package is ESM ("type": "module"), so `require` does not exist.
const require = createRequire(import.meta.url)

const OUT_DIR = resolve('docs/vendor/nuxt')
const EXCLUDE = ['6.bridge', '7.migration']

function installedNuxtVersion(): string {
  const pkgPath = require.resolve('nuxt/package.json', { paths: [process.cwd()] })
  const { version } = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }
  return version
}

async function countMarkdown(dir: string): Promise<{ files: number, bytes: number }> {
  let files = 0
  let bytes = 0
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files++
      bytes += Buffer.byteLength(readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    }
  }
  return { files, bytes }
}

async function main() {
  const version = installedNuxtVersion()
  const tag = `v${version}`
  const url = `https://github.com/nuxt/nuxt/archive/refs/tags/${tag}.tar.gz`

  consola.start(`Syncing Nuxt ${version} docs from ${tag}`)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Could not download ${url} (HTTP ${response.status}). `
      + `Does the tag exist for the installed version?`
    )
  }

  const tmp = mkdtempSync(join(tmpdir(), 'nuxt-docs-'))
  const tarball = join(tmp, 'nuxt.tar.gz')

  try {
    writeFileSync(tarball, Buffer.from(await response.arrayBuffer()))

    await rm(OUT_DIR, { recursive: true, force: true })
    await mkdir(OUT_DIR, { recursive: true })

    // --strip-components=2 drops the `nuxt-<version>/docs/` prefix so paths
    // read as `docs/vendor/nuxt/1.getting-started/...`.
    execFileSync('tar', [
      'xzf', tarball,
      '-C', OUT_DIR,
      '--strip-components=2',
      '--wildcards', `nuxt-${version}/docs/*`,
      ...EXCLUDE.flatMap(dir => ['--exclude', `*/docs/${dir}/*`])
    ], { stdio: 'pipe' })

    // tar still creates directory entries for excluded paths, leaving empty
    // `6.bridge/` and `7.migration/` shells that imply content that isn't there.
    for (const dir of EXCLUDE) {
      await rm(join(OUT_DIR, dir), { recursive: true, force: true })
    }

    const { files, bytes } = await countMarkdown(OUT_DIR)

    writeFileSync(join(OUT_DIR, 'VERSION'), `${version}\n`)
    writeFileSync(join(OUT_DIR, 'README.md'), `# Vendored Nuxt documentation

Nuxt **${version}**, taken from the \`${tag}\` tag of https://github.com/nuxt/nuxt
(\`docs/\`). ${files} markdown files, ${(bytes / 1024).toFixed(0)} KB.

Regenerate with \`pnpm docs:sync\`. Do not edit these files by hand — the next
sync overwrites them.

\`6.bridge/\` and \`7.migration/\` are excluded: they cover Nuxt 2 -> 3 migration
and are irrelevant here.

Licensed MIT by the Nuxt team, same as the framework. See
https://github.com/nuxt/nuxt/blob/main/LICENSE
`)

    consola.success(
      `Mirrored ${files} files (${(bytes / 1024).toFixed(0)} KB) for Nuxt ${version} -> docs/vendor/nuxt/`
    )
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch((error) => {
  consola.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
