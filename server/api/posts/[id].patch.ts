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

  if (input.slug && input.slug !== existing.slug) {
    const clash = await db.query.posts.findFirst({
      where: and(eq(tables.posts.slug, input.slug), ne(tables.posts.id, id)),
      columns: { id: true }
    })
    if (clash) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Slug already in use',
        data: { errors: { slug: 'That slug is already taken' } }
      })
    }
  }

  await db.update(tables.posts).set(input).where(eq(tables.posts.id, id))

  const row = await db.query.posts.findFirst({
    where: eq(tables.posts.id, id),
    with: { author: true }
  })
  if (!row) throw createError({ statusCode: 500, statusMessage: 'Updated post vanished' })

  logger.info('post updated', { postId: id, authorId: user.id })
  return toPostWithAuthor(row)
})
