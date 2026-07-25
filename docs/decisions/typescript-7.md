# Why TypeScript stays on 6.x

Referenced from `CLAUDE.md` → "TypeScript stays on 6.x". This file carries the
full evidence so the always-loaded agent instructions can stay short.

TypeScript 7 is stable (7.0.2) and this project cannot use it yet. It is the
Go-native rewrite: `typescript/lib/tsc.js` only `execve`s a platform binary,
and the JS compiler API is gone from the exports map — which is why
`@typescript/typescript6` exists as a separate package. Checked on
2026-07-25, three independent blockers, any one of them fatal:

1. **`pnpm lint` dies.** `@typescript-eslint/parser` throws
   `typescript-eslint does not support TS 7.0` — an explicit runtime guard,
   not a peer warning. Its peer range is `>=4.8.4 <6.1.0`, and the canary
   (8.65.1-alpha.7) has the same range.
2. **`pnpm typecheck` dies.** `vue-tsc` fails with
   `ERR_PACKAGE_PATH_NOT_EXPORTED` resolving `typescript/lib/tsc`. No vue-tsc
   release supports TS 7.
3. **Nuxt's own generated types don't survive it.** Even bare
   `tsc -p .nuxt/tsconfig.app.json` fails with `TS2321: Excessive stack depth`
   in the generated `$fetch` route-key inference. The server, shared and node
   contexts pass — only the app context blows up.

## Re-test protocol

Bump `typescript` in `package.json`, run `pnpm verify`, and revert unless all
three blockers are fixed upstream. Update the check date here and in
`CLAUDE.md` when you re-test.
