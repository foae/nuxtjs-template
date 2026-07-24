<script setup lang="ts">
const { loggedIn, user, clear } = useUserSession()
const toast = useToast()

useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [{ rel: 'icon', href: '/favicon.ico' }],
  htmlAttrs: { lang: 'en' }
})

const title = 'Nuxt Agent-First Template'
const description = 'Server-rendered Nuxt 4 + Postgres template, built to be worked on by coding agents.'

useSeoMeta({ title, description, ogTitle: title, ogDescription: description })

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  toast.add({ title: 'Signed out', color: 'neutral' })
  await navigateTo('/')
}
</script>

<template>
  <UApp>
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
      <NuxtPage />
    </UMain>

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          Nuxt {{ 4 }} · Postgres · Drizzle — © {{ new Date().getFullYear() }}
        </p>
      </template>
    </UFooter>
  </UApp>
</template>
