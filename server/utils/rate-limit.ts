/**
 * Minimal in-process rate limiter for auth endpoints — the h3-facing half.
 * The counting mechanics (and the per-replica caveat that matters before
 * deploying this anywhere serious) live in rate-limit-core.ts.
 *
 * Counting strategy differs by caller: login counts only FAILED attempts, so
 * a legitimate user retyping a password a few times (or an e2e suite hitting
 * login repeatedly) isn't punished, while a brute-force script still trips
 * the limit. Registration counts every attempt, since there's no notion of a
 * "wrong" registration.
 *
 * `clientKey()` deliberately passes `xForwardedFor: false` to `getRequestIP`:
 * trusting that header when there is no reverse proxy in front of the app
 * lets any client set it to whatever IP it wants, defeating the limiter
 * entirely. Behind a real reverse proxy, switch this to `true` — but only
 * once the proxy is configured to strip/overwrite client-supplied
 * `X-Forwarded-For` values, or the same spoofing problem reappears at the
 * new trust boundary.
 */
import { createError, getRequestIP, type H3Event } from 'h3'
import { isRateLimited } from './rate-limit-core'

export interface RateLimitOptions {
  name: string
  key: string
  limit: number
  windowMs: number
}

/** Throws a 429 when `key` has hit `limit` inside the window. Does NOT count
 *  the attempt — call `recordRateLimitHit()` for that (see counting strategy
 *  above). The 429 carries no `data.errors`: it is not attributable to one
 *  field, so `useApiForm()` surfaces it as a toast. */
export function enforceRateLimit(options: RateLimitOptions): void {
  const { name, key, limit, windowMs } = options
  if (isRateLimited(name, key, limit, windowMs)) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many attempts',
      message: 'Too many attempts — try again later'
    })
  }
}

/** Returns the client's IP for use as a rate-limit key. See doc-comment above
 *  for why `xForwardedFor` is deliberately `false`. */
export function clientKey(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: false }) ?? 'unknown'
}
