/**
 * Structured logging. Auto-imported across the server as `logger`.
 *
 *   logger.info('post created', { postId: post.id })
 *
 * Use a tag per subsystem so output can be filtered:
 *   const log = logger.withTag('auth')
 *
 * `logger` itself does NOT redact — redaction happens where log payloads are
 * assembled (see server/plugins/error-log.ts calling `redact()`). Redaction is
 * pattern-based and not exhaustive: never log raw request bodies, credentials
 * or full error objects that might wrap a database error.
 */
import { consola } from 'consola'

export const logger = consola.withTag('app')

/**
 * Redacts obvious secrets before anything is written to a log or error file.
 * Not exhaustive — it covers connection strings, bearer tokens, any key whose
 * name looks sensitive, and the two database error shapes that carry user
 * input:
 *
 *   - drizzle's DrizzleQueryError message ends in `params: <val>,<val>,...` —
 *     on a failed INSERT into users that list contains the submitted email
 *     and the scrypt password hash
 *   - Postgres unique-violation `detail` reads `Key (email)=(<val>) already
 *     exists.`
 *
 * The SQL text and constraint name are kept: they are the diagnostic, the
 * parameter values are the secret.
 */
export function redact<T>(value: T): T {
  const SENSITIVE = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|session/i

  const walk = (input: unknown, depth: number): unknown => {
    if (depth > 6) return '[truncated]'
    if (typeof input === 'string') {
      return input
        .replace(/(\w+:\/\/[^:]+:)[^@]+(@)/g, '$1***$2')
        .replace(/(bearer\s+)[\w.-]+/gi, '$1***')
        .replace(/(params:\s*).+$/gim, '$1***')
        .replace(/(Key \([^)]*\)=\()[^)]*(\))/g, '$1***$2')
    }
    if (Array.isArray(input)) return input.map(v => walk(v, depth + 1))
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([k, v]) =>
          [k, SENSITIVE.test(k) ? '***' : walk(v, depth + 1)]
        )
      )
    }
    return input
  }

  return walk(value, 0) as T
}

/**
 * Postgres/drizzle attach the failed query's raw inputs to the error object
 * itself — postgres.js sets `parameters`/`args`, drizzle sets `params`, and
 * Postgres puts submitted values into `detail`/`where`/`internal_query`.
 * Anything that prints the error object (not just its message) prints those
 * too — and dev pretty-printers walk NON-enumerable own props as well.
 */
const DB_VALUE_PROPS = ['parameters', 'params', 'args', 'detail', 'where', 'internal_query'] as const

const REDACTED = '[redacted]'

/** True when any value-bearing prop still exposes something after masking. */
function stillLeaky(target: Record<string, unknown>): boolean {
  return DB_VALUE_PROPS.some((prop) => {
    try {
      return prop in target && target[prop] !== undefined && target[prop] !== REDACTED
    } catch {
      return true
    }
  })
}

/**
 * A plain replacement for an error whose leaky props cannot be masked.
 * postgres.js defines `query`/`parameters`/`args`/`types` with
 * `Object.defineProperties(err, { prop: { value } })` — writable:false,
 * configurable:false (postgres/src/connection.js `queryError`) — so they can
 * neither be assigned nor redefined. The only way to stop them printing is to
 * not print that object: the clone copies name/message/stack (redacted) and
 * the enumerable diagnostic fields, and simply does not carry the immutable
 * value props.
 */
function sanitizedClone(target: Record<string, unknown>): Error {
  const clone = new Error(
    typeof target.message === 'string' ? redact(target.message) : 'redacted error'
  ) as Error & Record<string, unknown>
  if (typeof target.name === 'string') clone.name = target.name
  clone.stack = typeof target.stack === 'string' ? redact(target.stack) : undefined

  for (const [key, value] of Object.entries(target)) {
    if ((DB_VALUE_PROPS as readonly string[]).includes(key)) continue
    if (key === 'cause' || key === 'message' || key === 'stack' || key === 'name') continue
    // Strings pass through redact; anything structured is dropped wholesale —
    // a diagnostic field is a code or a name, not an object.
    clone[key] = typeof value === 'string'
      ? redact(value)
      : (typeof value === 'object' && value !== null ? REDACTED : value)
  }
  return clone
}

/**
 * Scrubs secrets out of an error object IN PLACE, following the `cause` chain
 * (drizzle wraps the postgres.js error as `cause`).
 *
 * In place is the point, not laziness: Nitro's `onError` starts the `error`
 * hooks synchronously and then hands the SAME error object to its default
 * handler, which does `console.error(..., error)` for unhandled errors
 * (nitropack dist/runtime/internal/{app,error/prod}.mjs). Mutating the object
 * during the hook's synchronous prefix is what keeps that raw print clean —
 * scrubbing a copy would leave Nitro logging the original. See
 * server/plugins/error-log.ts for the ordering constraint on the caller.
 *
 * When a node in the chain cannot be masked (postgres.js's immutable props,
 * see sanitizedClone), the node is REPLACED on its parent's writable `cause`
 * link instead. The one shape this cannot fix is a top-level postgres.js
 * error with no wrapper — drizzle always wraps, so that would take a raw
 * driver call throwing straight out of a handler.
 */
export function scrubErrorInPlace(error: unknown, depth = 0): void {
  if (depth > 5 || error === null || typeof error !== 'object') return
  const target = error as Record<string, unknown> & { message?: unknown, stack?: unknown, cause?: unknown }

  if (typeof target.message === 'string') {
    try {
      target.message = redact(target.message)
    } catch { /* read-only message: covered by the clone path below */ }
  }
  if (typeof target.stack === 'string') {
    try {
      target.stack = redact(target.stack)
    } catch { /* as above */ }
  }
  for (const prop of DB_VALUE_PROPS) {
    try {
      if (prop in target && target[prop] !== undefined) target[prop] = REDACTED
    } catch {
      // Non-writable (postgres.js) — handled by the parent via sanitizedClone.
    }
  }

  const cause = target.cause
  if (cause !== null && typeof cause === 'object') {
    scrubErrorInPlace(cause, depth + 1)
    if (stillLeaky(cause as Record<string, unknown>)) {
      try {
        const replacement = sanitizedClone(cause as Record<string, unknown>)
        // Deeper links were already scrubbed by the recursive call above.
        replacement.cause = (cause as { cause?: unknown }).cause
        target.cause = replacement
      } catch { /* cause itself read-only: nothing further we can reach */ }
    }
  }
}
