/**
 * POST /api/posts — create a post owned by the signed-in user.
 *
 * `authorId` comes from the session, never from the request body: the wire
 * contract in shared/schemas/post.ts has no such field, so a client cannot
 * create a post attributed to somebody else.
 */
import { postCreateSchema } from '#shared/schemas/post'
import type { PostWithAuthor } from '#shared/types/api'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event): Promise<PostWithAuthor> => {
  const { user } = await requireUserSession(event)
  const input = await validateBody(event, postCreateSchema)
  const db = useDb()

  const slugTaken = () => createError({
    statusCode: 409,
    statusMessage: 'Slug already in use',
    data: { errors: { slug: 'That slug is already taken' } }
  })

  const existing = await db.query.posts.findFirst({
    where: eq(tables.posts.slug, input.slug),
    columns: { id: true }
  })
  if (existing) throw slugTaken()

  // The SELECT above cannot prevent a concurrent request from inserting the
  // same slug between the check and this insert. If that happens, the insert
  // itself violates posts_slug_key — catch it and throw the same 409 rather
  // than letting it surface as an unhandled 500.
  const created = await db
    .insert(tables.posts)
    .values({ ...input, authorId: user.id })
    .returning({ id: tables.posts.id })
    .then(rows => rows[0])
    .catch((error: unknown) => {
      if (isUniqueViolation(error, 'posts_slug_key')) throw slugTaken()
      throw error
    })

  if (!created) throw createError({ statusCode: 500, statusMessage: 'Insert returned no row' })

  const row = await db.query.posts.findFirst({
    where: eq(tables.posts.id, created.id),
    with: { author: { columns: { id: true, name: true, avatarUrl: true } } }
  })
  if (!row) throw createError({ statusCode: 500, statusMessage: 'Created post vanished' })

  logger.info('post created', { postId: row.id, authorId: user.id })
  setResponseStatus(event, 201)
  return toPostWithAuthor(row)
})
