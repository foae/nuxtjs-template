/**
 * Regression tests for the log-secret leak found in the 2026-07 project
 * review: a unique-violation on registration produced a drizzle error whose
 * message ended in `params: <email>,<name>,<scrypt hash>`, and that string
 * reached production stdout verbatim — `redact()` only masked sensitive
 * object keys, never the contents of a message string.
 *
 * These tests drive unique MARKER values through the same shapes drizzle and
 * postgres.js actually produce and assert the markers never survive. If you
 * change `redact()` or `scrubErrorInPlace()`, the acceptance bar is: the
 * constraint name and SQL stay (they are the diagnostic), the parameter
 * values go (they are the secret).
 */
import { describe, expect, it } from 'vitest'
import { redact, scrubErrorInPlace } from '../../server/utils/logger'

const EMAIL = 'marker-email@example.com'
const HASH = 'marker-scrypt-hash-f3a9c2'
const NAME = 'Marker Name'

/** The message shape DrizzleQueryError builds for a failed INSERT. */
const DRIZZLE_MESSAGE
  = 'Failed query: insert into "users" ("id", "email", "name", "password_hash") '
    + 'values (default, $1, $2, $3) returning "id", "email"\n'
    + `params: ${EMAIL},${NAME},${HASH}`

/** The `detail` postgres.js exposes on a unique violation. */
const PG_DETAIL = `Key (email)=(${EMAIL}) already exists.`

describe('redact', () => {
  it('masks the params list of a drizzle query error message', () => {
    const out = redact(DRIZZLE_MESSAGE)
    expect(out).not.toContain(EMAIL)
    expect(out).not.toContain(HASH)
    // The SQL itself survives — it is the useful half of the diagnostic.
    expect(out).toContain('Failed query: insert into "users"')
  })

  it('masks the submitted value inside a postgres unique-violation detail', () => {
    const out = redact(PG_DETAIL)
    expect(out).not.toContain(EMAIL)
    expect(out).toContain('Key (')
    expect(out).toContain('already exists')
  })

  it('still masks connection-string credentials and bearer tokens', () => {
    expect(redact('postgres://app:s3cret@db:5432/app')).not.toContain('s3cret')
    expect(redact('authorization: Bearer abc.def-ghi')).not.toContain('abc.def-ghi')
  })

  it('still masks sensitive object keys', () => {
    const out = redact({ passwordHash: HASH, nested: { sessionToken: 'tok' }, ok: 'keep' })
    expect(JSON.stringify(out)).not.toContain(HASH)
    expect(JSON.stringify(out)).not.toContain('tok"')
    expect(out.ok).toBe('keep')
  })
})

describe('scrubErrorInPlace', () => {
  /**
   * Builds the error chain drizzle actually throws: DrizzleQueryError wrapper
   * with the postgres.js error on `cause`. The postgres.js props are defined
   * EXACTLY the way postgres/src/connection.js `queryError` defines them —
   * `Object.defineProperties` with only `value`, i.e. writable:false,
   * configurable:false, enumerable:false. They cannot be masked in place;
   * the scrub must replace the whole node on the parent's `cause` link.
   * A plain-object fixture here would pass while production leaked — that is
   * how the first version of the scrub shipped broken.
   */
  function makeDbError() {
    const cause = Object.assign(new Error(`duplicate key value violates unique constraint "users_email_key"`), {
      name: 'PostgresError',
      code: '23505',
      constraint_name: 'users_email_key',
      detail: PG_DETAIL
    })
    Object.defineProperties(cause, {
      query: { value: 'insert into "users" ("email") values ($1)' },
      parameters: { value: [EMAIL, NAME, HASH] },
      args: { value: [EMAIL, NAME, HASH] },
      types: { value: [25, 25, 25] }
    })
    const wrapper = Object.assign(new Error(DRIZZLE_MESSAGE), {
      params: [EMAIL, NAME, HASH],
      cause
    }) as Error & { params: unknown, cause: unknown }
    return { wrapper, cause }
  }

  /** Dev pretty-printers walk non-enumerable own props too — emulate that. */
  async function printedLikeDevConsole(error: unknown): Promise<string> {
    const { inspect } = await import('node:util')
    return inspect(error, { depth: 8, showHidden: true })
  }

  it('removes parameter values everywhere a printer could find them', async () => {
    const { wrapper } = makeDbError()
    scrubErrorInPlace(wrapper)

    const printed = await printedLikeDevConsole(wrapper)
    expect(printed).not.toContain(EMAIL)
    expect(printed).not.toContain(HASH)
    expect(printed).not.toContain(NAME)
  })

  it('replaces the immutable postgres.js node instead of printing it', async () => {
    const { wrapper, cause } = makeDbError()
    scrubErrorInPlace(wrapper)

    // The original postgres.js object is unfixable by design; the wrapper
    // must now point at a sanitized replacement, not at the original.
    expect(wrapper.cause).not.toBe(cause)
    const printed = await printedLikeDevConsole(wrapper.cause)
    expect(printed).not.toContain(EMAIL)
    expect(printed).not.toContain(HASH)
  })

  it('keeps the diagnostic parts: constraint name, code, SQL shape', () => {
    const { wrapper } = makeDbError()
    scrubErrorInPlace(wrapper)

    const replaced = wrapper.cause as { message: string, code: string, constraint_name: string, name: string }
    expect(replaced.message).toContain('users_email_key')
    expect(replaced.code).toBe('23505')
    expect(replaced.constraint_name).toBe('users_email_key')
    expect(replaced.name).toBe('PostgresError')
    expect(wrapper.message).toContain('Failed query: insert into "users"')
  })

  it('never throws on frozen or exotic error objects', () => {
    const frozen = Object.freeze(Object.assign(new Error(DRIZZLE_MESSAGE), { detail: PG_DETAIL }))
    expect(() => scrubErrorInPlace(frozen)).not.toThrow()
    expect(() => scrubErrorInPlace(null)).not.toThrow()
    expect(() => scrubErrorInPlace('a string')).not.toThrow()
    expect(() => scrubErrorInPlace({ cause: 42 })).not.toThrow()
  })
})
