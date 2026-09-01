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
import type { NavigationMenuItem } from '@nuxt/ui'

const { site } = useAppConfig()
const { loggedIn, user, clear } = useUserSession()
const toast = useToast()

// Extension point: add a page to the main menu by adding one entry here.
// `to` is the route, `icon` is an `i-lucide-*` name. Entries can be gated
// with `loggedIn` (e.g. `...(loggedIn.value ? [{ ... }] : [])`).
const menu = computed<NavigationMenuItem[]>(() => [
  { label: 'Posts', to: '/', icon: 'i-lucide-newspaper', exact: true }
])

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  toast.add({ title: 'Signed out', color: 'neutral' })
  await navigateTo('/')
}
</script>

<template>
  <div>
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded-md focus:bg-default focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-primary"
    >
      Skip to content
    </a>

    <UHeader>
      <template #left>
        <NuxtLink
          to="/"
          class="font-display font-semibold tracking-tight"
        >
          {{ site.name }}
        </NuxtLink>
      </template>

      <template #default>
        <UNavigationMenu
          :items="menu"
          variant="link"
        />
      </template>

      <template #content>
        <UNavigationMenu
          :items="menu"
          orientation="vertical"
          class="-mx-2.5"
        />
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

    <UMain
      id="main"
      tabindex="-1"
    >
      <slot />
    </UMain>

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          {{ site.name }} © {{ new Date().getFullYear() }}
        </p>
      </template>
    </UFooter>
  </div>
</template>
