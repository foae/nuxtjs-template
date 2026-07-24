/**
 * Writes every unhandled server error to `.logs/dev-errors.jsonl` in dev.
 *
 * This exists specifically so a coding agent can read its own runtime
 * failures — `tail`/`grep` the file — instead of needing a human to copy a
 * stack trace out of the terminal. One JSON object per line.
 *
 * Disabled outside development: in production the same errors go to stdout
 * via `logger`, where a real log collector can pick them up.
 */
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const LOG_PATH = resolve(process.cwd(), '.logs/dev-errors.jsonl')

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', async (error, context) => {
    const event = context?.event
    const payload = redact({
      time: new Date().toISOString(),
      method: event?.method,
      path: event?.path,
      statusCode: (error as { statusCode?: number }).statusCode ?? 500,
      message: error instanceof Error ? error.message : String(error),
      // `data` carries our field-level validation details (see validateBody).
      data: (error as { data?: unknown }).data,
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 8).join('\n') : undefined
    })

    logger.error(`${payload.method ?? '-'} ${payload.path ?? '-'} -> ${payload.statusCode}`, payload.message)

    if (!import.meta.dev) return

    try {
      await mkdir(dirname(LOG_PATH), { recursive: true })
      await appendFile(LOG_PATH, `${JSON.stringify(payload)}\n`, 'utf8')
    } catch {
      // Never let logging break a request.
    }
  })
})
