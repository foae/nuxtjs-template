import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const eslint = new ESLint({ cwd: process.cwd() })
const fixingEslint = new ESLint({ cwd: process.cwd(), fix: true })

async function lintRuleIds(code: string, filePath: string, fixer = eslint): Promise<string[]> {
  if (filePath.endsWith('.vue') && !code.trimStart().startsWith('<')) {
    code = `<script setup lang="ts">\n${code}</script>\n`
  }
  const results = await fixer.lintText(code, { filePath })
  expect(results.flatMap(result => result.messages.filter(message => message.fatal))).toEqual([])
  return results.flatMap(result => result.messages.flatMap(message => message.ruleId ? [message.ruleId] : []))
}

describe('lint safety guards', () => {
  // The first typed lint loads Nuxt's app and server TypeScript projects.
  it('rejects unsafe values in TypeScript and Vue script blocks', async () => {
    const tsRules = await lintRuleIds(
      'const input = JSON.parse(\'{}\')\ninput.title\n',
      'server/utils/validate.ts'
    )
    const vueRules = await lintRuleIds(
      '<script setup lang="ts">\nconst input = JSON.parse(\'{}\')\ninput.title\n</script>\n',
      'app/pages/index.vue'
    )

    expect(tsRules).toContain('@typescript-eslint/no-unsafe-member-access')
    expect(vueRules).toContain('@typescript-eslint/no-unsafe-member-access')
  }, 30_000)

  it('requires TypeScript Vue scripts without requiring a script block', async () => {
    const missingLanguageRules = await lintRuleIds(
      '<script setup>\nconst title = \'Post\'\n</script>\n',
      'app/pages/index.vue'
    )
    const scriptlessRules = await lintRuleIds('<template><main /></template>\n', 'app/pages/index.vue')

    expect(missingLanguageRules).toContain('vue/block-lang')
    expect(scriptlessRules).not.toContain('vue/block-lang')
  })

  it('promotes selected Vue conventions to errors', async () => {
    const emitsRules = await lintRuleIds(
      '<script setup lang="ts">\nconst emit = defineEmits([\'saved\'])\nemit(\'deleted\')\n</script>\n',
      'app/pages/index.vue'
    )
    const blockRules = await lintRuleIds(
      '<template><main /></template>\n<script setup lang="ts">\n</script>\n',
      'app/pages/index.vue'
    )
    const macroRules = await lintRuleIds(
      '<script setup lang="ts">\nconst emit = defineEmits<{ saved: [] }>()\ndefinePageMeta({})\ndefineProps<{ title: string }>()\n</script>\n',
      'app/pages/index.vue'
    )

    expect(emitsRules).toContain('vue/require-explicit-emits')
    expect(blockRules).toContain('vue/block-order')
    expect(macroRules).toContain('vue/define-macros-order')
  })

  it('reports unused lint suppressions', async () => {
    const results = await eslint.lintText(
      '// eslint-disable-next-line no-console\nconst title = \'Post\'\n',
      { filePath: 'server/utils/validate.ts' }
    )

    expect(results[0]?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining('Unused eslint-disable directive') })
    ]))
  })

  // Shared has its own TypeScript project, initialized by this integration test.
  it('blocks direct runtime imports while preserving type and server-only boundaries', async () => {
    const sharedRuntimeRules = await lintRuleIds(
      'import { useRuntimeConfig } from \'#app\'\nvoid useRuntimeConfig\n',
      'shared/schemas/post.ts'
    )
    const sharedTypeRules = await lintRuleIds(
      'import type { H3Event } from \'h3\'\nexport type Event = H3Event\n',
      'shared/schemas/post.ts'
    )
    const reexportRules = await lintRuleIds(
      'export { createDb } from \'../server/database/client\'\n',
      'shared/schemas/post.ts'
    )
    const sharedDynamicRules = await lintRuleIds(
      'void import(\'#server/database/client\')\n',
      'shared/schemas/post.ts'
    )
    const sharedDynamicVueRules = await lintRuleIds(
      'void import(\'vue\')\n',
      'shared/schemas/post.ts'
    )
    const sharedDynamicH3Rules = await lintRuleIds(
      'void import(\'h3\')\n',
      'shared/schemas/post.ts'
    )
    const sharedDynamicNitroRules = await lintRuleIds(
      'void import(\'nitropack\')\n',
      'shared/schemas/post.ts'
    )
    const sharedAliasRules = await lintRuleIds(
      'import { createDb } from \'@@/server/database/client\'\nvoid createDb\n',
      'shared/schemas/post.ts'
    )
    const sharedAppAliasRules = await lintRuleIds(
      'import { useRuntimeConfig } from \'@/app/config\'\nvoid useRuntimeConfig\n',
      'shared/schemas/post.ts'
    )
    const appRuntimeRules = await lintRuleIds(
      'import { createDb } from \'#server/database/client\'\nvoid createDb\n',
      'app/pages/index.vue'
    )
    const appAliasRules = await lintRuleIds(
      'import { createDb } from \'~~/server/database/client\'\nvoid createDb\n',
      'app/pages/index.vue'
    )
    const appDeepTraversalRules = await lintRuleIds(
      'import { createDb } from \'../../../../server/database/client\'\nvoid createDb\n',
      'app/pages/index.vue'
    )
    const serverSurfaceRules = await lintRuleIds(
      'import { createDb } from \'#server/database/client\'\nvoid createDb\n',
      'server/api/posts/index.post.ts'
    )

    expect(sharedRuntimeRules).toContain('no-restricted-imports')
    expect(sharedTypeRules).not.toContain('no-restricted-imports')
    expect(reexportRules).toContain('no-restricted-imports')
    expect(sharedDynamicRules).toContain('no-restricted-syntax')
    expect(sharedDynamicVueRules).toContain('no-restricted-syntax')
    expect(sharedDynamicH3Rules).toContain('no-restricted-syntax')
    expect(sharedDynamicNitroRules).toContain('no-restricted-syntax')
    expect(sharedAliasRules).toContain('no-restricted-imports')
    expect(sharedAppAliasRules).toContain('no-restricted-imports')
    expect(appRuntimeRules).toContain('no-restricted-imports')
    expect(appAliasRules).toContain('no-restricted-imports')
    expect(appDeepTraversalRules).toContain('no-restricted-imports')
    expect(serverSurfaceRules).not.toContain('no-restricted-imports')
  }, 30_000)

  it('exempts only Nuxt server-only plugins and components, not suffixed utilities', async () => {
    for (const [path, restricted] of [
      ['app/plugins/database.server.ts', false],
      ['app/components/Database.server.vue', false],
      ['app/utils/database.server.ts', true]
    ] as const) {
      // Resolve scope against the virtual path, then run only the boundary rules.
      // These fixtures contain plain import syntax and need no project type data.
      const config = await eslint.calculateConfigForFile(path)
      const boundaryLint = new ESLint({
        overrideConfigFile: true,
        overrideConfig: {
          rules: {
            'no-restricted-imports': config.rules['no-restricted-imports'] ?? 'off',
            'no-restricted-syntax': config.rules['no-restricted-syntax'] ?? 'off'
          }
        }
      })
      const results = await boundaryLint.lintText(
        'import { createDb } from \'#server/database/client\'; void import(\'#server/database/client\');'
      )
      const rules = results.flatMap(result => result.messages.map(message => message.ruleId))
      expect(rules.includes('no-restricted-imports'), path).toBe(restricted)
      expect(rules.includes('no-restricted-syntax'), path).toBe(restricted)
    }
  })

  it('requires established resource-input validators while allowing delegated auth', async () => {
    const validatedRules = await lintRuleIds(
      'await validateBody(event, postCreateSchema)\n',
      'server/api/posts/index.post.ts'
    )
    const rawBodyRules = await lintRuleIds('await readBody(event)\n', 'server/api/posts/index.post.ts')
    const queryRules = await lintRuleIds('getQuery(event)\n', 'server/api/posts/index.post.ts')
    const authRules = await lintRuleIds('await readBody(event)\n', 'server/api/auth/[...all].ts')

    expect(validatedRules).not.toContain('no-restricted-syntax')
    expect(rawBodyRules).toContain('no-restricted-syntax')
    expect(queryRules).toContain('no-restricted-syntax')
    expect(authRules).not.toContain('no-restricted-syntax')
  })

  it('enforces literal rule 10 and rule 11 conventions in their bounded scopes', async () => {
    const createPartialRules = await lintRuleIds('postCreateSchema.partial()\n', 'shared/schemas/post.ts')
    const otherPartialRules = await lintRuleIds('postFields.partial()\n', 'shared/schemas/post.ts')
    const apiForbiddenRules = await lintRuleIds(
      'throw createError({ statusCode: 403 })\n',
      'server/api/posts/index.post.ts'
    )
    const utilityForbiddenRules = await lintRuleIds(
      'throw createError({ statusCode: 403 })\n',
      'server/utils/validate.ts'
    )

    expect(createPartialRules).toContain('no-restricted-syntax')
    expect(otherPartialRules).not.toContain('no-restricted-syntax')
    expect(apiForbiddenRules).toContain('no-restricted-syntax')
    expect(utilityForbiddenRules).not.toContain('no-restricted-syntax')
  })

  it('autofixes unordered imports', async () => {
    const source = '<script setup lang="ts">\nimport { postCreateSchema } from \'#shared/schemas/post\'\nimport type { FormSubmitEvent } from \'@nuxt/ui\'\n</script>\n'
    const results = await fixingEslint.lintText(source, { filePath: 'app/pages/login.vue' })
    const fixed = results[0]?.output ?? source

    expect(await lintRuleIds(source, 'app/pages/login.vue')).toContain('import/order')
    expect(fixed).not.toBe(source)
    expect(await lintRuleIds(fixed, 'app/pages/login.vue')).not.toContain('import/order')
  })
})
