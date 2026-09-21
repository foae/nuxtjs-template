<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

const schema = z.object({
  newPassword: z.string().min(12, 'Use at least 12 characters').max(200),
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
})

type ResetPasswordInput = z.output<typeof schema>

useSeoMeta({ title: 'Choose a new password' })

const route = useRoute()
const token = Array.isArray(route.query.token) ? route.query.token[0] : route.query.token
const state = reactive<Partial<ResetPasswordInput>>({ newPassword: '', confirmPassword: '' })
const { clear, fetch: refreshSession } = useAuthSession()
const { submit, pending, errors } = useApiForm('/api/auth/reset-password', {
  method: 'POST',
  onSuccess: async () => {
    clear()

    try {
      await refreshSession()
    } catch {
      // The local session was cleared before this request, so navigation is safe.
    }

    await navigateTo('/login')
  }
})

async function onSubmit(event: FormSubmitEvent<ResetPasswordInput>) {
  if (!token) return

  await submit({ token, newPassword: event.data.newPassword })
}
</script>

<template>
  <UContainer class="flex min-h-[calc(100dvh-12rem)] max-w-md items-center py-10">
    <UPageCard
      class="w-full"
      icon="i-lucide-shield-check"
      title="Choose a new password"
      description="Use a strong, unique password for your account."
      spotlight
    >
      <template #body>
        <UAlert
          v-if="!token"
          color="error"
          variant="subtle"
          title="Reset link unavailable"
          description="Request another password reset link and try again."
        />

        <UForm
          v-else
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField
            label="New password"
            name="newPassword"
            required
            :error="errors.newPassword"
          >
            <UInput
              v-model="state.newPassword"
              type="password"
              autocomplete="new-password"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Confirm new password"
            name="confirmPassword"
            required
            :error="errors.confirmPassword"
          >
            <UInput
              v-model="state.confirmPassword"
              type="password"
              autocomplete="new-password"
              class="w-full"
            />
          </UFormField>

          <UButton
            type="submit"
            label="Reset password"
            :loading="pending"
            block
          />
        </UForm>
      </template>

      <template #footer>
        <p class="text-center text-sm text-muted">
          <NuxtLink
            to="/login"
            class="font-medium text-primary"
          >
            Back to sign in
          </NuxtLink>
        </p>
      </template>
    </UPageCard>
  </UContainer>
</template>
