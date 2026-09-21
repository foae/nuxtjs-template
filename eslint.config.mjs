// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

const sharedDynamicImportRestriction = {
  selector: 'ImportExpression[source.type=\'Literal\'][source.value=/^(?:#app(?:\\/|$)|#imports$|#server(?:\\/|$)|~\\/|@\\/|~~\\/(?:app|server)\\/|@@\\/(?:app|server)\\/|(?:\\.\\.\\/)+(?:app|server)\\/|vue(?:\\/|$)|h3(?:\\/|$)|nitropack(?:\\/|$))/]',
  message: 'Shared runtime modules cannot dynamically import Vue, Nitro, app, or server implementations. Use a platform-neutral shared module; computed imports and transitive dependencies require review.'
}

const forbiddenStatusRestriction = {
  selector: 'Property[key.name=\'statusCode\'][value.value=403]',
  message: 'Rule 10: return 404 for a missing or unauthorized resource so its existence is not confirmed. This literal-only guard does not catch values produced through variables or helpers.'
}

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
    files: ['app/**/*.{ts,vue}', 'server/**/*.ts', 'shared/**/*.ts', 'tests/nuxt/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-floating-promises': ['error', { checkThenables: true }],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error'
    }
  },

  /**
   * Type-aware rules for scripts/ and tests/, pointed at tsconfig.tools.json
   * explicitly since the app/server/shared project service above does not
   * resolve these directories.
   */
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts'],
    ignores: ['tests/nuxt/**'],
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

  /**
   * Narrow source-boundary guards. These inspect direct, literal imports only:
   * computed dynamic imports and transitive dependencies require review.
   */
  {
    files: ['shared/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '\\#app', '\\#app/**', '\\#imports', '\\#server', '\\#server/**',
            '~/**', '@/**', '~~/app/**', '~~/server/**', '@@/app/**', '@@/server/**',
            'vue', 'vue/**', 'h3', 'h3/**', 'nitropack', 'nitropack/**',
            '../**/app/**', '../**/server/**'
          ],
          allowTypeImports: true,
          message: 'Shared runtime modules must stay platform-neutral. Move implementation to app/server or import only a type from Vue, Nitro, app, or server code.'
        }]
      }],
      'no-restricted-syntax': ['error', sharedDynamicImportRestriction]
    }
  },
  {
    files: ['app/**/*.{ts,vue}'],
    ignores: ['app/plugins/**/*.server.ts', 'app/components/**/*.server.vue'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '\\#server', '\\#server/**', '~/server/**', '@/server/**', '~~/server/**', '@@/server/**',
            '../**/server/**'
          ],
          allowTypeImports: true,
          message: 'Client-capable app code cannot import server runtime implementations. Keep the code server-only (for example, a .server plugin/component) or expose a typed API boundary.'
        }]
      }],
      'no-restricted-syntax': ['error', {
        selector: 'ImportExpression[source.type=\'Literal\'][source.value=/^(?:#server(?:\\/|$)|~\\/server\\/|@\\/server\\/|~~\\/server\\/|@@\\/server\\/|(?:\\.\\.\\/)+server\\/)/]',
        message: 'Client-capable app code cannot dynamically import server runtime implementations. Keep the surface server-only or use a typed API boundary; computed imports require review.'
      }]
    }
  },

  /**
   * Resource handlers must validate request input through server/utils/validate.
   * Auth delegates parsing to Better Auth. A signed raw webhook may suppress a
   * single line with an eslint-disable comment that states its verification reason.
   */
  {
    files: ['server/api/**/*.ts'],
    ignores: ['server/api/auth/**'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: 'CallExpression[callee.name=\'readBody\']',
          message: 'Validate ordinary request bodies with validateBody(event, schema). A signed raw webhook may use a one-line, reasoned eslint-disable after signature verification is designed.'
        },
        {
          selector: 'CallExpression[callee.name=\'readRawBody\']',
          message: 'Validate ordinary request bodies with validateBody(event, schema). A signed raw webhook may use a one-line, reasoned eslint-disable after signature verification is designed.'
        },
        {
          selector: 'CallExpression[callee.name=\'readFormData\']',
          message: 'Validate ordinary request bodies with validateBody(event, schema). A signed raw webhook may use a one-line, reasoned eslint-disable after signature verification is designed.'
        },
        {
          selector: 'CallExpression[callee.name=\'readMultipartFormData\']',
          message: 'Validate ordinary request bodies with validateBody(event, schema). A signed raw webhook may use a one-line, reasoned eslint-disable after signature verification is designed.'
        },
        {
          selector: 'CallExpression[callee.name=\'getQuery\']',
          message: 'Validate ordinary query input with validateQuery(event, schema); this guard does not prove validation adequacy or authorization.'
        },
        {
          selector: 'CallExpression[callee.name=\'getRouterParams\']',
          message: 'Validate ordinary route parameters with validateParams(event, schema); this guard does not prove validation adequacy or authorization.'
        },
        {
          selector: 'CallExpression[callee.name=\'getRouterParam\']',
          message: 'Validate ordinary route parameters with validateParams(event, schema); this guard does not prove validation adequacy or authorization.'
        },
        forbiddenStatusRestriction
      ]
    }
  },
  {
    files: ['server/api/auth/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', forbiddenStatusRestriction]
    }
  },
  {
    files: ['shared/schemas/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', sharedDynamicImportRestriction, {
        selector: 'CallExpression[callee.property.name=\'partial\'][callee.object.name=/CreateSchema$/]',
        message: 'Rule 11: define fields once without defaults, then derive updates from those fields. Apply defaults only in the create schema; do not call .partial() on a *CreateSchema.'
      }]
    }
  },
  {
    files: ['app/**/*.vue'],
    rules: {
      'vue/block-lang': ['error', { script: { lang: 'ts' } }],
      'vue/require-explicit-emits': 'error',
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
      'vue/define-macros-order': ['error', {
        order: ['definePageMeta', 'defineProps', 'defineEmits'],
        defineExposeLast: true
      }]
    }
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
    }
  },

  /** Small, high-signal additions that need no type information. */
  {
    rules: {
      // Node builtins, packages, project aliases (#shared and ~), then relatives.
      // Alphabetize within groups; type imports follow the same source ordering.
      'import/order': ['error', {
        'groups': ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'pathGroups': [
          { pattern: '#shared/**', group: 'internal' },
          { pattern: '~/**', group: 'internal' }
        ],
        'pathGroupsExcludedImportTypes': ['builtin'],
        'alphabetize': { order: 'asc', caseInsensitive: true },
        'newlines-between': 'never'
      }],
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
   * Theme discipline: no raw Tailwind palette colours in templates.
   *
   * The whole design is driven by a handful of tokens (`ui.colors` in
   * app/app.config.ts, the BRAND block in app/assets/css/main.css). A page
   * that writes `text-green-500` or `bg-[#1a1a1a]` is a spot those tokens
   * cannot reach, and the day `primary` changes it is the one element that
   * keeps the old colour. Use the semantic classes Nuxt UI derives from the
   * tokens instead: `text-primary`, `bg-elevated`, `text-muted`,
   * `border-default`, `text-error` — and `ui.<component>` in app.config.ts
   * when a component needs a different default everywhere.
   *
   * Covers `class="…"` and `:class` (object, array, template literal) in
   * templates. It does NOT see class strings inside `<script>` or `ui` prop
   * objects — those still need a reviewer.
   */
  {
    files: ['app/**/*.vue'],
    rules: {
      'vue/no-restricted-class': ['error',
        // palette utilities with a numeric shade, any variant prefix, optional
        // opacity: `text-red-500`, `dark:hover:bg-zinc-900/50`, `border-t-brand-200`
        String.raw`/^(?:[\w-]+:)*(?:text|bg|border|ring|outline|from|to|via|fill|stroke|divide|placeholder|caret|accent|shadow|decoration|inset-ring|ring-offset)(?:-[xysetblr])?-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|brand)-\d{2,3}(?:\/\d+)?$/`,
        // arbitrary colour values: `bg-[#fff]`, `text-[rgb(…)]`, `border-[oklch(…)]`
        String.raw`/^(?:[\w-]+:)*(?:text|bg|border|ring|outline|from|to|via|fill|stroke|divide|shadow)(?:-[xysetblr])?-\[(?:#|rgba?\(|hsla?\(|oklch\(|oklab\()/`
      ]
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
