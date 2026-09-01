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

  // Conservative security-header baseline. HSTS and CSP are deliberately
  // NOT set here: both belong to the deployment layer (reverse proxy /
  // ingress), where TLS termination and per-project script inventories
  // live. See README's deployment section.
  routeRules: {
    '/**': {
      headers: {
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'permissions-policy': 'camera=(), microphone=(), geolocation=()'
      }
    }
  },

  compatibilityDate: '2026-06-30',

  nitro: {
    // Self-hosted Node + Docker. See Dockerfile.
    preset: 'node-server',

    // Pre-compress build-time public assets (JS/CSS bundles) at build; Nitro
    // then serves the .gz/.br variant. Off by default, but this deployment is
    // self-hosted with no CDN in front, so nothing else compresses them.
    compressPublicAssets: { gzip: true, brotli: true },

    // tsconfig.server.json — the server context is configured here, not under
    // the top-level `typescript` key. See the comment there.
    typescript: {
      tsConfig: { compilerOptions: { allowJs: false } }
    }
  },

  // TypeScript-only. Nuxt generates `allowJs: true` by default, which would let
  // a stray .js file into app/, server/ or shared/ and be typechecked as `any`
  // without complaint. `strict` and `noUncheckedIndexedAccess` are already on
  // by default in Nuxt 4 — this only closes the JS door.
  // eslint.config.mjs reports the same thing with a clearer message.
  //
  // There are FOUR type contexts and each needs saying separately: `tsConfig`
  // is app only, and the server one lives under `nitro`, not here
  // (docs/vendor/nuxt/2.directory-structure/3.tsconfig.md). Setting only
  // `tsConfig` leaves server/ still accepting JavaScript.
  typescript: {
    tsConfig: { compilerOptions: { allowJs: false } },
    sharedTsConfig: { compilerOptions: { allowJs: false } },
    nodeTsConfig: { compilerOptions: { allowJs: false } }
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
