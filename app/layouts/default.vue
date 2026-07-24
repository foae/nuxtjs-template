<script setup lang="ts">
/**
 * Default layout — the chrome every page gets.
 *
 * Pages opt into a different one with:
 *   definePageMeta({ layout: 'marketing' })
 *
 * Put navigation, sidebars and footers here, not in `app/app.vue`. `app.vue`
 * only holds `<UApp>` and `<NuxtLayout>` so that `app/error.vue` — which
 * renders *instead of* the layout — doesn't inherit a broken shell.
 */
const { loggedIn, user, clear } = useUserSession()
const toast = useToast()

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  toast.add({ title: 'Signed out', color: 'neutral' })
  await navigateTo('/')
}
</script>

<template>
  <div>
    <UHeader>
      <template #left>
        <NuxtLink
          to="/"
          class="font-semibold"
        >
          Agent-First Template
        </NuxtLink>
      </template>

      <template #right>
        <UColorModeButton />

        <template v-if="loggedIn">
          <UButton
            to="/posts/new"
            icon="i-lucide-plus"
            size="sm"
            label="New post"
          />
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            :label="user?.name"
            trailing-icon="i-lucide-log-out"
            @click="logout"
          />
        </template>

        <UButton
          v-else
          to="/login"
          color="neutral"
          variant="subtle"
          size="sm"
          label="Sign in"
        />
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          Nuxt · Postgres · Drizzle — © {{ new Date().getFullYear() }}
        </p>
      </template>
    </UFooter>
  </div>
</template>
