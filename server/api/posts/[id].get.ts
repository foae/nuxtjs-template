/**
 * GET /api/posts/:id — one post.
 *
 * A draft is visible only to its author. Note this returns 404 rather than
 * 403 for someone else's draft, so the endpoint doesn't leak the existence
 * of unpublished posts.
 */
import { postIdSchema } from '#shared/schemas/post'
import type { PostWithAuthor } from '#shared/types/api'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event): Promise<PostWithAuthor> => {
  const { id } = validateParams(event, postIdSchema)
  const session = await getUserSession(event)

  const row = await useDb().query.posts.findFirst({
    where: eq(tables.posts.id, id),
    with: { author: true }
  })

  if (!row || (!row.published && row.authorId !== session.user?.id)) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }

  return toPostWithAuthor(row)
})
