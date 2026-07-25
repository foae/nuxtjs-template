<script setup lang="ts">
/**
 * Sign in / register. Both modes post to their own endpoint and reuse the
 * shared credential schemas.
 */
import { credentialsSchema, registerSchema } from '#shared/schemas/auth'
import type { FormSubmitEvent } from '@nuxt/ui'

const route = useRoute()
const { fetch: refreshSession } = useUserSession()

const mode = ref<'login' | 'register'>('login')
const schema = computed(() => (mode.value === 'login' ? credentialsSchema : registerSchema))

const state = reactive({ email: '', password: '', name: '' })

const redirectTarget = computed(() => {
  const raw = route.query.redirect
  const value = Array.isArray(raw) ? raw[0] : raw
  // Only same-origin paths: a full URL or protocol-relative value is ignored.
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
})

// The endpoint is a getter because it changes with `mode`; useApiForm
// resolves it at submit time.
const { submit, pending, errors } = useApiForm(
  () => (mode.value === 'login' ? '/api/auth/login' : '/api/auth/register'),
  {
    method: 'POST',
    onSuccess: async () => {
      // Refresh the client-side session before navigating, otherwise the
      // header still renders as signed-out on the next page.
      await refreshSession()
      await navigateTo(redirectTarget.value)
    }
  }
)

async function onSubmit(event: FormSubmitEvent<Record<string, unknown>>) {
  await submit(event.data)
}
</script>

<template>
  <UContainer class="py-10 max-w-md">
    <h1 class="text-2xl font-semibold mb-1">
      {{ mode === 'login' ? 'Sign in' : 'Create an account' }}
    </h1>
    <p class="text-muted text-sm mb-6">
      Seeded accounts: <code>ada@example.com</code> /
      <code>correct-horse-battery-staple</code>
    </p>

    <UForm
      :schema="schema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField
        v-if="mode === 'register'"
        label="Name"
        name="name"
        required
        :error="errors.name"
      >
        <UInput
          v-model="state.name"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Email"
        name="email"
        required
        :error="errors.email"
      >
        <UInput
          v-model="state.email"
          type="email"
          autocomplete="email"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Password"
        name="password"
        required
        :error="errors.password"
      >
        <UInput
          v-model="state.password"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          class="w-full"
        />
      </UFormField>

      <UButton
        type="submit"
        :loading="pending"
        :label="mode === 'login' ? 'Sign in' : 'Create account'"
        block
      />
    </UForm>

    <UButton
      class="mt-4"
      color="neutral"
      variant="link"
      :label="mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'"
      @click="mode = mode === 'login' ? 'register' : 'login'"
    />
  </UContainer>
</template>
