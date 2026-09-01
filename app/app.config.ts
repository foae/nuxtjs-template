export default defineAppConfig({
  /* Site identity — read by app.vue (title template, meta) and the layout. */
  site: {
    name: 'Acme',
    tagline: 'Server-rendered Nuxt 4 + Postgres, ready to ship.'
  },
  ui: {
    colors: {
      primary: 'brand', // the scale in app/assets/css/main.css, or any Tailwind palette name
      neutral: 'stone' // zinc | slate | gray | neutral | stone
    }
    // Per-component defaults go here, e.g. `button: { defaultVariants: { size: 'md' } }`.
    // Shape and slot names: .agents/skills/nuxt-ui/ and node_modules/@nuxt/ui/dist/runtime/components/<Name>.vue.d.ts
  }
})
