// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

/**
 * The Nuxt preset already brings ~148 rules (stylistic, core, and the
 * non-type-aware typescript-eslint set). Everything below is what it does not
 * cover and this project actually needs. Deliberately moderate: each rule here
 * earns its place by catching a bug or an inconsistency with a real cost, not
 * because it happens to be available.
 */
export default withNuxt(
  /**
   * Type-aware rules — the only ones that can see across a call boundary.
   *
   * `pnpm typecheck` does NOT catch a forgotten `await` on a database write:
   * the statement is valid TypeScript, the handler returns, the write never
   * lands, and the endpoint answers 200 having changed nothing. That is the
   * same shape of silent data bug as the PATCH regression in CLAUDE.md, so it
   * is worth the lint time.
   *
   * `checkThenables` is REQUIRED here, not decorative. Drizzle's query builders
   * are thenables rather than Promise instances, so at the default (`false`)
   * the rule reports nothing on `db.update(...)` — the exact call it is here
   * to guard.
   *
   * Scoped to app/server/shared here because those contexts are covered by
   * `projectService`. `scripts/` and `tests/` are NOT invisible to type-aware
   * linting — they get their own block below, pointed at
   * `tsconfig.tools.json` explicitly, since the project service does not
   * resolve them. Only root-level tooling config files (this one included)
   * stay outside type-aware linting.
   */
  {
    files: ['app/**/*.{ts,vue}', 'server/**/*.ts', 'shared/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-floating-promises': ['error', { checkThenables: true }],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error'
    }
  },

  /**
   * Type-aware rules for scripts/ and tests/, pointed at tsconfig.tools.json
   * explicitly since the app/server/shared project service above does not
   * resolve these directories.
   */
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.tools.json',
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-floating-promises': ['error', { checkThenables: true }],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error'
    }
  },

  /** Small, high-signal additions that need no type information. */
  {
    rules: {
      // `== null` stays legal: it is the idiomatic null-or-undefined check.
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'object-shorthand': ['error', 'properties'],
      'prefer-template': 'error',
      // Server logs go through `logger` (server/utils/logger.ts) and the error-log
      // plugin, which redact known secret shapes — but redaction is pattern-based
      // and NOT exhaustive. Never log raw request bodies or credentials. A bare
      // console.log bypasses the plugin entirely, making failures invisible to the
      // agent reading .logs/dev-errors.jsonl.
      'no-console': 'error'
    }
  },

  /**
   * TypeScript-only project.
   *
   * `allowJs` is off (nuxt.config.ts and tsconfig.tools.json), so a stray `.js`
   * file is already a type error — but that error reads like a module
   * resolution failure. This states the actual reason at the point of the
   * mistake.
   *
   * This config file is exempt by construction: ESLint loads flat config
   * directly, so it cannot be TypeScript.
   */
  {
    files: ['{app,server,shared,scripts,tests}/**/*.{js,jsx,cjs,mjs}'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'Program',
        message: 'This project is TypeScript-only. Rename to .ts, or use <script setup lang="ts"> in a .vue file.'
      }]
    }
  }
)
