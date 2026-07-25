/**
 * Regression tests for isUniqueViolation().
 *
 * The subtle case is the WRAPPED error: drizzle throws DrizzleQueryError with
 * the postgres.js error on `.cause`, and the first version of the helper only
 * looked at the top-level object — so every `.catch(isUniqueViolation(...))`
 * in the handlers was dead code and unique races still 500ed. The e2e
 * concurrency tests (tests/e2e/security.spec.ts) caught it; these pin the
 * unwrapping so a refactor cannot quietly reintroduce it.
 */
import { describe, expect, it } from 'vitest'
import { isUniqueViolation } from '../../server/utils/pg'

function pgError(code: string, constraint?: string) {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code,
    constraint_name: constraint
  })
}

describe('isUniqueViolation', () => {
  it('matches a bare postgres.js error', () => {
    expect(isUniqueViolation(pgError('23505', 'users_email_key'), 'users_email_key')).toBe(true)
  })

  it('matches the drizzle-wrapped shape: postgres error on .cause', () => {
    const wrapped = Object.assign(new Error('Failed query: insert into "users" ...'), {
      cause: pgError('23505', 'users_email_key')
    })
    expect(isUniqueViolation(wrapped, 'users_email_key')).toBe(true)
    expect(isUniqueViolation(wrapped)).toBe(true)
  })

  it('rejects a different constraint and a different code', () => {
    const wrapped = Object.assign(new Error('x'), { cause: pgError('23505', 'posts_slug_key') })
    expect(isUniqueViolation(wrapped, 'users_email_key')).toBe(false)
    expect(isUniqueViolation(Object.assign(new Error('x'), { cause: pgError('23503') }))).toBe(false)
  })

  it('handles non-errors and missing causes without throwing', () => {
    expect(isUniqueViolation(undefined)).toBe(false)
    expect(isUniqueViolation('boom')).toBe(false)
    expect(isUniqueViolation(new Error('no cause'))).toBe(false)
  })
})
