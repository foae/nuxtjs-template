/**
 * End-to-end coverage of the vertical slice.
 *
 * Assumes the explicit disposable E2E database has been seeded by global
 * setup. The seed is deterministic, so these tests reference literal content.
 */
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createConnection, createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import type { Page } from '@playwright/test'
import postgres from 'postgres'
import { expect, test } from './fixtures'

const databaseUrl = process.env.E2E_DATABASE_URL
if (!databaseUrl) throw new Error('E2E_DATABASE_URL is required for E2E rate-limit cleanup.')
const rateLimitDb = postgres(databaseUrl, { max: 1, onnotice: () => { } })

test.beforeEach(async () => {
  await rateLimitDb`DELETE FROM rate_limits`
})

test.afterAll(async () => {
  await rateLimitDb.end()
})

const ADA = { email: 'ada@example.com', password: 'correct-horse-battery-staple' }

async function signIn(page: Page, user = ADA) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('link', { name: 'New post' })).toBeVisible()
}

async function unusedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.once('listening', resolve)
    server.listen(0, '127.0.0.1')
  })

  const address = server.address()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))

  if (!address || typeof address === 'string') throw new Error('Could not reserve a local port.')
  return address.port
}

async function waitForServer(port: number, server: ChildProcess) {
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Nuxt server exited with code ${server.exitCode}.`)

    try {
      await new Promise<void>((resolve, reject) => {
        const connection = createConnection({ host: '127.0.0.1', port })
        connection.once('connect', () => {
          connection.end()
          resolve()
        })
        connection.once('error', reject)
      })
      return
    } catch {
      await delay(100)
    }
  }

  throw new Error('Timed out waiting for the Nuxt server.')
}

async function startServerWithUnavailableDatabase() {
  const port = await unusedPort()
  const unavailablePort = await unusedPort()
  const server = spawn('node', ['.output/server/index.mjs'], {
    env: {
      ...process.env,
      DATABASE_URL: `postgres://app:app@127.0.0.1:${unavailablePort}/unavailable`,
      NITRO_PORT: String(port),
      NODE_ENV: 'production',
      AUTH_BASE_URL: `http://127.0.0.1:${port}`,
      AUTH_SECRET: 'e2e-auth-secret-must-be-at-least-thirty-two-characters',
      AUTH_TEST_MODE: 'true',
      AUTH_MAIL_TRANSPORT: 'capture',
      AUTH_MAIL_CAPTURE_DIR: process.env.PLAYWRIGHT_AUTH_MAIL_DIR ?? '',
      AUTH_GOOGLE_CLIENT_ID: '',
      AUTH_GOOGLE_CLIENT_SECRET: '',
      AUTH_GITHUB_CLIENT_ID: '',
      AUTH_GITHUB_CLIENT_SECRET: '',
      AUTH_SSO_CONFIG_FILE: ''
    },
    stdio: 'ignore'
  })

  try {
    await waitForServer(port, server)
  } catch (error) {
    server.kill('SIGTERM')
    throw error
  }

  return { port, server }
}

async function stopServer(server: ChildProcess) {
  if (server.exitCode !== null) return

  const exited = once(server, 'exit')
  server.kill('SIGTERM')
  await exited
}

test('anonymous visitors see published posts but not drafts', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Hello world' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Unpublished draft' })).toHaveCount(0)
})

test('the list is server-rendered, not filled in by the client', async ({ page }) => {
  // Fetch the raw HTML: if the post title is already present, SSR worked.
  // This is the regression that silently breaks when someone switches a page
  // to client-only fetching.
  const response = await page.request.get('/')
  expect(response.ok()).toBeTruthy()
  expect(await response.text()).toContain('Hello world')
})

test('an SSR database failure renders retryable failure UI instead of stale content', async ({ page }) => {
  const { port, server } = await startServerWithUnavailableDatabase()
  try {
    await page.goto(`http://127.0.0.1:${port}/`)

    await expect(page.getByText('Unable to load posts')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(page.getByText('No posts yet')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Hello world' })).toHaveCount(0)
  } finally {
    await stopServer(server)
  }
})

test('a failed client-side pagination request hides stale posts and recovers with retry', async ({ page }) => {
  const prefix = `client-navigation-${Date.now()}`
  const authorId = '00000000-0000-4000-8000-000000000001'

  try {
    for (let index = 0; index < 10; index++) {
      await rateLimitDb`
        INSERT INTO posts (author_id, title, slug, body, published)
        VALUES (${authorId}, ${`Client navigation ${index}`}, ${`${prefix}-${index}`}, '', true)
      `
    }

    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Client navigation 0', exact: true })).toBeVisible()

    await page.route('**/api/posts?*', route => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 503, statusMessage: 'Database unavailable' })
    }))
    await page.getByRole('button', { name: 'Page 2', exact: true }).click()

    await expect(page).toHaveURL(/\/\?page=2$/)
    await expect(page.getByText('Unable to load posts')).toBeVisible()
    await expect(page.getByRole('link', { name: /^Client navigation / })).toHaveCount(0)

    await page.unroute('**/api/posts?*')
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('link', { name: 'Hello world' })).toBeVisible()
    await expect(page).toHaveURL(/\/\?page=2$/)
  } finally {
    await rateLimitDb`DELETE FROM posts WHERE slug LIKE ${`${prefix}%`}`
  }
})

test('a successful empty page renders the empty state', async ({ page }) => {
  await page.goto('/?page=2')

  await expect(page.getByText('No posts yet')).toBeVisible()
  await expect(page.getByText('Unable to load posts')).toHaveCount(0)
})

test('a signed-in author can create a post and see it', async ({ page }) => {
  await signIn(page)

  const unique = `e2e-${Date.now()}`
  await page.goto('/posts/new')
  await page.getByLabel('Title').fill(`E2E ${unique}`)
  await page.getByLabel('Body').fill('Written by the end-to-end test.')
  await page.getByLabel('Publish immediately').check()
  await page.getByRole('button', { name: 'Create post' }).click()

  await expect(page.getByRole('heading', { name: `E2E ${unique}` })).toBeVisible()
  await expect(page.getByText('Written by the end-to-end test.')).toBeVisible()
})

test('server-side validation errors land on the right field', async ({ page }) => {
  await signIn(page)
  await page.goto('/posts/new')

  await page.getByLabel('Title').fill('Duplicate slug test')
  // Overwrite the auto-derived slug with one the seed already uses.
  await page.getByLabel('Slug').fill('hello-world')
  await page.getByRole('button', { name: 'Create post' }).click()

  await expect(page.getByText('That slug is already taken')).toBeVisible()
})

test('a partial update does not wipe the fields it omits', async ({ page }) => {
  // Regression: postUpdateSchema was `postCreateSchema.partial()`, and
  // `.partial()` keeps `.default()`. A title-only PATCH therefore also wrote
  // body: '' and published: false — renaming a post destroyed its content.
  // Every check in `pnpm verify` passed while this shipped.
  await signIn(page)
  const id = '00000000-0000-4000-8000-000000000101' // seeded, published, has a body

  const before = await (await page.request.get(`/api/posts/${id}`)).json()
  expect(before.body).not.toBe('')
  expect(before.published).toBe(true)

  const patch = await page.request.patch(`/api/posts/${id}`, {
    data: { title: 'Renamed by the e2e test' }
  })
  expect(patch.ok()).toBeTruthy()

  const after = await patch.json()
  expect(after.title).toBe('Renamed by the e2e test')
  expect(after.body).toBe(before.body)
  expect(after.published).toBe(true)
})

test('the author can edit a post through the UI', async ({ page }) => {
  await signIn(page)
  const id = '00000000-0000-4000-8000-000000000101'

  await page.goto(`/posts/${id}`)
  await page.getByRole('link', { name: 'Edit' }).click()

  await expect(page.getByRole('heading', { name: 'Edit post' })).toBeVisible()

  const newTitle = `Edited ${Date.now()}`
  await page.getByLabel('Title').fill(newTitle)
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByRole('heading', { name: newTitle })).toBeVisible()
  // The body was never touched by the form submit, so it must survive.
  await expect(page.getByText('The first published post.')).toBeVisible()
})

test('a draft is a 404 for anyone but its author', async ({ page }) => {
  const draftId = '00000000-0000-4000-8000-000000000102' // Grace's draft
  const response = await page.request.get(`/api/posts/${draftId}`)
  expect(response.status()).toBe(404)
})
