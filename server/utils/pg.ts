/**
 * Postgres error helpers. Auto-imported across the server (server/utils/).
 *
 * A SELECT-then-INSERT existence check (see server/api/posts/index.post.ts)
 * has an inherent race: two concurrent requests can both pass the SELECT,
 * and the second INSERT then fails on the unique index instead of the
 * pre-check. Without this guard that failure surfaces as an unhandled 500.
 * Catching it and checking `isUniqueViolation()` lets the handler degrade to
 * the same 409 the pre-check would have thrown.
 *
 * The driver error is WRAPPED: drizzle throws `DrizzleQueryError`, which
 * carries the postgres.js error (with `code` / `constraint_name`) on
 * `.cause`, not on itself. So this walks the cause chain. Checking only the
 * top-level error compiles, looks right, and never matches — the catch
 * becomes dead code and the race 500s anyway, which is exactly how the first
 * version of this file shipped: nothing exercised the race path until
 * tests/e2e/security.spec.ts ran two real concurrent requests.
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

/** First error in the cause chain that looks like a postgres.js error. */
function findPostgresError(error: unknown, depth = 0): PostgresError | undefined {
  if (depth > 5 || error === null || typeof error !== 'object') return undefined
  if (isPostgresError(error)) return error
  return findPostgresError((error as { cause?: unknown }).cause, depth + 1)
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = findPostgresError(error)
  if (!pg || pg.code !== UNIQUE_VIOLATION) return false
  if (constraint === undefined) return true
  return pg.constraint_name === constraint
}
