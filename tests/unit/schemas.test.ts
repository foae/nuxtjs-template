/**
 * Contract rules. These run against the same schema objects the server
 * validates with and the forms bind to, so a rule proven here holds
 * everywhere.
 */
import { credentialsSchema } from '#shared/schemas/auth'
import { postCreateSchema, postListQuerySchema } from '#shared/schemas/post'
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
})
