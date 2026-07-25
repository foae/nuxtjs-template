/**
 * Wire contract for authentication. Used by the server handlers and the
 * login/register forms alike.
 */
import { z } from 'zod'

// Deliberately non-strict: app/pages/login.vue validates one reactive state
// `{ email, password, name }` against this schema in login mode, so a strict
// object would reject the unused `name` field and break client-side
// validation. Strictness also buys nothing here — both fields are required,
// so a typoed key already fails with a "required" error rather than being
// silently dropped.
export const credentialsSchema = z.object({
  email: z.email('Enter a valid email address').max(254).toLowerCase(),
  password: z.string().min(12, 'Use at least 12 characters').max(200)
})

// Strict, unlike credentialsSchema above: registration has no extra field
// the client legitimately sends, so an unknown key is a typo worth a 422.
export const registerSchema = z.strictObject({
  ...credentialsSchema.shape,
  name: z.string().trim().min(1, 'Name is required').max(120)
})

export type Credentials = z.infer<typeof credentialsSchema>
export type RegisterInput = z.infer<typeof registerSchema>
