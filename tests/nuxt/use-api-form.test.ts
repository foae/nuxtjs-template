// @vitest-environment nuxt
/**
 * The form helper relies on Nuxt auto-imports and Nuxt UI state, so these are
 * runtime tests. The registered endpoints exercise its real $fetch error
 * boundary rather than mocking the composable's dependencies.
 */
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { useApiForm } from '../../app/composables/useApiForm'

interface ApiFormHarness {
  errors: Record<string, string>
  pending: boolean
  submit(body: Record<string, unknown>): Promise<{ id: string } | undefined>
  toasts: Array<{ color?: string, description?: string, title?: string }>
}

interface MountedForm {
  form: ApiFormHarness
  unmount(): void
}

function formHarness(onSuccess?: (response: { id: string }) => void | Promise<void>) {
  return defineComponent({
    name: 'ApiFormHarness',
    setup() {
      const form = useApiForm<{ id: string }>('/api/runtime-form', { method: 'POST', onSuccess })
      const { toasts } = useToast()

      return { ...form, toasts }
    },
    render: () => h('div')
  })
}

function errorResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

async function mountForm(
  onSuccess?: (response: { id: string }) => void | Promise<void>
): Promise<MountedForm> {
  const wrapper = await mountSuspended(formHarness(onSuccess))
  return {
    form: wrapper.vm as unknown as ApiFormHarness,
    unmount: () => wrapper.unmount()
  }
}

describe('useApiForm', () => {
  it('routes a 422 to field state, then clears it after a successful submission', async () => {
    const completedResponse = deferred<{ id: string }>()
    const onSuccess = vi.fn()
    let attempts = 0
    const unregister = registerEndpoint('/api/runtime-form', {
      method: 'POST',
      handler: async () => {
        attempts += 1
        if (attempts === 1) {
          return errorResponse(422, {
            message: 'Validation failed',
            data: { errors: { title: 'Title is required' } }
          })
        }

        return await completedResponse.promise
      }
    })

    let mounted: MountedForm | undefined

    try {
      mounted = await mountForm(onSuccess)
      const { form } = mounted

      await form.submit({ title: '' })
      expect(form.errors).toStrictEqual({ title: 'Title is required' })
      expect(form.pending).toBe(false)

      const submission = form.submit({ title: 'Published title' })
      expect(form.pending).toBe(true)

      completedResponse.resolve({ id: 'post-1' })
      await expect(submission).resolves.toStrictEqual({ id: 'post-1' })

      expect(form.pending).toBe(false)
      expect(form.errors).toStrictEqual({})
      expect(onSuccess).toHaveBeenCalledExactlyOnceWith({ id: 'post-1' })
    } finally {
      mounted?.form.toasts.splice(0)
      mounted?.unmount()
      unregister()
    }
  })

  it('presents a generic error toast when a failure has no field errors', async () => {
    const unregister = registerEndpoint('/api/runtime-form', {
      method: 'POST',
      handler: () => errorResponse(500, { message: 'Post service unavailable' })
    })

    let mounted: MountedForm | undefined

    try {
      mounted = await mountForm()
      const { form } = mounted

      await expect(form.submit({ title: 'Published title' })).resolves.toBeUndefined()
      await nextTick()

      expect(form.pending).toBe(false)
      expect(form.errors).toStrictEqual({})
      expect(form.toasts.at(-1)).toMatchObject({
        title: 'Something went wrong',
        description: 'Post service unavailable',
        color: 'error'
      })
    } finally {
      mounted?.form.toasts.splice(0)
      mounted?.unmount()
      unregister()
    }
  })
})
