/**
 * Wire contract for posts — the single schema used by BOTH sides:
 *
 *   server/api/posts.post.ts   validates the request body with it
 *   app/pages/posts/new.vue    drives the UForm with it
 *
 * Because both sides import this file, a field cannot be added to the form
 * without the server accepting it, or vice versa.
 *
 * These are deliberately hand-written rather than generated from the Drizzle
 * table: `shared/` cannot import server code at runtime, and the API shape is
 * not the storage shape (no `authorId` here — the server takes that from the
 * session, never from the client). `tests/unit/schema-drift.test.ts` fails
 * `pnpm verify` if a contract field stops matching a real column.
 */
import { z } from 'zod'

/** Lowercase, digits and single hyphens — safe in a URL without encoding. */
const slug = z
  .string()
  .min(1, 'Slug is required')
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens')

/**
 * Field definitions WITHOUT defaults. Defaults belong to create only.
 *
 * Do not build the update schema with `postCreateSchema.partial()`: Zod's
 * `.partial()` makes fields optional but leaves `.default()` in place, so
 * parsing `{ title }` also yields `body: ''` and `published: false`. The
 * handler then writes those, and a PATCH that renames a post silently wipes
 * its body and unpublishes it. Keep the two schemas built from these fields.
 */
const postFields = {
  title: z.string().min(1, 'Title is required').max(200),
  slug,
  body: z.string().max(50_000),
  published: z.boolean()
}

export const postCreateSchema = z.object({
  ...postFields,
  body: postFields.body.default(''),
  published: postFields.published.default(false)
})

/** Every field optional and NO defaults — true PATCH semantics. */
export const postUpdateSchema = z.object(postFields).partial()

/** Route params and query strings arrive as strings; coerce before validating. */
export const postIdSchema = z.object({ id: z.uuid('Not a valid post id') })

export const postListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  published: z
    .enum(['true', 'false'])
    .optional()
    .transform(v => (v === undefined ? undefined : v === 'true'))
})

export type PostCreateInput = z.infer<typeof postCreateSchema>
export type PostUpdateInput = z.infer<typeof postUpdateSchema>
export type PostListQuery = z.infer<typeof postListQuerySchema>
