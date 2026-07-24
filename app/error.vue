<script setup lang="ts">
/**
 * Error boundary for the whole app. Nuxt renders this instead of a page when
 * a route throws `createError({ fatal: true })` — see `app/pages/posts/[id].vue`
 * turning an API 404 into a real 404.
 *
 * Without this file you get Nuxt's built-in page, which leaks a stack trace
 * in development and gives users nothing useful in production.
 */
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const is404 = computed(() => props.error.statusCode === 404)

// `import.meta.dev` is compiled away in production, so the details block below
// is removed from the production bundle entirely.
const isDev = import.meta.dev

useHead({ title: `${props.error.statusCode} — ${props.error.statusMessage}` })
</script>

<template>
  <UApp>
    <UContainer class="py-24 text-center max-w-lg">
      <p class="text-6xl font-semibold text-primary">
        {{ error.statusCode }}
      </p>

      <h1 class="text-xl font-medium mt-4">
        {{ is404 ? 'Page not found' : (error.statusMessage || 'Something went wrong') }}
      </h1>

      <p class="text-muted mt-2">
        {{
          is404
            ? 'That page does not exist, or you do not have access to it.'
            : 'Try again, or head back to the start.'
        }}
      </p>

      <!-- Details only in dev: `error.message` can carry internals that
           should never reach a user in production. -->
      <UAlert
        v-if="isDev && error.message && error.message !== error.statusMessage"
        class="mt-6 text-left"
        color="neutral"
        variant="subtle"
        :title="error.message"
      />

      <UButton
        class="mt-8"
        label="Back to posts"
        @click="clearError({ redirect: '/' })"
      />
    </UContainer>
  </UApp>
</template>
