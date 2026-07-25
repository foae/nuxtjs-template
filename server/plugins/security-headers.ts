// Nuxt's SSR renderer hardcodes `x-powered-by: Nuxt` unconditionally after
// route-rule headers are applied (@nuxt/nitro-server
// dist/runtime/handlers/renderer.mjs — `setResponseHeader(event,
// "x-powered-by", "Nuxt")`), so the `routeRules` headers baseline in
// nuxt.config.ts cannot remove it. Version identification headers only help
// an attacker fingerprint the stack, so strip it here instead, via the
// `render:response` Nitro runtime hook (docs/vendor/nuxt/3.guide/6.going-
// further/2.hooks.md), which fires just before the response is sent.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response) => {
    delete response.headers?.['x-powered-by']
  })
})
