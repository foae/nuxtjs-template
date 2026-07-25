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

/**
 * Field names inside the `user: { ... }` object literal passed to
 * setUserSession().
 *
 * If the call passes something this cannot read — shorthand `{ user }`, a
 * spread, a variable — it THROWS rather than returning an empty list. That
 * distinction is the whole reliability of this file: an earlier version
 * returned `[]` for `register.post.ts` (which used shorthand), so the
 * "never stores the password hash" assertion below was checking an empty array
 * and could not fail. A detector that cannot see its subject must fail loudly,
 * never pass quietly.
 */
function storedUserFields(file: string): string[] {
  const call = /setUserSession\(\s*event\s*,\s*\{([\s\S]*?)\n\s*\}\s*\)/.exec(read(file))?.[1]
  if (call === undefined) {
    throw new Error(`${file}: no \`setUserSession(event, { ... })\` call found`)
  }

  const literal = /\buser\s*:\s*\{([^{}]*)\}/.exec(call)?.[1]
  if (literal === undefined) {
    throw new Error(
      `${file}: setUserSession() does not pass \`user\` as an inline object `
      + `literal, so this test cannot see what gets sealed into the cookie. `
      + `Write the fields out at the call site — \`user: { id: user.id, ... }\`.`
    )
  }

  // Split on commas rather than matching per line, so a one-line literal and a
  // multi-line one both parse, and shorthand fields inside it still count.
  return literal
    .split(',')
    .map(part => /^\s*(\w+)/.exec(part)?.[1])
    .filter((name): name is string => name !== undefined)
}

const HANDLERS = [
  '../../server/api/auth/login.post.ts',
  '../../server/api/auth/register.post.ts'
]

describe('session shape matches its type augmentation', () => {
  const declared = declaredUserFields()

  it('declares the fields the augmentation is supposed to describe', () => {
    expect(declared).toContain('id')
    expect(declared.length).toBeGreaterThan(1)
  })

  // Every handler, not just login: two handlers writing different shapes into
  // the same cookie is exactly the drift this is here to catch.
  for (const file of HANDLERS) {
    it(`${file.split('/').pop()} stores exactly the declared fields`, () => {
      const stored = storedUserFields(file)
      expect(stored.length).toBeGreaterThan(0)
      expect([...stored].sort()).toEqual([...declared].sort())
    })
  }

  it('never stores the password hash in the session cookie', () => {
    // The session is sealed, but it still round-trips to the browser.
    for (const file of HANDLERS) {
      expect(storedUserFields(file), file).not.toContain('passwordHash')
    }
  })
})
