/**
 * DELETE /api/posts/:id — delete a post you own.
 */
import { postIdSchema } from '#shared/schemas/post'
import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { id } = validateParams(event, postIdSchema)
  const { user } = await requireUserSession(event)

  const deleted = await useDb()
    .delete(tables.posts)
    .where(and(eq(tables.posts.id, id), eq(tables.posts.authorId, user.id)))
    .returning({ id: tables.posts.id })

  if (deleted.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }

  logger.info('post deleted', { postId: id, authorId: user.id })
  setResponseStatus(event, 204)
  return null
})
