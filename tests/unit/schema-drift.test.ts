/**
 * Drift detector — convention-driven, so it covers new resources for free.
 *
 * `shared/schemas/*` is hand-written rather than generated from the Drizzle
 * tables: `shared/` cannot import server code at runtime (it is bundled into
 * the browser too), and the wire shape is deliberately not the storage shape.
 * The cost of that decision is that the two can silently diverge — rename a
 * column and the contract still compiles while every write fails at runtime.
 *
 * Rather than hand-write a test per resource (which an agent would forget to
 * copy), this discovers every `<name>CreateSchema` exported from
 * `shared/schemas/` and checks it against the matching table. Adding
 * `commentCreateSchema` + a `comments` table gets protection automatically.
 *
 * `TABLES_WITHOUT_A_WIRE_CONTRACT` forces an explicit decision: add a table
 * with no contract and this suite fails until you either write one or record
 * why the table doesn't need one.
 */
import { getTableColumns, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as schema from '../../server/database/schema'

const SCHEMAS_DIR = fileURLToPath(new URL('../../shared/schemas', import.meta.url))

/**
 * Tables that intentionally have no `*CreateSchema`. Each entry needs a
 * reason — this list is a decision record, not a mute button.
 */
const TABLES_WITHOUT_A_WIRE_CONTRACT: Record<string, string> = {
  // Accounts are created through shared/schemas/auth.ts (registerSchema),
  // which is shaped by the auth flow rather than by the table.
  users: 'created via registerSchema in shared/schemas/auth.ts'
}

/** Columns the server always owns. A client must never be able to set these. */
const SERVER_OWNED = new Set(['id', 'createdAt', 'updatedAt', 'authorId', 'userId'])

// Cast rather than narrow with a type predicate: each export has its own
// literal table type, so a predicate over the union doesn't typecheck.
const tables: Array<[string, PgTable]> = Object.entries(schema)
  .filter(([, value]) => is(value, PgTable))
  .map(([name, value]) => [name, value as PgTable])

function tableFor(resource: string): [string, PgTable] | undefined {
  // `post` -> `posts`, `category` -> `categories`.
  const candidates = [`${resource}s`, `${resource}es`, `${resource.replace(/y$/, 'ie')}s`, resource]
  return tables.find(([name]) => candidates.includes(name))
}

async function discoverContracts() {
  const found: Array<{ resource: string, file: string, shape: z.ZodRawShape }> = []

  for (const file of readdirSync(SCHEMAS_DIR).filter(f => f.endsWith('.ts'))) {
    const module = await import(join(SCHEMAS_DIR, file)) as Record<string, unknown>

    for (const [exportName, value] of Object.entries(module)) {
      const match = /^(.+)CreateSchema$/.exec(exportName)
      if (!match || !(value instanceof z.ZodObject)) continue
      found.push({ resource: match[1]!, file: basename(file), shape: value.shape })
    }
  }

  return found
}

const contracts = await discoverContracts()

describe('wire contracts match their tables', () => {
  it('finds at least one contract (guards against the discovery breaking)', () => {
    expect(contracts.length).toBeGreaterThan(0)
  })

  describe.each(contracts)('$resource ($file)', ({ resource, shape }) => {
    const resolved = tableFor(resource)

    it('maps to a real table', () => {
      expect(resolved, `no table matches "${resource}"`).toBeDefined()
    })

    it('only names columns that exist', () => {
      const columns = Object.keys(getTableColumns(resolved![1]))
      for (const field of Object.keys(shape)) {
        expect(columns, `${resource}: contract field "${field}"`).toContain(field)
      }
    })

    it('never lets a client set server-owned columns', () => {
      for (const field of Object.keys(shape)) {
        expect(SERVER_OWNED, `${resource}: "${field}" is server-owned`).not.toContain(field)
      }
    })

    it('covers every column that is required and has no default', () => {
      const required = Object.entries(getTableColumns(resolved![1]))
        .filter(([name, col]) => col.notNull && !col.hasDefault && !SERVER_OWNED.has(name))
        .map(([name]) => name)

      for (const name of required) {
        expect(Object.keys(shape), `${resource}: column "${name}" is unsettable`).toContain(name)
      }
    })
  })
})

describe('every table is accounted for', () => {
  it('has a wire contract, or a recorded reason for not having one', () => {
    const covered = new Set(
      contracts
        .map(c => tableFor(c.resource)?.[0])
        .filter((name): name is string => name !== undefined)
    )

    const orphans = tables
      .map(([name]) => name)
      .filter(name => !covered.has(name) && !(name in TABLES_WITHOUT_A_WIRE_CONTRACT))

    expect(
      orphans,
      `Add a *CreateSchema in shared/schemas/, or record the table in `
      + `TABLES_WITHOUT_A_WIRE_CONTRACT with a reason.`
    ).toEqual([])
  })
})

describe('response mapping', () => {
  it('never leaks the password hash or email of a post author', async () => {
    const { toPostWithAuthor } = await import('../../server/utils/posts')

    const mapped = toPostWithAuthor({
      id: 'p1',
      authorId: 'u1',
      title: 't',
      slug: 's',
      body: 'b',
      published: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      author: {
        id: 'u1',
        email: 'secret@example.com',
        name: 'Name',
        avatarUrl: null,
        passwordHash: 'super-secret-hash',
        createdAt: new Date(0)
      }
    })

    const serialised = JSON.stringify(mapped)
    expect(serialised).not.toContain('super-secret-hash')
    expect(serialised).not.toContain('secret@example.com')
  })
})
