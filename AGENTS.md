# AGENTS.md

Instructions for coding agents working in this repository.

**The full guide is [`CLAUDE.md`](./CLAUDE.md) — read it.** It applies to every
agent, not just Claude Code; the filename is only a convention. This file
exists so agents that look for `AGENTS.md` (Codex, OpenCode, Cursor, Gemini,
Copilot) find their way there rather than starting blind.

Kept deliberately short so the two cannot drift apart. The essentials:

1. **Run `pnpm verify` before saying a task is done.** typecheck + lint + unit
   tests + migration freshness, ~20s, no database needed. CI runs the same
   command.

2. **Scope your searches.** `docs/vendor/nuxt/` holds 235 vendored markdown
   files and will drown a repo-wide grep — `useFetch` has 4 hits in source and
   153 in docs. Search `app server shared tests scripts` by default; search
   `docs/vendor/nuxt/` only when you deliberately want framework docs.

3. **Read component APIs from `node_modules`, not the web.** Props and slots
   are in `node_modules/@nuxt/ui/dist/runtime/components/<Name>.vue.d.ts`
   (~500 tokens, version-exact). Allowed `color`/`variant`/`size` values are
   at the top of `.nuxt/ui/<name>.ts`. This project ships no MCP server.

4. **Copy the `posts` vertical slice** when adding a resource — schema →
   migration → contract → mapper → handlers → pages → tests. `CLAUDE.md` lists
   the files in order.

5. **`CLAUDE.md` has a "Rules that are not guessable" section.** Those eleven
   items each cost real debugging time to find. Read them before changing
   config, the database, or anything in `shared/`.
