/**
 * Central error observer, two jobs:
 *
 * 1. Scrub database errors in place BEFORE Nitro logs them raw (see below).
 * 2. Record errors where a coding agent can read its own runtime failures —
 *    `.logs/dev-errors.jsonl` in dev (one JSON object per line, `tail`/`grep`
 *    it instead of pasting stack traces), stdout via `logger` in production.
 *
 * Classification: expected 4xx responses (401/404/409/422 thrown with
 * `createError`) are normal request outcomes — they still go to the dev file
 * so an agent can debug its own failing probe, but they are NOT logged at
 * error level. Error-level output and production logging are reserved for
 * 5xx/unhandled failures, so alerting and `[app] ERROR` lines keep their
 * signal.
 */
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const LOG_PATH = resolve(process.cwd(), '.logs/dev-errors.jsonl')

export default defineNitroPlugin((nitroApp) => {
  // Async on purpose: the runtime does `callHookParallel('error', ...)` and
  // passes the resulting promise to `event.waitUntil()`
  // (nitropack/dist/runtime/internal/app.mjs), so this handler IS awaited and
  // its rejections are caught by Nitro itself. A fire-and-forget rewrite
  // would drop that guarantee and let the request finish before the append
  // lands — i.e. `tail .logs/dev-errors.jsonl` could miss the very error it
  // was run for.
  nitroApp.hooks.hook('error', async (error, context) => {
    const event = context?.event
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500
    const expected = statusCode < 500

    // ORDERING CONSTRAINT: everything up to the first `await` runs before
    // Nitro's error handler prints the raw error object for unhandled errors
    // (`onError` starts these hooks synchronously, then calls the handler —
    // nitropack dist/runtime/internal/app.mjs). The scrub below must therefore
    // stay in this synchronous prefix, or drizzle/postgres errors leak the
    // failed query's parameter values (submitted emails, password hashes)
    // into stdout. Scoped to unexpected errors: 4xx from `createError` carry
    // our own messages and field errors, never raw database payloads.
    if (!expected) scrubErrorInPlace(error)

    const payload = redact({
      time: new Date().toISOString(),
      method: event?.method,
      path: event?.path,
      statusCode,
      message: error instanceof Error ? error.message : String(error),
      // `data` carries our field-level validation details (see validateBody).
      data: (error as { data?: unknown }).data,
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 8).join('\n') : undefined
    })

    if (!expected) {
      logger.error(`${payload.method ?? '-'} ${payload.path ?? '-'} -> ${payload.statusCode}`, payload.message)
    }

    if (!import.meta.dev) return

    try {
      await mkdir(dirname(LOG_PATH), { recursive: true })
      await appendFile(LOG_PATH, `${JSON.stringify(payload)}\n`, 'utf8')
    } catch {
      // Never let logging break a request.
    }
  })
})
