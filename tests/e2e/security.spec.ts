/**
 * Security-focused end-to-end coverage: authorization boundaries, strict
 * contract enforcement, concurrent-write races and the auth rate limiter,
 * plus the app-level security-header baseline.
 *
 * Assumes a freshly seeded database (`pnpm db:reset`). The seed is
 * deterministic, so these tests reference seeded content by literal text.
 */
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test'
import { expect, test } from '@playwright/test'

const PORT = process.env.E2E_PORT ?? '3199'
const BASE_URL = `http://localhost:${PORT}`

const ADA = { email: 'ada@example.com', password: 'correct-horse-battery-staple' }
const GRACE = { email: 'grace@example.com', password: 'correct-horse-battery-staple' }

const POST_HELLO = '00000000-0000-4000-8000-000000000101' // Ada's, published
const POST_DRAFT = '00000000-0000-4000-8000-000000000102' // Grace's, unpublished

/** A fresh, authenticated API request context. `playwright.request.newContext()`
 *  does not inherit the project's `use.baseURL`, so it is passed explicitly. */
async function signedInContext(
  playwright: PlaywrightWorkerArgs['playwright'],
  user: { email: string, password: string }
): Promise<APIRequestContext> {
  const context = await playwright.request.newContext({ baseURL: BASE_URL })
  const response = await context.post('/api/auth/login', { data: user })
  expect(response.status()).toBe(200)
  return context
}

test('an anonymous caller cannot mutate: POST, PATCH and DELETE are 401', async ({ playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: BASE_URL })
  try {
    const post = await anon.post('/api/posts', {
      data: { title: 'Anon', slug: 'anon-post', body: '', published: false }
    })
    expect(post.status()).toBe(401)

    const patch = await anon.patch(`/api/posts/${POST_HELLO}`, { data: { title: 'x' } })
    expect(patch.status()).toBe(401)

    const del = await anon.delete(`/api/posts/${POST_HELLO}`)
    expect(del.status()).toBe(401)
  } finally {
    await anon.dispose()
  }
})

test('a signed-in non-owner gets 404 for another user\'s draft', async ({ playwright }) => {
  const ada = await signedInContext(playwright, ADA)
  try {
    const response = await ada.get(`/api/posts/${POST_DRAFT}`)
    expect(response.status()).toBe(404)
  } finally {
    await ada.dispose()
  }
})

test('the owner still sees their draft', async ({ playwright }) => {
  const grace = await signedInContext(playwright, GRACE)
  try {
    const response = await grace.get(`/api/posts/${POST_DRAFT}`)
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.published).toBe(false)
  } finally {
    await grace.dispose()
  }
})

test('a non-owner cannot PATCH or DELETE another user\'s post: 404, not 403', async ({ playwright }) => {
  const ada = await signedInContext(playwright, ADA)
  const grace = await signedInContext(playwright, GRACE)
  try {
    const patch = await ada.patch(`/api/posts/${POST_DRAFT}`, { data: { title: 'x' } })
    expect(patch.status()).toBe(404)

    const del = await ada.delete(`/api/posts/${POST_DRAFT}`)
    expect(del.status()).toBe(404)

    const stillThere = await grace.get(`/api/posts/${POST_DRAFT}`)
    expect(stillThere.status()).toBe(200)
    const body = await stillThere.json()
    expect(body.title).toBe('Unpublished draft')
  } finally {
    await ada.dispose()
    await grace.dispose()
  }
})

test('a typoed PATCH field is a 422, not a silent no-op', async ({ playwright }) => {
  const ada = await signedInContext(playwright, ADA)
  try {
    const patch = await ada.patch(`/api/posts/${POST_HELLO}`, { data: { publish: false } })
    expect(patch.status()).toBe(422)
    const body = await patch.json()
    expect(body.data.errors).toBeTruthy()

    const after = await ada.get(`/api/posts/${POST_HELLO}`)
    const afterBody = await after.json()
    expect(afterBody.published).toBe(true)
  } finally {
    await ada.dispose()
  }
})

test('an empty PATCH body is a 422', async ({ playwright }) => {
  const ada = await signedInContext(playwright, ADA)
  try {
    const patch = await ada.patch(`/api/posts/${POST_HELLO}`, { data: {} })
    expect(patch.status()).toBe(422)
  } finally {
    await ada.dispose()
  }
})

test('concurrent duplicate registrations: one 201, one 409', async ({ playwright }) => {
  // Was a raw 500 + password-hash log leak before the fix: the SELECT-then-
  // INSERT race let a concurrent request slip past the existence check.
  const email = `race-${Date.now()}@example.com`
  const payload = { email, name: 'Race Condition', password: 'correct-horse-battery-staple' }

  const contextA = await playwright.request.newContext({ baseURL: BASE_URL })
  const contextB = await playwright.request.newContext({ baseURL: BASE_URL })
  try {
    const [responseA, responseB] = await Promise.all([
      contextA.post('/api/auth/register', { data: payload }),
      contextB.post('/api/auth/register', { data: payload })
    ])

    const statuses = [responseA.status(), responseB.status()].sort((a, b) => a - b)
    expect(statuses).toEqual([201, 409])

    const conflict = responseA.status() === 409 ? responseA : responseB
    const conflictBody = await conflict.json()
    expect(conflictBody.data.errors.email).toBeTruthy()
  } finally {
    await contextA.dispose()
    await contextB.dispose()
  }
})

test('concurrent slug PATCHes: one 200, one 409', async ({ playwright }) => {
  const ada = await signedInContext(playwright, ADA)
  try {
    const unique = Date.now()
    const created = await Promise.all([
      ada.post('/api/posts', {
        data: { title: 'Race A', slug: `race-a-${unique}`, body: '', published: false }
      }),
      ada.post('/api/posts', {
        data: { title: 'Race B', slug: `race-b-${unique}`, body: '', published: false }
      })
    ])
    expect(created[0].status()).toBe(201)
    expect(created[1].status()).toBe(201)
    const postA = await created[0].json()
    const postB = await created[1].json()

    const targetSlug = `race-target-${unique}`
    const [patchA, patchB] = await Promise.all([
      ada.patch(`/api/posts/${postA.id}`, { data: { slug: targetSlug } }),
      ada.patch(`/api/posts/${postB.id}`, { data: { slug: targetSlug } })
    ])

    const statuses = [patchA.status(), patchB.status()].sort((a, b) => a - b)
    expect(statuses).toEqual([200, 409])

    const conflict = patchA.status() === 409 ? patchA : patchB
    const conflictBody = await conflict.json()
    expect(conflictBody.data.errors.slug).toBeTruthy()
  } finally {
    await ada.dispose()
  }
})

test('login is rate limited after repeated failures', async ({ playwright }) => {
  // Keep this LAST: the limiter's key is `${ip}:${email}`, so a dedicated,
  // unregistered email keeps it from interacting with Ada/Grace logins
  // elsewhere in the suite. The limiter's Map lives for the whole server
  // process, not per test, which is why the key must be unique to this test.
  const email = 'rate-limit-probe@example.com'
  const anon = await playwright.request.newContext({ baseURL: BASE_URL })
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await anon.post('/api/auth/login', {
        data: { email, password: 'wrong-password-wrong' }
      })
      expect(response.status()).toBe(401)
    }

    const sixth = await anon.post('/api/auth/login', {
      data: { email, password: 'wrong-password-wrong' }
    })
    expect(sixth.status()).toBe(429)
  } finally {
    await anon.dispose()
  }
})

test('security headers are served and x-powered-by is not', async ({ playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: BASE_URL })
  try {
    const page = await anon.get('/')
    expect(page.headers()['x-content-type-options']).toBe('nosniff')
    expect(page.headers()['x-frame-options']).toBe('DENY')
    expect(page.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(page.headers()['permissions-policy']).toBeTruthy()
    expect(page.headers()['x-powered-by']).toBeUndefined()

    const api = await anon.get('/api/posts')
    expect(api.headers()['x-content-type-options']).toBe('nosniff')
    expect(api.headers()['x-frame-options']).toBe('DENY')
    expect(api.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(api.headers()['permissions-policy']).toBeTruthy()
    expect(api.headers()['x-powered-by']).toBeUndefined()
  } finally {
    await anon.dispose()
  }
})
