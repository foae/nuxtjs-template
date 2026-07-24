/**
 * Mechanical check for the gap `shared/types/auth.d.ts` admits to: the session
 * type augmentation is hand-written, and nothing forces it to match what
 * `setUserSession()` actually stores.
 *
 * Types are erased at runtime, so this reads the declaration file and the
 * handlers as text and compares the field names. It is a lint, not a proof —
 * but it catches the realistic failure: an agent adds a field to the session
 * in a handler and forgets the augmentation, silently losing `user.<field>`
 * typing across every server route.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function read(relative: string) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

/**
 * Field names declared on `interface User` in the augmentation.
 * Line-based rather than one big regex — easier to follow, and it does not
 * silently return `[]` when the formatting shifts.
 */
function declaredUserFields(): string[] {
  const lines = read('../../shared/types/auth.d.ts').split('\n')
  const start = lines.findIndex(l => /^\s*interface User\s*\{/.test(l))
  if (start === -1) throw new Error('interface User not found in shared/types/auth.d.ts')

  const fields: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\}/.test(line)) break
    const field = /^\s*(\w+)\??\s*:/.exec(line)?.[1]
    if (field) fields.push(field)
  }
  return fields
}

/** Field names inside the `user: { ... }` object passed to setUserSession(). */
function storedUserFields(source: string): string[] {
  const call = /setUserSession\(\s*event\s*,\s*\{([\s\S]*?)\n\s*\}\s*\)/.exec(source)?.[1] ?? ''
  const userBlock = /user:\s*\{([\s\S]*?)\}/.exec(call)?.[1] ?? ''
  return [...userBlock.matchAll(/^\s*(\w+)\s*[,:]/gm)].map(m => m[1]!)
}

describe('session shape matches its type augmentation', () => {
  const declared = declaredUserFields()

  it('declares the fields the augmentation is supposed to describe', () => {
    expect(declared).toContain('id')
    expect(declared.length).toBeGreaterThan(1)
  })

  it('login stores exactly the declared fields', () => {
    const stored = storedUserFields(read('../../server/api/auth/login.post.ts'))
    expect(stored.length).toBeGreaterThan(0)
    expect([...stored].sort()).toEqual([...declared].sort())
  })

  it('never stores the password hash in the session cookie', () => {
    // The session is sealed but still round-trips to the browser.
    for (const file of ['../../server/api/auth/login.post.ts', '../../server/api/auth/register.post.ts']) {
      expect(storedUserFields(read(file))).not.toContain('passwordHash')
    }
  })
})
