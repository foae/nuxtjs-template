import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { lintPaths } from '../../scripts/check-lint'

describe('scoped check autofix', () => {
  let directory: string
  let root: string
  const original = 'let value = 1\n'

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'check-lint-'))
    root = join(directory, 'repo')
    await mkdir(root)
    await writeFile(join(root, 'eslint.config.mjs'), 'export default [{ files: ["**/*.ts"], rules: { "prefer-const": "error" } }]\n')
    await writeFile(join(root, 'inside.ts'), original)
    await writeFile(join(directory, 'outside.ts'), original)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('refuses a directory containing an escaping symlink before writing any fixes', async () => {
    await symlink(join(directory, 'outside.ts'), join(root, 'linked.ts'))
    await expect(lintPaths(root, [root])).rejects.toThrow('outside the repository')
    expect(await readFile(join(directory, 'outside.ts'), 'utf8')).toBe(original)
    expect(await readFile(join(root, 'inside.ts'), 'utf8')).toBe(original)
  })

  it('refuses an explicit external path before fixing a valid companion path', async () => {
    await expect(lintPaths(root, ['inside.ts', '../outside.ts'])).rejects.toThrow('outside the repository')
    expect(await readFile(join(directory, 'outside.ts'), 'utf8')).toBe(original)
    expect(await readFile(join(root, 'inside.ts'), 'utf8')).toBe(original)
  })

  it('rejects an empty argument rather than expanding it to the repository', async () => {
    await expect(lintPaths(root, ['inside.ts', ''])).rejects.toThrow('empty path')
    expect(await readFile(join(root, 'inside.ts'), 'utf8')).toBe(original)
  })

  it('skips missing paths without falling back to whole-repository autofix', async () => {
    const result = await lintPaths(root, ['deleted.ts'])
    expect(result.skipped).toBe(true)
    expect(result.missing).toEqual(['deleted.ts'])
    expect(await readFile(join(root, 'inside.ts'), 'utf8')).toBe(original)
  })

  it('skips unsupported files and ignored directories without fixing other files', async () => {
    await writeFile(join(root, 'notes.md'), '# Notes\n')
    await mkdir(join(root, 'docs'))
    await writeFile(join(root, 'docs', 'guide.md'), '# Guide\n')
    const result = await lintPaths(root, ['notes.md', 'docs'])
    expect(result.skipped).toBe(true)
    expect(result.ignored).toEqual(['notes.md', 'docs'])
    expect(await readFile(join(root, 'inside.ts'), 'utf8')).toBe(original)
  })

  it('fixes a dot-prefixed filename alongside a skipped file', async () => {
    await writeFile(join(root, '..notes.ts'), original)
    await writeFile(join(root, 'notes.md'), '# Notes\n')
    const result = await lintPaths(root, ['..notes.ts', 'notes.md'])
    expect(result.skipped).toBe(false)
    expect(result.ignored).toEqual(['notes.md'])
    expect(await readFile(join(root, '..notes.ts'), 'utf8')).toBe('const value = 1\n')
  })

  it('fixes a literal filename while warning about a missing companion', async () => {
    const filename = 'literal [id]; name.ts'
    await writeFile(join(root, filename), original)
    const result = await lintPaths(root, [filename, 'deleted.ts'])
    expect(result.errorCount).toBe(0)
    expect(result.missing).toEqual(['deleted.ts'])
    expect(await readFile(join(root, filename), 'utf8')).toBe('const value = 1\n')
    expect(await readFile(join(root, 'inside.ts'), 'utf8')).toBe(original)
  })
})
