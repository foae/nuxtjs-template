/**
 * Contract rules. These run against the same schema objects the server
 * validates with and the forms bind to, so a rule proven here holds
 * everywhere.
 */
import { credentialsSchema, registerSchema } from '#shared/schemas/auth'
import { postCreateSchema, postListQuerySchema, postUpdateSchema } from '#shared/schemas/post'
import { describe, expect, it } from 'vitest'

describe('postCreateSchema', () => {
  it('accepts a well-formed post and applies defaults', () => {
    const result = postCreateSchema.parse({ title: 'Hello', slug: 'hello' })
    expect(result).toMatchObject({ body: '', published: false })
  })

  it.each([
    ['Uppercase', 'Hello-World'],
    ['spaces', 'hello world'],
    ['leading hyphen', '-hello'],
    ['trailing hyphen', 'hello-'],
    ['double hyphen', 'hello--world'],
    ['empty', '']
  ])('rejects %s slugs', (_label, slug) => {
    expect(postCreateSchema.safeParse({ title: 'T', slug }).success).toBe(false)
  })

  it('accepts valid slugs', () => {
    for (const slug of ['hello', 'hello-world', 'a1-b2-c3', '2026-review']) {
      expect(postCreateSchema.safeParse({ title: 'T', slug }).success).toBe(true)
    }
  })

  it('rejects an unknown field rather than silently dropping it', () => {
    expect(postCreateSchema.safeParse({ title: 'a', slug: 'a', extra: 1 }).success).toBe(false)
  })

  it('rejects a whitespace-only title after trimming', () => {
    expect(postCreateSchema.safeParse({ title: '   ', slug: 'a' }).success).toBe(false)
  })
})

describe('postUpdateSchema', () => {
  /**
   * Regression: this schema was built with `postCreateSchema.partial()`.
   * `.partial()` does not strip `.default()`, so a PATCH of only the title
   * also wrote `body: ''` and `published: false` — renaming a post wiped its
   * body and unpublished it. Every check in `pnpm verify` passed.
   */
  it('does not inject defaults for omitted fields', () => {
    expect(postUpdateSchema.parse({ title: 'Only the title' }))
      .toEqual({ title: 'Only the title' })
  })

  // The schema itself still accepts `{}` — an empty-body PATCH is
  // syntactically valid. It is server/api/posts/[id].patch.ts, not this
  // schema, that turns an empty result into a 422: a silent 200 no-op is a
  // false green even though no unknown-key stripping is involved.
  it('parses an empty patch to an empty object', () => {
    expect(postUpdateSchema.parse({})).toEqual({})
  })

  it('still validates the fields that are present', () => {
    expect(postUpdateSchema.safeParse({ slug: 'Not A Slug' }).success).toBe(false)
    expect(postUpdateSchema.safeParse({ title: '' }).success).toBe(false)
  })

  it('keeps explicit falsy values rather than dropping them', () => {
    expect(postUpdateSchema.parse({ published: false })).toEqual({ published: false })
    expect(postUpdateSchema.parse({ body: '' })).toEqual({ body: '' })
  })

  it('rejects an unknown field rather than silently no-oping', () => {
    expect(postUpdateSchema.safeParse({ publish: false }).success).toBe(false)
  })

  it('accepts a single known field with only that field in the output', () => {
    const result = postUpdateSchema.parse({ title: 'x' })
    expect(result).toEqual({ title: 'x' })
    expect(Object.keys(result)).toEqual(['title'])
  })
})

describe('postListQuerySchema', () => {
  it('coerces query strings to numbers', () => {
    expect(postListQuerySchema.parse({ limit: '50', offset: '10' }))
      .toMatchObject({ limit: 50, offset: 10 })
  })

  it('falls back to defaults when absent', () => {
    expect(postListQuerySchema.parse({})).toMatchObject({ limit: 20, offset: 0 })
  })

  it('rejects an out-of-range limit rather than clamping it', () => {
    expect(postListQuerySchema.safeParse({ limit: '9999' }).success).toBe(false)
  })

  it('turns the published string into a boolean', () => {
    expect(postListQuerySchema.parse({ published: 'true' }).published).toBe(true)
    expect(postListQuerySchema.parse({ published: 'false' }).published).toBe(false)
    expect(postListQuerySchema.parse({}).published).toBeUndefined()
  })
})

describe('credentialsSchema', () => {
  it('lowercases the email so logins are case-insensitive', () => {
    expect(credentialsSchema.parse({
      email: 'Ada@Example.COM',
      password: 'correct-horse-battery-staple'
    }).email).toBe('ada@example.com')
  })

  it('requires a password of at least 12 characters', () => {
    expect(credentialsSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false)
  })

  it('strips an unknown field rather than rejecting it (documented asymmetry with registerSchema)', () => {
    const result = credentialsSchema.safeParse({
      email: 'a@b.co',
      password: 'correct-horse-battery-staple',
      extra: 1
    })
    expect(result.success).toBe(true)
    expect(result.success && 'extra' in result.data).toBe(false)
  })
})

describe('registerSchema', () => {
  it('rejects an unknown field', () => {
    const result = registerSchema.safeParse({
      email: 'a@b.co',
      password: 'correct-horse-battery-staple',
      name: 'Ada',
      extra: 1
    })
    expect(result.success).toBe(false)
  })

  it('rejects a whitespace-only name after trimming', () => {
    const result = registerSchema.safeParse({
      email: 'a@b.co',
      password: 'correct-horse-battery-staple',
      name: '   '
    })
    expect(result.success).toBe(false)
  })
})
