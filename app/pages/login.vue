<script setup lang="ts">
import { credentialsSchema, registerSchema } from '#shared/schemas/auth'
import type { FormSubmitEvent } from '@nuxt/ui'

const route = useRoute()
const toast = useToast()
const { fetch: refreshSession } = useAuthSession()

const mode = ref<'login' | 'register'>('login')
const schema = computed(() => mode.value === 'login' ? credentialsSchema : registerSchema)
const state = reactive({ email: '', password: '', name: '' })

useSeoMeta({ title: () => mode.value === 'login' ? 'Sign in' : 'Create account' })

const redirectTarget = computed(() => {
  const raw = route.query.redirect
  const redirect = Array.isArray(raw) ? raw[0] : raw
  return safeRedirectPath(redirect ?? '/dashboard')
})
const signInError = computed(() => {
  const error = route.query.error
  return Array.isArray(error) ? error[0] : error
})
const verificationSessionRequired = computed(() => signInError.value === 'verification-session-required')
const hasSignInError = computed(() => Boolean(signInError.value) && !verificationSessionRequired.value)

const { data: providers, error: providersError } = await useOAuthProviders()
const hasProviders = computed(() => (
  providers.value.google
  || providers.value.github
  || providers.value.enterprise.length > 0
))
const providerPending = ref<string | null>(null)

const { submit, pending, errors } = useApiForm(
  () => mode.value === 'login' ? '/api/auth/sign-in/email' : '/api/auth/sign-up/email',
  {
    method: 'POST',
    onSuccess: async () => {
      await refreshSession()
      await navigateTo(redirectTarget.value)
    }
  }
)

const registrationCollision = computed(() => (
  mode.value === 'register'
  && /already|exists|registered|in use|taken/i.test(errors.value.email ?? '')
))

async function onSubmit(event: FormSubmitEvent<Record<string, unknown>>) {
  await submit(event.data)
}

async function startProviderSignIn(
  endpoint: '/api/auth/sign-in/social' | '/api/auth/sign-in/sso',
  provider: string
) {
  providerPending.value = provider

  try {
    const body = endpoint === '/api/auth/sign-in/social'
      ? { provider: provider as 'google' | 'github', callbackURL: redirectTarget.value, errorCallbackURL: '/login' }
      : { providerId: provider, callbackURL: redirectTarget.value, errorCallbackURL: '/login' }
    const { url } = await $fetch<{ url: string }>(endpoint, { method: 'POST', body })

    if (!url) throw new Error('The sign-in provider did not return a redirect URL.')
    await navigateTo(url, { external: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start external sign-in.'
    toast.add({ title: 'Sign-in unavailable', description: message, color: 'error' })
  } finally {
    providerPending.value = null
  }
}
</script>

<template>
  <UContainer class="flex min-h-[calc(100dvh-12rem)] max-w-md items-center py-10">
    <UPageCard
      class="w-full"
      icon="i-lucide-lock-keyhole"
      :title="mode === 'login' ? 'Welcome back' : 'Create your account'"
      :description="mode === 'login' ? 'Sign in to continue.' : 'Start using your account immediately.'"
      spotlight
    >
      <template #body>
        <UAlert
          v-if="verificationSessionRequired"
          class="mb-5"
          color="warning"
          variant="subtle"
          title="Sign in to confirm your email"
          description="Sign in in this browser, then request a new confirmation link from your dashboard."
        />

        <UAlert
          v-else-if="hasSignInError"
          class="mb-5"
          color="error"
          variant="subtle"
          title="External sign-in failed"
          description="Try again or use your email and password."
        />

        <UAlert
          v-if="providersError"
          class="mb-5"
          color="warning"
          variant="subtle"
          title="External sign-in is unavailable"
          description="You can still sign in with your email and password."
        />

        <div
          v-if="hasProviders"
          class="mb-5 space-y-3"
        >
          <UButton
            v-if="providers.google"
            label="Continue with Google"
            icon="i-simple-icons-google"
            color="neutral"
            variant="outline"
            block
            :loading="providerPending === 'google'"
            :disabled="providerPending !== null"
            @click="startProviderSignIn('/api/auth/sign-in/social', 'google')"
          />
          <UButton
            v-if="providers.github"
            label="Continue with GitHub"
            icon="i-simple-icons-github"
            color="neutral"
            variant="outline"
            block
            :loading="providerPending === 'github'"
            :disabled="providerPending !== null"
            @click="startProviderSignIn('/api/auth/sign-in/social', 'github')"
          />
          <UButton
            v-for="provider in providers.enterprise"
            :key="provider.id"
            :label="`Continue with ${provider.label}`"
            icon="i-lucide-building-2"
            color="neutral"
            variant="outline"
            block
            :loading="providerPending === provider.id"
            :disabled="providerPending !== null"
            @click="startProviderSignIn('/api/auth/sign-in/sso', provider.id)"
          />
          <USeparator label="or continue with email" />
        </div>

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
              autocomplete="name"
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

          <div
            v-if="registrationCollision"
            class="text-sm text-muted"
          >
            An account already uses this email. Continue with its sign-in provider, or
            <NuxtLink
              to="/forgot-password"
              class="font-medium text-primary"
            >
              reset the password
            </NuxtLink>
            if the account does not have a local password.
          </div>

          <UFormField
            label="Password"
            name="password"
            required
            :error="errors.password"
          >
            <template #hint>
              <NuxtLink
                v-if="mode === 'login'"
                to="/forgot-password"
                class="text-sm font-medium text-primary"
              >
                Forgot password?
              </NuxtLink>
            </template>
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
      </template>

      <template #footer>
        <p class="text-center text-sm text-muted">
          <template v-if="mode === 'login'">
            Need an account?
            <UButton
              color="primary"
              variant="link"
              class="p-0 font-medium"
              label="Create one"
              @click="mode = 'register'"
            />
          </template>
          <template v-else>
            Already have an account?
            <UButton
              color="primary"
              variant="link"
              class="p-0 font-medium"
              label="Sign in"
              @click="mode = 'login'"
            />
          </template>
        </p>
      </template>
    </UPageCard>
  </UContainer>
</template>
