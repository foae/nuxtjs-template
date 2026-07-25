/**
 * PATCH /api/posts/:id — update a post you own.
 */
import { postIdSchema, postUpdateSchema } from '#shared/schemas/post'
import type { PostWithAuthor } from '#shared/types/api'
import { and, eq, ne } from 'drizzle-orm'

export default defineEventHandler(async (event): Promise<PostWithAuthor> => {
  const { id } = validateParams(event, postIdSchema)
  const { user } = await requireUserSession(event)
  const input = await validateBody(event, postUpdateSchema)
  const db = useDb()

  const existing = await db.query.posts.findFirst({ where: eq(tables.posts.id, id) })
  // 404 rather than 403 for someone else's post — don't confirm it exists.
  if (!existing || existing.authorId !== user.id) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }

  // An empty or entirely-unknown-key PATCH is a 422, not a silent 200 no-op:
  // `postUpdateSchema` now rejects unknown keys itself, but `{}` is still
  // syntactically valid and would otherwise write nothing while still
  // reporting success — a false green worth catching explicitly.
  if (Object.keys(input).length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: { errors: { _: 'Include at least one field to update' } }
    })
  }

  const slugTaken = () => createError({
    statusCode: 409,
    statusMessage: 'Slug already in use',
    data: { errors: { slug: 'That slug is already taken' } }
  })

  if (input.slug && input.slug !== existing.slug) {
    const clash = await db.query.posts.findFirst({
      where: and(eq(tables.posts.slug, input.slug), ne(tables.posts.id, id)),
      columns: { id: true }
    })
    if (clash) throw slugTaken()
  }

  // The SELECT above cannot prevent a concurrent request from claiming the
  // same slug between the check and this update. If that happens, the
  // update itself violates posts_slug_key — catch it and throw the same 409
  // rather than letting it surface as an unhandled 500.
  await db
    .update(tables.posts)
    .set(input)
    .where(eq(tables.posts.id, id))
    .catch((error: unknown) => {
      if (isUniqueViolation(error, 'posts_slug_key')) throw slugTaken()
      throw error
    })

  const row = await db.query.posts.findFirst({
    where: eq(tables.posts.id, id),
    with: { author: { columns: { id: true, name: true, avatarUrl: true } } }
  })
  if (!row) throw createError({ statusCode: 500, statusMessage: 'Updated post vanished' })

  logger.info('post updated', { postId: id, authorId: user.id })
  return toPostWithAuthor(row)
})
