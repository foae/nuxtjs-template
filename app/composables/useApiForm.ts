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

interface ApiFormOptions<TResponse> {
  method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** Called with the parsed response when the request succeeds. */
  onSuccess?: (data: TResponse) => void | Promise<void>
}

/** The URL may be a getter so a form can switch endpoints (see login.vue). */
type UrlSource = MaybeRefOrGetter<string>

/** h3 error envelope: `data` carries our field map, `message` the summary. */
interface ApiErrorBody {
  message?: string
  data?: { errors?: Record<string, string> }
}

/**
 * `TResponse` is the shape the endpoint returns — pass it so `onSuccess` and
 * the return value are typed, instead of every caller casting from `unknown`:
 *
 *   useApiForm<PostWithAuthor>('/api/posts', { onSuccess: p => ... p.id })
 */
export function useApiForm<TResponse = unknown>(
  url: UrlSource,
  options: ApiFormOptions<TResponse> = {}
) {
  const pending = ref(false)
  const errors = ref<Record<string, string>>({})
  const toast = useToast()

  async function submit<T extends Record<string, unknown>>(body: T) {
    pending.value = true
    errors.value = {}

    try {
      // Cast past $fetch's TypedInternalResponse wrapper: the URL is a
      // runtime value, so Nitro can't infer the route's return type here.
      const data = await $fetch(toValue(url), {
        method: options.method ?? 'POST',
        body
      }) as TResponse

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
