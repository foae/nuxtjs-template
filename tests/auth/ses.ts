import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { consola } from 'consola'
import { sendAuthEmail, validateAuthMailConfig } from '../../server/lib/auth-mail'

type SesRequest = {
  FromEmailAddress?: string
  Destination?: { ToAddresses?: string[] }
  Content?: { Simple?: { Body?: { Text?: { Data?: string } } } }
}
type CapturedEmail = { kind: string }

function captureEnvironment(keys: readonly string[]) {
  return new Map(keys.map(key => [key, process.env[key]]))
}

function restoreEnvironment(values: Map<string, string | undefined>) {
  for (const [key, value] of values) {
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
}

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'auth-mail-probe-'))
  const environment = captureEnvironment([
    'NODE_ENV', 'AUTH_BASE_URL', 'AUTH_MAIL_TRANSPORT', 'AUTH_MAIL_CAPTURE_DIR', 'AUTH_TEST_MODE',
    'AWS_REGION', 'AUTH_EMAIL_FROM', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_ENDPOINT_URL'
  ])
  let body: SesRequest | undefined
  let failure = false
  let listening = false
  const server = createServer((request, response) => {
    void handleRequest().catch((error: unknown) => {
      response.destroy(error instanceof Error ? error : new Error(String(error)))
    })
    async function handleRequest() {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      body = JSON.parse(Buffer.concat(chunks).toString()) as SesRequest
      assert.equal(request.url, '/v2/email/outbound-emails')
      assert.match(request.headers.authorization ?? '', /AWS4-HMAC-SHA256/)
      response.writeHead(failure ? 400 : 200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(failure ? { message: 'rejected fixture', __type: 'MessageRejected' } : { MessageId: 'fixture-id' }))
    }
  })

  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    listening = true
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    Object.assign(process.env, {
      NODE_ENV: 'production',
      AUTH_BASE_URL: 'https://example.com',
      AUTH_MAIL_TRANSPORT: 'capture',
      AUTH_MAIL_CAPTURE_DIR: directory,
      AUTH_TEST_MODE: 'false'
    })
    assert.throws(validateAuthMailConfig, /AUTH_MAIL_TRANSPORT=capture/)

    process.env.AUTH_MAIL_TRANSPORT = 'ses'
    delete process.env.AWS_REGION
    assert.throws(validateAuthMailConfig, /AWS_REGION/)
    Object.assign(process.env, {
      AWS_REGION: 'eu-west-1',
      AUTH_EMAIL_FROM: 'Fixture <sender@example.com>',
      AWS_ACCESS_KEY_ID: 'fixture',
      AWS_SECRET_ACCESS_KEY: 'fixture',
      AWS_ENDPOINT_URL: `http://127.0.0.1:${address.port}`
    })
    await sendAuthEmail({ to: 'recipient@example.com', kind: 'verification', url: 'https://example.com/verify?token=fixture' })
    assert.equal(body?.FromEmailAddress, 'Fixture <sender@example.com>')
    assert.deepEqual(body?.Destination, { ToAddresses: ['recipient@example.com'] })
    assert.match(body?.Content?.Simple?.Body?.Text?.Data ?? '', /https:\/\/example.com\/verify\?token=fixture/)

    failure = true
    await assert.rejects(
      sendAuthEmail({ to: 'recipient@example.com', kind: 'password-reset', url: 'https://example.com/reset?token=fixture' }),
      /rejected fixture/
    )
    assert.deepEqual(await readdir(directory), [])

    Object.assign(process.env, { NODE_ENV: 'development', AUTH_MAIL_TRANSPORT: 'capture' })
    await sendAuthEmail({ to: 'recipient@example.com', kind: 'password-reset', url: 'http://localhost/reset?token=fixture' })
    const [filename] = await readdir(directory)
    assert.ok(filename, 'development capture creates a mail artifact')
    const captured = JSON.parse(await readFile(join(directory, filename), 'utf8')) as CapturedEmail
    assert.equal(captured.kind, 'password-reset')
    assert.equal((await stat(directory)).mode & 0o777, 0o700)
    assert.equal((await stat(join(directory, filename))).mode & 0o777, 0o600)
    consola.success('SES signed request and content, delivery failure propagation, production capture rejection, and development capture permissions are verified.')
  } finally {
    if (listening) {
      server.close()
      await once(server, 'close')
    }
    await rm(directory, { recursive: true, force: true })
    restoreEnvironment(environment)
  }
}

main().catch((error: unknown) => {
  consola.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
