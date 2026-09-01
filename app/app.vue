<script setup lang="ts">
/**
 * Root component. Deliberately minimal: `<UApp>` (required by Nuxt UI for
 * toasts, tooltips and programmatic overlays) wrapping `<NuxtLayout>`.
 *
 * Chrome belongs in `app/layouts/default.vue`, not here — `app/error.vue`
 * renders instead of the layout, so anything placed here would also have to
 * work on the error page.
 */
// Site identity lives in `app/app.config.ts` — one place for name and tagline.
const { site } = useAppConfig()
const siteTitle = site.name
const description = site.tagline

useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: { lang: 'en' },
  // Pages set their own `useSeoMeta({ title })`; a page that sets none falls
  // back to the bare site title instead of "siteTitle · siteTitle".
  titleTemplate: pageTitle => pageTitle ? `${pageTitle} · ${siteTitle}` : siteTitle
})

useSeoMeta({ description, ogTitle: siteTitle, ogDescription: description })

// Resolved here, on every server render, so the flags are always in the
// payload: `useState` only carries what the SERVER initialised, and a visitor
// who lands on `/` and clicks "Sign in" reaches /login client-side, where the
// private runtime config is empty and the buttons would silently vanish.
useOAuthProviders()
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
