/**
 * Sliding-window hit counting for the auth rate limiter — the pure half.
 *
 * Split from rate-limit.ts on purpose: this file imports NOTHING, so unit
 * tests (tests/unit/rate-limit.test.ts) can import it under
 * tsconfig.tools.json, where `h3` is not resolvable (pnpm's isolated
 * node_modules exposes only direct dependencies at the root, and `h3` is
 * transitive via Nuxt). The h3-facing wrapper — `enforceRateLimit()`,
 * `clientKey()` — lives in rate-limit.ts, which only the server bundle
 * imports. Both files are auto-imported across the server.
 *
 * This is in-process and per-replica BY DESIGN: state lives in a module-level
 * Map, so it resets on every restart and is not shared across replicas. That
 * is fine for a single-instance deployment (and for this template), but a
 * horizontally-scaled deployment MUST replace the Map below with shared
 * storage (Redis, Postgres, etc.) — otherwise each replica enforces its own
 * independent limit, which is not a limit at all.
 */

const hits = new Map<string, number[]>()

const MAX_TRACKED_KEYS = 10_000

function fullKey(name: string, key: string): string {
  return `${name}:${key}`
}

/**
 * True when `key` has already reached `limit` hits inside the window. Prunes
 * expired timestamps as a side effect, and sweeps the whole table when it
 * grows past MAX_TRACKED_KEYS so a scan of throwaway keys cannot grow memory
 * without bound.
 */
export function isRateLimited(name: string, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const cutoff = now - windowMs
  const target = fullKey(name, key)

  const timestamps = (hits.get(target) ?? []).filter(t => t > cutoff)
  if (timestamps.length > 0) {
    hits.set(target, timestamps)
  } else {
    hits.delete(target)
  }

  if (hits.size > MAX_TRACKED_KEYS) {
    for (const [k, values] of hits) {
      if (values.every(t => t <= cutoff)) hits.delete(k)
    }
  }

  return timestamps.length >= limit
}

export function recordRateLimitHit(name: string, key: string): void {
  const target = fullKey(name, key)
  const timestamps = hits.get(target) ?? []
  timestamps.push(Date.now())
  hits.set(target, timestamps)
}

/** Test-only: clears all tracked hits between test cases. */
export function resetRateLimits(): void {
  hits.clear()
}
