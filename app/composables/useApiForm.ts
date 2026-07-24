/**
 * Submits a form to an API route and routes 422 field errors back into the
 * Nuxt UI form that produced them.
 *
 * The server returns `{ data: { errors: { field: message } } }` (see
 * `server/utils/validate.ts`), so a validation rule only has to be written
 * once — in `shared/schemas/` — and both sides honour it.
 *
 *   const { submit, pending, errors } = useApiForm('/api/posts', { method: 'POST' })
 *   await submit(state)
 */
import type { FetchError } from 'ofetch'

interface ApiFormOptions {
  method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** Called with the parsed response when the request succeeds. */
  onSuccess?: (data: unknown) => void | Promise<void>
}

/** h3 error envelope: `data` carries our field map, `message` the summary. */
interface ApiErrorBody {
  message?: string
  data?: { errors?: Record<string, string> }
}

export function useApiForm(url: string, options: ApiFormOptions = {}) {
  const pending = ref(false)
  const errors = ref<Record<string, string>>({})
  const toast = useToast()

  async function submit<T extends Record<string, unknown>>(body: T) {
    pending.value = true
    errors.value = {}

    try {
      const data = await $fetch(url, { method: options.method ?? 'POST', body })
      await options.onSuccess?.(data)
      return data
    } catch (error) {
      const fetchError = error as FetchError<ApiErrorBody>
      const fieldErrors = fetchError.data?.data?.errors

      if (fieldErrors) {
        // Field-level problem: show it inline, next to the offending input.
        errors.value = fieldErrors
      } else {
        // Anything else is not attributable to one field.
        toast.add({
          title: 'Something went wrong',
          description: fetchError.data?.message ?? fetchError.message,
          color: 'error'
        })
      }
      return undefined
    } finally {
      pending.value = false
    }
  }

  return { submit, pending, errors }
}
