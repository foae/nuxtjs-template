/**
 * Wire contract for authentication. Used by the server handlers and the
 * login/register forms alike.
 */
import { z } from 'zod'

export const credentialsSchema = z.object({
  email: z.email('Enter a valid email address').max(254).toLowerCase(),
  password: z.string().min(12, 'Use at least 12 characters').max(200)
})

export const registerSchema = credentialsSchema.extend({
  name: z.string().min(1, 'Name is required').max(120)
})

export type Credentials = z.infer<typeof credentialsSchema>
export type RegisterInput = z.infer<typeof registerSchema>
