/**
 * Postgres error helpers. Auto-imported across the server (server/utils/).
 *
 * A SELECT-then-INSERT existence check (see server/api/posts/index.post.ts)
 * has an inherent race: two concurrent requests can both pass the SELECT,
 * and the second INSERT then fails on the unique index instead of the
 * pre-check. Without this guard that failure surfaces as an unhandled 500.
 * Catching it and checking `isUniqueViolation()` lets the handler degrade to
 * the same 409 the pre-check would have thrown.
 */

interface PostgresError {
  code: string
  constraint_name?: string
}

const UNIQUE_VIOLATION = '23505'

function isPostgresError(error: unknown): error is PostgresError {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof (error as { code: unknown }).code === 'string'
  )
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!isPostgresError(error) || error.code !== UNIQUE_VIOLATION) return false
  if (constraint === undefined) return true
  return error.constraint_name === constraint
}
