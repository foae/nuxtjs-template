/**
 * End-to-end coverage of the vertical slice.
 *
 * Assumes a freshly seeded database (`pnpm db:reset`). The seed is
 * deterministic, so these tests reference seeded content by literal text.
 */
import { expect, test } from '@playwright/test'

const ADA = { email: 'ada@example.com', password: 'correct-horse-battery-staple' }

async function signIn(page: import('@playwright/test').Page, user = ADA) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('link', { name: 'New post' })).toBeVisible()
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
