/**
 * Unit tests for the in-process auth rate limiter's counting core. See
 * server/utils/rate-limit-core.ts for the design rationale (per-replica,
 * in-process, replace with shared storage before horizontal scaling).
 *
 * Only the pure core is imported here: the h3-facing wrapper
 * (`enforceRateLimit`, `clientKey` in server/utils/rate-limit.ts) needs the
 * `h3` package, which tsconfig.tools.json cannot resolve — its 429 behaviour
 * is covered end-to-end in tests/e2e instead.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isRateLimited,
  recordRateLimitHit,
  resetRateLimits
} from '../../server/utils/rate-limit-core'

describe('rate limit core', () => {
  beforeEach(() => {
    resetRateLimits()
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  it('allows attempts under the limit', () => {
    expect(isRateLimited('test', 'a', 3, 1000)).toBe(false)
    recordRateLimitHit('test', 'a')
    expect(isRateLimited('test', 'a', 3, 1000)).toBe(false)
    recordRateLimitHit('test', 'a')
    expect(isRateLimited('test', 'a', 3, 1000)).toBe(false)
  })

  it('limits once the threshold is reached', () => {
    recordRateLimitHit('test', 'b')
    recordRateLimitHit('test', 'b')
    expect(isRateLimited('test', 'b', 2, 1000)).toBe(true)
  })

  it('scopes keys by name, so one endpoint cannot exhaust another', () => {
    recordRateLimitHit('login-failures', 'same-key')
    expect(isRateLimited('register', 'same-key', 1, 1000)).toBe(false)
  })

  it('frees the key again once the window expires', () => {
    recordRateLimitHit('test', 'c')
    expect(isRateLimited('test', 'c', 1, 1000)).toBe(true)

    vi.setSystemTime(1001)
    expect(isRateLimited('test', 'c', 1, 1000)).toBe(false)
  })

  it('resetRateLimits clears all tracked hits', () => {
    recordRateLimitHit('test', 'd')
    expect(isRateLimited('test', 'd', 1, 1000)).toBe(true)

    resetRateLimits()
    expect(isRateLimited('test', 'd', 1, 1000)).toBe(false)
  })
})
