/**
 * Drift detector.
 *
 * `shared/schemas/*` is hand-written rather than generated from the Drizzle
 * tables, because `shared/` cannot import server code at runtime and the wire
 * shape is not the storage shape. The cost of that decision is that the two
 * can silently diverge — rename a column and the API contract still compiles
 * while every write fails at runtime.
 *
 * These tests are the mechanism that makes the divergence loud. They run in
 * `pnpm verify`, so an agent that renames a column without updating the
 * contract fails CI instead of shipping a broken endpoint.
 */
import { postCreateSchema } from '#shared/schemas/post'
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { posts, users } from '../../server/database/schema'

describe('post contract matches the posts table', () => {
  const columns = Object.keys(getTableColumns(posts))
  const contractFields = Object.keys(postCreateSchema.shape)

  it.each(contractFields)('field "%s" exists as a column', (field) => {
    expect(columns).toContain(field)
  })

  it('never lets the client set server-owned columns', () => {
    // authorId comes from the session; the timestamps and id come from the DB.
    // If any of these appear in the wire contract, a client could spoof them.
    for (const forbidden of ['id', 'authorId', 'createdAt', 'updatedAt']) {
      expect(contractFields).not.toContain(forbidden)
    }
  })

  it('covers every column that has neither a default nor nullability', () => {
    // A NOT NULL column with no default must be supplied by somebody. If it
    // is not in the contract and not server-owned, inserts will fail.
    const serverOwned = new Set(['id', 'authorId', 'createdAt', 'updatedAt'])
    const required = Object.entries(getTableColumns(posts))
      .filter(([name, col]) =>
        col.notNull && !col.hasDefault && !serverOwned.has(name)
      )
      .map(([name]) => name)

    for (const name of required) {
      expect(contractFields).toContain(name)
    }
  })
})

describe('user table invariants', () => {
  it('keeps passwordHash out of any wire contract', async () => {
    // PublicUser is a type, so this asserts the runtime mapper instead.
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
    expect(Object.keys(getTableColumns(users))).toContain('passwordHash')
  })
})
