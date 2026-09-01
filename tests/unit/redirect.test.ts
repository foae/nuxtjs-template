/**
 * `safeRedirectPath()` is the open-redirect guard behind `?redirect=` on the
 * login page and the OAuth routes, so the interesting cases are the hostile
 * ones.
 */
import { safeRedirectPath } from '#shared/utils/redirect'
import { describe, expect, it } from 'vitest'

describe('safeRedirectPath', () => {
  it('keeps a same-origin path', () => {
    expect(safeRedirectPath('/posts/new')).toBe('/posts/new')
  })

  it.each([
    ['an absolute URL', 'https://evil.example'],
    ['a protocol-relative URL', '//evil.example'],
    ['a missing value', undefined],
    ['a non-string', 123]
  ])('falls back to / for %s', (_label, value) => {
    expect(safeRedirectPath(value)).toBe('/')
  })
})
