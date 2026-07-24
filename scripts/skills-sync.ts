/**
 * Vendors the first-party Nuxt UI agent skill into `.claude/skills/nuxt-ui/`,
 * pinned to the @nuxt/ui version this project has installed.
 *
 *   pnpm skills:sync
 *
 * The skill is maintained by the Nuxt team (nuxt/ui repo, `skills/nuxt-ui/`).
 * It teaches an agent WHICH component to reach for and HOW to compose layouts;
 * it deliberately does not list props.
 *
 * Note: upstream's SKILL.md tells the agent to use the Nuxt UI MCP server for
 * props/slots. This template intentionally ships no MCP, so `.claude/skills/
 * nuxt-ui/PROJECT-OVERRIDE.md` redirects those lookups to node_modules and
 * .nuxt/ui, which are version-exact and cost far less context. CLAUDE.md
 * documents that route.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { consola } from 'consola'

const REPO = 'nuxt/ui'
const SKILL_PREFIX = 'skills/nuxt-ui/'
const OUT_DIR = resolve('.claude/skills/nuxt-ui')

interface TreeEntry { path: string, type: string }

async function main() {
  // Read from disk rather than require.resolve: @nuxt/ui does not expose
  // "./package.json" in its exports map. pnpm still symlinks the package
  // into node_modules, so this path is stable.
  const pkgRaw = await readFile(resolve('node_modules/@nuxt/ui/package.json'), 'utf8')
  const { version } = JSON.parse(pkgRaw) as { version: string }
  const tag = `v${version}`

  consola.start(`Syncing Nuxt UI skill from ${REPO}@${tag}`)

  const treeRes = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${tag}?recursive=1`)
  if (!treeRes.ok) {
    throw new Error(`Could not read the ${tag} tree (HTTP ${treeRes.status}).`)
  }

  const { tree } = await treeRes.json() as { tree: TreeEntry[] }
  const files = tree
    .filter(t => t.type === 'blob' && t.path.startsWith(SKILL_PREFIX))
    .map(t => t.path)

  if (files.length === 0) throw new Error(`No files under ${SKILL_PREFIX} at ${tag}.`)

  await rm(OUT_DIR, { recursive: true, force: true })

  let bytes = 0
  await Promise.all(files.map(async (path) => {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${tag}/${path}`)
    if (!res.ok) throw new Error(`Failed to fetch ${path} (HTTP ${res.status})`)

    const body = await res.text()
    bytes += Buffer.byteLength(body)

    const dest = join(OUT_DIR, path.slice(SKILL_PREFIX.length))
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, body, 'utf8')
  }))

  await writeFile(join(OUT_DIR, 'VERSION'), `${version}\n`)
  await writeFile(join(OUT_DIR, 'PROJECT-OVERRIDE.md'), `# Project override — component API lookups

The upstream SKILL.md says to use the Nuxt UI MCP server for props, slots and
events. **This project ships no MCP server on purpose.** Use these instead —
both are version-exact for the installed @nuxt/ui (${version}) and far cheaper
in context than a docs page:

| You need | Read | Cost |
|---|---|---|
| Props, slots, events for \`<UButton>\` | \`node_modules/@nuxt/ui/dist/runtime/components/Button.vue.d.ts\` | ~500 tokens |
| Allowed \`color\`/\`variant\`/\`size\` values | \`.nuxt/ui/button.ts\` (top of file) | read the first ~40 lines |
| Which component to use, how to compose | \`SKILL.md\` + \`references/\` here | — |

The equivalent doc page on ui.nuxt.com is ~28 KB (~7K tokens) for a single
component, is not pinned to your installed version, and needs the network.

\`.nuxt/\` is generated — run \`pnpm nuxt prepare\` (or \`pnpm dev\`) if it's absent.
It also reflects your own \`app/app.config.ts\` theme overrides, which the
published docs cannot know about.
`)

  consola.success(
    `Vendored ${files.length} skill files (${(bytes / 1024).toFixed(0)} KB) for @nuxt/ui ${version} -> .claude/skills/nuxt-ui/`
  )
}

main().catch((error) => {
  consola.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
