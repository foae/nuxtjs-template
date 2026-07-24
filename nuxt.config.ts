// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/test-utils/module',
    'nuxt-auth-utils'
  ],

  // Universal SSR. Pages render on the server from Postgres on every request.
  // Deliberately no `prerender` route rules: prerendering runs at build time,
  // where the database is not reachable, so any prerendered page would ship
  // stale or empty data. Add `routeRules` per-route only for genuinely static
  // pages, or use `swr`/`isr` if you want caching with a live database.
  ssr: true,

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // Server-only. Overridden by DATABASE_URL (see .env.example).
    databaseUrl: process.env.DATABASE_URL ?? '',
    public: {}
  },

  compatibilityDate: '2026-06-30',

  nitro: {
    // Self-hosted Node + Docker. See Dockerfile.
    preset: 'node-server'
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
