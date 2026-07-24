/**
 * Structured logging. Auto-imported across the server as `logger`.
 *
 *   logger.info('post created', { postId: post.id })
 *
 * Use a tag per subsystem so output can be filtered:
 *   const log = logger.withTag('auth')
 */
import { consola } from 'consola'

export const logger = consola.withTag('app')

/**
 * Redacts obvious secrets before anything is written to a log or error file.
 * Not exhaustive — it covers connection strings, bearer tokens and any key
 * whose name looks sensitive.
 */
export function redact<T>(value: T): T {
  const SENSITIVE = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|session/i

  const walk = (input: unknown, depth: number): unknown => {
    if (depth > 6) return '[truncated]'
    if (typeof input === 'string') {
      return input
        .replace(/(\w+:\/\/[^:]+:)[^@]+(@)/g, '$1***$2')
        .replace(/(bearer\s+)[\w.-]+/gi, '$1***')
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
