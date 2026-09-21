<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

const schema = z.object({
  email: z.email('Enter a valid email address')
})

type ForgotPasswordInput = z.output<typeof schema>

useSeoMeta({ title: 'Reset password' })

const state = reactive<Partial<ForgotPasswordInput>>({ email: '' })
const complete = ref(false)
const { submit, pending, errors } = useApiForm('/api/auth/request-password-reset', {
  method: 'POST',
  onSuccess: () => {
    complete.value = true
  }
})

async function onSubmit(event: FormSubmitEvent<ForgotPasswordInput>) {
  await submit({ ...event.data, redirectTo: '/reset-password' })
}
</script>

<template>
  <UContainer class="flex min-h-[calc(100dvh-12rem)] max-w-md items-center py-10">
    <UPageCard
      class="w-full"
      icon="i-lucide-key-round"
      title="Reset your password"
      description="Enter your email and we’ll send a reset link if an account matches it."
      spotlight
    >
      <template #body>
        <UAlert
          v-if="complete"
          color="success"
          variant="subtle"
          title="Check your email"
          description="If an account matches that email address, a password reset link is on its way."
        />

        <UForm
          v-else
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit"
        >
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

          <UButton
            type="submit"
            label="Send reset link"
            :loading="pending"
            block
          />
        </UForm>
      </template>

      <template #footer>
        <p class="text-center text-sm text-muted">
          Remembered your password?
          <NuxtLink
            to="/login"
            class="font-medium text-primary"
          >
            Sign in
          </NuxtLink>
        </p>
      </template>
    </UPageCard>
  </UContainer>
</template>
