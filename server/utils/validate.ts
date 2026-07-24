/**
 * Request validation. Auto-imported across the server.
 *
 *   const input = await validateBody(event, postCreateSchema)
 *
 * Always validate with a schema from `shared/schemas/` — the same object the
 * client form uses — so the two cannot drift. Never trust `readBody` directly.
 *
 * Failures become a 422 whose `data.errors` is a field -> message map, which
 * is the shape `app/composables/useApiForm.ts` feeds straight back into the
 * Nuxt UI form.
 */
import type { H3Event } from 'h3'
import type { ZodType, z } from 'zod'

function fail(issues: z.core.$ZodIssue[]): never {
  const errors: Record<string, string> = {}
  for (const issue of issues) {
    // Join nested paths so `author.name` reads back as one key.
    const key = issue.path.map(String).join('.') || '_'
    errors[key] ??= issue.message
  }

  throw createError({
    statusCode: 422,
    statusMessage: 'Validation failed',
    data: { errors }
  })
}

export async function validateBody<T extends ZodType>(
  event: H3Event,
  schema: T
): Promise<z.infer<T>> {
  const result = schema.safeParse(await readBody(event))
  return result.success ? result.data : fail(result.error.issues)
}

export function validateQuery<T extends ZodType>(
  event: H3Event,
  schema: T
): z.infer<T> {
  const result = schema.safeParse(getQuery(event))
  return result.success ? result.data : fail(result.error.issues)
}

export function validateParams<T extends ZodType>(
  event: H3Event,
  schema: T
): z.infer<T> {
  const result = schema.safeParse(getRouterParams(event))
  return result.success ? result.data : fail(result.error.issues)
}
