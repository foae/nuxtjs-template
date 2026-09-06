import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { consola } from 'consola'

function run(command: string, ...args: string[]) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function main() {
  const [mode, value, notes] = process.argv.slice(2)
  if (mode === '--help') {
    consola.info('Prepare: pnpm release:prepare <major.minor.patch>\nPublish: pnpm release:publish "Release title" <notes-file>')
    return
  }
  requireCondition(mode === 'prepare' || mode === 'publish', 'Expected prepare or publish; use --help.')
  requireCondition(run('git', 'status', '--porcelain') === '', 'Commit or stash changes before releasing.')
  requireCondition(run('git', 'branch', '--show-current') === 'main', 'Release from main only.')
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

  if (mode === 'prepare') {
    requireCondition(!!value && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value), 'Use a stable major.minor.patch version.')
    const current = manifest.version.split('.').map(Number)
    const next = value.split('.').map(Number)
    const difference = next.findIndex((part, index) => part !== current[index])
    requireCondition(difference >= 0 && next[difference]! > current[difference]!, 'The version must increase.')
    requireCondition(run('git', 'tag', '--list', `v${value}`) === '', 'That tag already exists locally.')
    requireCondition(run('git', 'ls-remote', '--tags', 'origin', `refs/tags/v${value}`) === '', 'That tag already exists remotely.')
    manifest.version = value
    writeFileSync('package.json', `${JSON.stringify(manifest, null, 2)}\n`)
    consola.success(`Prepared v${value}. Verify, commit, push main, and wait for CI before publishing.`)
    return
  }

  requireCondition(!!value?.trim() && !!notes, 'Supply a release title and a Markdown notes file.')
  requireCondition(readFileSync(notes, 'utf8').trim().length > 0, 'Release notes must not be empty.')
  requireCondition(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version), 'Package version must be stable SemVer.')
  const tag = `v${manifest.version}`
  const sha = run('git', 'rev-parse', 'HEAD')
  const remote = run('git', 'ls-remote', 'origin', 'refs/heads/main').split(/\s+/)[0]
  requireCondition(remote === sha, 'Push this exact commit to origin/main before publishing.')
  requireCondition(run('git', 'tag', '--list', tag) === '', 'Tag already exists locally; never move a published tag. Inspect and recover manually.')
  requireCondition(run('git', 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`) === '', 'Tag already exists remotely; never move it.')
  const runs = JSON.parse(run('gh', 'run', 'list', '--workflow', 'ci.yml', '--commit', sha, '--branch', 'main', '--event', 'push', '--json', 'databaseId,status,conclusion', '--limit', '1')) as { databaseId: number, status: string, conclusion: string }[]
  const ci = runs[0]
  requireCondition(!!ci && ci.status === 'completed' && ci.conclusion === 'success', 'Latest push CI must have passed on this exact commit.')
  const details = JSON.parse(run('gh', 'run', 'view', String(ci.databaseId), '--json', 'jobs')) as { jobs: { name: string, conclusion: string }[] }
  for (const name of ['verify', 'e2e', 'docker', 'ci']) {
    requireCondition(details.jobs.some(job => job.name === name && job.conclusion === 'success'), `CI job ${name} must pass, not skip.`)
  }
  run('git', 'tag', '-a', tag, sha, '-m', `${tag}: ${value}`)
  run('git', 'push', `--force-with-lease=refs/tags/${tag}:`, 'origin', `refs/tags/${tag}`)
  run('gh', 'release', 'create', tag, '--verify-tag', '--title', `${tag} — ${value}`, '--notes-file', notes, '--latest')
  const release = JSON.parse(run('gh', 'release', 'view', tag, '--json', 'isDraft,isPrerelease,tagName,url')) as { isDraft: boolean, isPrerelease: boolean, tagName: string, url: string }
  requireCondition(!release.isDraft && !release.isPrerelease && release.tagName === tag, 'Published release does not match the stable release contract.')
  consola.success(release.url)
}

try {
  main()
} catch (error) {
  // CLI stderr can contain private remote URLs or credentials. Report our own
  // validation messages, but do not echo arbitrary subprocess output.
  consola.error(error instanceof Error && !('status' in error) ? error.message : 'Release command failed; inspect Git/GitHub state before retrying. Existing tags are never overwritten.')
  process.exitCode = 1
}
