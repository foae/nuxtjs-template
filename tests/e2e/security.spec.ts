/**
 * Security-focused end-to-end coverage: authorization boundaries, strict
 * contract enforcement, concurrent-write races, Better Auth behavior and the
 * app-level security-header baseline.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test'
import postgres from 'postgres'
import { expect, test } from './fixtures'

const PORT = process.env.E2E_PORT ?? '3199'
const BASE_URL = `http://localhost:${PORT}`
const AUTH_HEADERS = { Origin: BASE_URL }
const MAIL_CAPTURE_DIR = process.env.AUTH_MAIL_CAPTURE_DIR

const ADA = { email: 'ada@example.com', password: 'correct-horse-battery-staple' }
const GRACE = { email: 'grace@example.com', password: 'correct-horse-battery-staple' }

const POST_HELLO = '00000000-0000-4000-8000-000000000101' // Ada's, published
const POST_DRAFT = '00000000-0000-4000-8000-000000000102' // Grace's, unpublished

type Credentials = { email: string, password: string }
type CapturedEmail = { to: string, kind: 'verification' | 'password-reset', url: string }

function e2eDatabaseUrl(): string {
  const value = process.env.E2E_DATABASE_URL
  if (!value) throw new Error('E2E_DATABASE_URL is required for E2E rate-limit cleanup.')
  return value
}

function captureDirectory(): string {
  if (!MAIL_CAPTURE_DIR) throw new Error('AUTH_MAIL_CAPTURE_DIR is required for Better Auth E2E mail assertions.')
  return MAIL_CAPTURE_DIR
}

function newCredentials(): Credentials {
  return {
    email: `e2e-${randomUUID()}@example.com`,
    password: 'correct-horse-battery-staple'
  }
}

async function authContext(playwright: PlaywrightWorkerArgs['playwright']): Promise<APIRequestContext> {
  return playwright.request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: AUTH_HEADERS })
}

/** A fresh, authenticated Better Auth request context. */
async function signedInContext(
  playwright: PlaywrightWorkerArgs['playwright'],
  user: Credentials
): Promise<APIRequestContext> {
  const context = await authContext(playwright)
  const response = await context.post('/api/auth/sign-in/email', { data: user })
  expect(response.status()).toBe(200)
  return context
}

/** Sign-up auto-signs in under the configured optional-verification policy. */
async function signedUpContext(
  playwright: PlaywrightWorkerArgs['playwright'],
  user = newCredentials()
): Promise<{ context: APIRequestContext, user: Credentials }> {
  const context = await authContext(playwright)
  const response = await context.post('/api/auth/sign-up/email', {
    data: { ...user, name: 'E2E User' }
  })
  expect(response.status()).toBe(200)
  return { context, user }
}

async function getSession(context: APIRequestContext) {
  const response = await context.get('/api/auth/get-session')
  expect(response.status()).toBe(200)
  return response.json()
}

async function clearCapturedMail() {
  await rm(captureDirectory(), { recursive: true, force: true })
  await mkdir(captureDirectory(), { recursive: true, mode: 0o700 })
}

async function capturedEmail(kind: CapturedEmail['kind'], email: string): Promise<CapturedEmail> {
  const deadline = Date.now() + 2_000
  do {
    const entries = await readdir(captureDirectory())
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      const candidate = JSON.parse(await readFile(`${captureDirectory()}/${entry}`, 'utf8')) as CapturedEmail
      if (candidate.kind === kind && candidate.to === email) return candidate
    }
    await delay(25)
  } while (Date.now() < deadline)

  throw new Error(`Timed out waiting for captured ${kind} email to ${email}.`)
}

const rateLimitDb = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => { } })

test.beforeEach(async () => {
  // Better Auth persists its per-IP/path counters. Clearing only this E2E
  // database keeps unrelated scenarios from consuming each other's budgets.
  await rateLimitDb`DELETE FROM rate_limits`
  await clearCapturedMail()
})

test.afterAll(async () => {
  await rateLimitDb.end()
})

test('an anonymous caller cannot mutate: POST, PATCH and DELETE are 401', async ({ playwright }) => {
  const anon = await authContext(playwright)
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

test('list and detail responses expose only the public post and author fields', async ({ playwright }) => {
  const anon = await authContext(playwright)
  try {
    const listResponse = await anon.get('/api/posts')
    expect(listResponse.status()).toBe(200)

    const list = await listResponse.json()
    expect(Object.keys(list).sort()).toEqual(['items', 'limit', 'offset', 'total'])
    expect(list.items.length).toBeGreaterThan(0)
    expect(Object.keys(list.items[0]).sort()).toEqual([
      'author',
      'body',
      'createdAt',
      'id',
      'published',
      'slug',
      'title',
      'updatedAt'
    ])
    expect(Object.keys(list.items[0].author).sort()).toEqual(['avatarUrl', 'id', 'name'])

    const detailResponse = await anon.get(`/api/posts/${POST_HELLO}`)
    expect(detailResponse.status()).toBe(200)

    const detail = await detailResponse.json()
    expect(Object.keys(detail).sort()).toEqual([
      'author',
      'body',
      'createdAt',
      'id',
      'published',
      'slug',
      'title',
      'updatedAt'
    ])
    expect(Object.keys(detail.author).sort()).toEqual(['avatarUrl', 'id', 'name'])
  } finally {
    await anon.dispose()
  }
})
test('a typoed PATCH field is a 422, not a silent no-op', async ({ playwright }) => {
  const ada = await signedInContext(playwright, ADA)
  try {
    const patch = await ada.patch(`/api/posts/${POST_HELLO}`, { data: { publish: false } })
    expect(patch.status()).toBe(422)

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

test('an unverified sign-up immediately receives a session and can create a post', async ({ playwright }) => {
  const { context, user } = await signedUpContext(playwright)
  try {
    const session = await getSession(context)
    expect(session.user.email).toBe(user.email)
    expect(session.user.emailVerified).toBe(false)
    expect(await readdir(captureDirectory())).toEqual([])

    const post = await context.post('/api/posts', {
      data: {
        title: 'Unverified author',
        slug: `unverified-${randomUUID()}`,
        body: '',
        published: false
      }
    })
    expect(post.status()).toBe(201)
  } finally {
    await context.dispose()
  }
})

test('registration normalization reaches the persisted profile', async ({ playwright }) => {
  const context = await authContext(playwright)
  const email = `NORMALIZED-${randomUUID()}@EXAMPLE.COM`
  try {
    const response = await context.post('/api/auth/sign-up/email', {
      data: { email, name: '  Normalized Author  ', password: 'correct-horse-battery-staple' }
    })
    expect(response.status()).toBe(200)
    expect((await getSession(context)).user).toMatchObject({
      email: email.toLowerCase(),
      name: 'Normalized Author'
    })
  } finally {
    await context.dispose()
  }
})

test('concurrent duplicate Better Auth sign-ups return one 200 and one 422', async ({ playwright }) => {
  const email = `race-${randomUUID()}@example.com`
  const payload = { email, name: 'Race Condition', password: 'correct-horse-battery-staple' }

  const contextA = await authContext(playwright)
  const contextB = await authContext(playwright)
  try {
    const [responseA, responseB] = await Promise.all([
      contextA.post('/api/auth/sign-up/email', { data: payload }),
      contextB.post('/api/auth/sign-up/email', { data: payload })
    ])

    const statuses = [responseA.status(), responseB.status()].sort((a, b) => a - b)
    expect(statuses).toEqual([200, 422])
    const rejected = responseA.status() === 422 ? responseA : responseB
    expect(await rejected.json()).toMatchObject({
      code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
      data: { errors: { email: expect.any(String) } }
    })
    const repeated = await contextA.post('/api/auth/sign-up/email', { data: payload })
    expect(repeated.status()).toBe(422)
    expect(await repeated.json()).toEqual(await rejected.json())
  } finally {
    await contextA.dispose()
    await contextB.dispose()
  }
})

test('concurrent slug PATCHes: one 200, one 409', async ({ playwright }) => {
  const ada = await signedInContext(playwright, ADA)
  try {
    const unique = randomUUID()
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
  } finally {
    await ada.dispose()
  }
})

test('sign-out deletes the current Better Auth session', async ({ playwright }) => {
  const { context } = await signedUpContext(playwright)
  try {
    expect(await getSession(context)).not.toBeNull()

    const signOut = await context.post('/api/auth/sign-out', { data: {} })
    expect(signOut.status()).toBe(200)
    expect((await signOut.json()).success).toBe(true)
    expect(await getSession(context)).toBeNull()
  } finally {
    await context.dispose()
  }
})

test('password reset revokes every existing session', async ({ browser, playwright }) => {
  const { context: firstSession, user } = await signedUpContext(playwright)
  const secondSession = await signedInContext(playwright, user)
  const page = await browser.newPage()
  try {
    expect(await getSession(firstSession)).not.toBeNull()
    expect(await getSession(secondSession)).not.toBeNull()

    await page.goto(`${BASE_URL}/forgot-password`)
    await page.getByLabel('Email').fill(user.email)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByText('Check your email')).toBeVisible()

    const mail = await capturedEmail('password-reset', user.email)
    await page.goto(mail.url)
    await expect(page).toHaveURL(/\/reset-password\?token=/)

    const newPassword = 'new-correct-horse-battery-staple'
    await page.getByLabel(/^New password/).fill(newPassword)
    await page.getByLabel('Confirm new password').fill(newPassword)
    await page.getByRole('button', { name: 'Reset password', exact: true }).click()
    await expect(page).toHaveURL(`${BASE_URL}/login`)

    expect(await getSession(firstSession)).toBeNull()
    expect(await getSession(secondSession)).toBeNull()

    const renewed = await signedInContext(playwright, { ...user, password: newPassword })
    expect(await getSession(renewed)).not.toBeNull()
    await renewed.dispose()
  } finally {
    await page.close()
    await firstSession.dispose()
    await secondSession.dispose()
  }
})

test('failed session revocation rolls back password recovery and leaves its token retryable', async ({ playwright }) => {
  const { context: owner, user } = await signedUpContext(playwright)
  const recovery = await authContext(playwright)
  const newPassword = 'replacement-correct-horse-battery-staple'
  try {
    const requested = await recovery.post('/api/auth/request-password-reset', {
      data: { email: user.email, redirectTo: '/reset-password' }
    })
    expect(requested.status()).toBe(200)
    const mail = await capturedEmail('password-reset', user.email)
    const token = new URL(mail.url).pathname.split('/').at(-1)
    if (!token) throw new Error('Password recovery email has no token')
    const plaintext = await rateLimitDb`SELECT id FROM verifications WHERE identifier = ${`reset-password:${token}`} OR value = ${token}`
    expect(plaintext).toEqual([])

    // This suite runs serially against an explicitly disposable database.
    await rateLimitDb.unsafe(`CREATE FUNCTION fail_recovery_session_delete() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected session deletion failure'; END $$`)
    await rateLimitDb.unsafe(`CREATE TRIGGER fail_recovery_session_delete
      BEFORE DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION fail_recovery_session_delete()`)
    const failed = await recovery.post('/api/auth/reset-password', {
      data: { token, newPassword }
    })
    expect(failed.status()).toBe(500)
    expect(await getSession(owner)).not.toBeNull()
    const unchanged = await signedInContext(playwright, user)
    await unchanged.dispose()
    const rejectedPassword = await recovery.post('/api/auth/sign-in/email', {
      data: { email: user.email, password: newPassword }
    })
    expect(rejectedPassword.status()).toBe(401)

    await rateLimitDb.unsafe('DROP TRIGGER fail_recovery_session_delete ON sessions')
    const retries = await Promise.all([0, 1].map(() => recovery.post('/api/auth/reset-password', {
      data: { token, newPassword }
    })))
    expect(retries.map(response => response.status()).sort()).toEqual([200, 400])
    expect(await retries.find(response => response.status() === 200)!.json()).toEqual({ status: true })
    expect(await getSession(owner)).toBeNull()
    const renewed = await signedInContext(playwright, { ...user, password: newPassword })
    await renewed.dispose()
    const replay = await recovery.post('/api/auth/reset-password', {
      data: { token, newPassword: user.password }
    })
    expect(replay.status()).toBe(400)
  } finally {
    await rateLimitDb.unsafe('DROP TRIGGER IF EXISTS fail_recovery_session_delete ON sessions')
    await rateLimitDb.unsafe('DROP FUNCTION IF EXISTS fail_recovery_session_delete()')
    await owner.dispose()
    await recovery.dispose()
  }
})

test('verification links reject anonymous confirmation and accept the signed-in owner', async ({ playwright }) => {
  const { context: owner, user } = await signedUpContext(playwright)
  const anon = await authContext(playwright)
  try {
    const unsolicited = await anon.post('/api/auth/send-verification-email', {
      data: { email: user.email, callbackURL: '/dashboard' }
    })
    expect(unsolicited.status()).toBe(401)
    expect(await readdir(captureDirectory())).toEqual([])
    const requested = await owner.post('/api/auth/send-verification-email', {
      data: { email: user.email, callbackURL: '/dashboard' }
    })
    expect(requested.status()).toBe(200)

    const mail = await capturedEmail('verification', user.email)
    const confirmationPath = new URL(mail.url)
    const pathAndQuery = `${confirmationPath.pathname}${confirmationPath.search}`

    const rejected = await anon.get(pathAndQuery, { maxRedirects: 0 })
    expect(rejected.status()).toBe(302)
    expect(new URL(rejected.headers().location!).pathname).toBe('/login')
    expect(new URL(rejected.headers().location!).searchParams.get('error')).toBe('verification-session-required')
    expect((await getSession(owner)).user.emailVerified).toBe(false)

    const confirmed = await owner.get(pathAndQuery, { maxRedirects: 0 })
    expect(confirmed.status()).toBe(302)
    const callbackURL = confirmed.headers().location
    if (!callbackURL) throw new Error('Verification response did not include a callback URL.')
    expect((await owner.get(callbackURL)).status()).toBe(200)
    expect((await getSession(owner)).user.emailVerified).toBe(true)
  } finally {
    await owner.dispose()
    await anon.dispose()
  }
})

test('login is rate limited after three failures', async ({ playwright }) => {
  const anon = await authContext(playwright)
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await anon.post('/api/auth/sign-in/email', {
        data: { email: 'rate-limit-probe@example.com', password: 'wrong-password-wrong' }
      })
      expect(response.status()).toBe(401)
    }

    const fourth = await anon.post('/api/auth/sign-in/email', {
      data: { email: 'rate-limit-probe@example.com', password: 'wrong-password-wrong' }
    })
    expect(fourth.status()).toBe(429)
  } finally {
    await anon.dispose()
  }
})

test('security headers are served and x-powered-by is not', async ({ playwright }) => {
  const anon = await authContext(playwright)
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

test('OAuth buttons are hidden when no provider is configured', async ({ playwright }) => {
  const anon = await authContext(playwright)
  try {
    const login = await anon.get('/login')
    expect(login.status()).toBe(200)
    expect(await login.text()).not.toContain('/api/auth/sign-in/social')
  } finally {
    await anon.dispose()
  }
})

test('a forged Better Auth OAuth callback does not create a session', async ({ playwright }) => {
  const anon = await authContext(playwright)
  try {
    const response = await anon.get('/api/auth/callback/google?code=x&state=y', { maxRedirects: 0 })
    expect(response.status()).not.toBe(200)
    expect(await getSession(anon)).toBeNull()
  } finally {
    await anon.dispose()
  }
})
