---
name: nuxt-page
description: Add or change a page in this Nuxt 4 template — a new route, screen or view, linking it from the main menu/nav, gating it behind login, fetching its data, and composing it from Nuxt UI components. Use for any task like "create a page for X", "add X to the menu", "make a new screen with these components", or "this page needs to load Y".
---

# Adding a page

A checklist, not a tutorial. Each step says where to look when you need more —
open those only when the step is not already obvious.

## 1. Create the route

File path *is* the URL. No router config exists or should be written.

| Want | Create |
|---|---|
| `/reports` | `app/pages/reports.vue` |
| `/reports` + children | `app/pages/reports/index.vue` |
| `/reports/:id` | `app/pages/reports/[id]/index.vue` |
| `/reports/:id/edit` | `app/pages/reports/[id]/edit.vue` |

Use the folder + `index.vue` form whenever a sibling child route exists or is
likely. `[id].vue` beside `[id]/edit.vue` turns `[id].vue` into a *parent* that
must render `<NuxtPage/>`, which is a confusing failure — the reference slice
uses `posts/[id]/index.vue` for exactly this reason.

Depth: `rg "pages directory" docs/vendor/nuxt/` (vendored, version-pinned).

## 2. Put it in the main menu

One entry in the `menu` array at the top of `app/layouts/default.vue`:

```ts
{ label: 'Reports', to: '/reports', icon: 'i-lucide-chart-bar' }
```

- `exact: true` only for `/` — otherwise that entry highlights on every route.
- Gate an entry on auth with `loggedIn` (already in scope in that file).
- Do **not** add nav markup to `app/app.vue` — it holds only `<UApp>` and
  `<NuxtLayout>` so `app/error.vue` doesn't inherit a broken shell.
- Icons must exist in an installed collection (`lucide`, `simple-icons`); a
  bad name renders as blank space with no error:
  `rg -o '"chart-bar[^"]*"' node_modules/@iconify-json/lucide/icons.json`

## 3. Decide access and layout

```ts
definePageMeta({ middleware: 'auth' })   // signed-in only
definePageMeta({ layout: 'marketing' })  // a different shell
```

`middleware: 'auth'` redirects anonymous visitors to `/login`
(`app/middleware/auth.ts`). It guards the *page*; the API handler must still
check the session itself — never rely on client middleware for authorisation.

## 4. Load its data

`useFetch` at setup level. `$fetch` during setup fetches twice (once on the
server, again on hydration) — it belongs in event handlers only.

```ts
const { data, status, error } = await useFetch('/api/reports')
```

- Query params that change: pass a `computed` — it refetches by itself, so
  don't add a watcher.
- Keep page state in the URL, not in a `ref`: `app/pages/index.vue` is the
  pagination reference, and always clamp a parsed page number.
- Submitting a form? `useApiForm()`, never hand-rolled `$fetch` + `ref(false)`
  — see the Forms section of `CLAUDE.md`.
- Needs a new endpoint? That is a different job: follow **Adding a resource**
  in `CLAUDE.md` (an ordered 8-step build), and read **Relations and
  ownership** first if the resource belongs to another one.
- **Never** prerender a page whose data comes from Postgres — build time has no
  database. Use `swr`/`isr` route rules if you want caching.

## 5. Compose the UI

1. *Which* component → `.agents/skills/nuxt-ui/` (`SKILL.md` + `references/`).
2. *What it accepts* → `node_modules/@nuxt/ui/dist/runtime/components/<Name>.vue.d.ts`
   (~500 tokens, version-exact).
3. *Allowed `color`/`variant`/`size`* → `.nuxt/ui/<name>.ts`, first ~40 lines.
   These reflect this project's `app/app.config.ts` theme, which published docs
   cannot know.

Ignore the MCP instructions in the vendored `SKILL.md` — this project ships no
MCP server on purpose. `.agents/skills/nuxt-ui/PROJECT-OVERRIDE.md` says the
same. `.nuxt/` is generated: run `pnpm nuxt prepare` if it is missing.

Handle the three states a fetched page has: `status === 'pending'`
(`USkeleton`), empty result, and `error`. Uncaught fatal errors render
`app/error.vue` instead of your page.

Page-level SEO overrides the defaults set in `app/app.vue`:

```ts
useSeoMeta({ title: 'Reports', description: '…' })
```

## 6. Check it

```bash
pnpm verify                      # typecheck + lint + tests + migrations + docs pin
pnpm db:up && pnpm db:reset      # needs .env — `cp .env.example .env` once
pnpm dev &                       # background it: it never exits
until curl -sf -o /dev/null localhost:3000/; do sleep 1; done   # wait for boot

# The page really renders — and server-side, not only after hydration.
curl -s localhost:3000/reports | grep -q '<h1' && echo ok
tail -5 .logs/dev-errors.jsonl | jq .    # your own server errors, greppable
```

`verify` cannot tell you the page renders, that the nav entry points at the
right route, or that the data is correct — it catches mechanical mistakes only.
Fetching the URL is the cheapest proof; if the markup is missing from the raw
HTML but appears in a browser, your data moved to client-only fetching (step 4).

For a page that changes data, that is not enough — follow half 2 of **Done
means two things** in `CLAUDE.md` and exercise the endpoint behind it.
