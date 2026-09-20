import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

export type AuthEmail = {
  to: string
  kind: 'verification' | 'password-reset'
  url: string
}

type MailTransport = 'ses' | 'capture'

let sesClient: SESv2Client | undefined

function configuredTransport(): MailTransport {
  const transport = process.env.AUTH_MAIL_TRANSPORT

  if (transport === 'ses' || transport === 'capture') return transport

  if (!transport) {
    throw new Error(
      'AUTH_MAIL_TRANSPORT is not set. Set it explicitly to "ses" for delivery or "capture" for local/test capture.'
    )
  }

  throw new Error('AUTH_MAIL_TRANSPORT must be exactly "ses" or "capture".')
}

function isLoopbackBaseUrl(value: string | undefined): boolean {
  if (!value) return false

  try {
    const { hostname } = new URL(value)
    return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname)
  } catch {
    return false
  }
}

function captureDirectory(): string {
  const configured = process.env.AUTH_MAIL_CAPTURE_DIR

  if (configured !== undefined && !configured.trim()) {
    throw new Error('AUTH_MAIL_CAPTURE_DIR must not be empty when it is set.')
  }

  return resolve(configured || '.private/mail')
}

/** Validate the explicit mail transport configuration before authentication starts. */
export function validateAuthMailConfig(): void {
  const transport = configuredTransport()
  const isProduction = process.env.NODE_ENV === 'production'
  const isProductionTest = isProduction && process.env.AUTH_TEST_MODE === 'true'

  if (isProductionTest && !isLoopbackBaseUrl(process.env.AUTH_BASE_URL)) {
    throw new Error(
      'AUTH_TEST_MODE=true with NODE_ENV=production requires AUTH_BASE_URL to be a loopback URL (localhost, 127.0.0.0/8, or ::1).'
    )
  }

  if (transport === 'capture') {
    if (process.env.NODE_ENV !== 'development' && !(process.env.AUTH_TEST_MODE === 'true' && isLoopbackBaseUrl(process.env.AUTH_BASE_URL))) {
      throw new Error(
        'AUTH_MAIL_TRANSPORT=capture requires development or explicit loopback AUTH_TEST_MODE. Use AUTH_MAIL_TRANSPORT=ses for delivery.'
      )
    }

    captureDirectory()
    return
  }

  if (!process.env.AWS_REGION?.trim() || !process.env.AUTH_EMAIL_FROM?.trim()) {
    throw new Error('AUTH_MAIL_TRANSPORT=ses requires both AWS_REGION and AUTH_EMAIL_FROM.')
  }
}

function emailContent({ kind, url }: AuthEmail): { subject: string, text: string } {
  if (kind === 'verification') {
    return {
      subject: 'Verify your email address',
      text: `Verify your email address by opening this link:\n${url}`
    }
  }

  return {
    subject: 'Reset your password',
    text: `Reset your password by opening this link:\n${url}`
  }
}

async function captureAuthEmail(email: AuthEmail): Promise<void> {
  const directory = captureDirectory()
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)

  const filename = `${Date.now()}-${randomUUID()}.json`
  await writeFile(
    resolve(directory, filename),
    JSON.stringify({ to: email.to, kind: email.kind, url: email.url }),
    { encoding: 'utf8', mode: 0o600, flag: 'wx' }
  )
}

function getSesClient(): SESv2Client {
  sesClient ??= new SESv2Client({ region: process.env.AWS_REGION })
  return sesClient
}

/** Send a Better Auth verification or password-reset email through the configured transport. */
export async function sendAuthEmail(email: AuthEmail): Promise<void> {
  const transport = configuredTransport()
  validateAuthMailConfig()

  if (transport === 'capture') {
    await captureAuthEmail(email)
    return
  }

  const content = emailContent(email)
  await getSesClient().send(new SendEmailCommand({
    FromEmailAddress: process.env.AUTH_EMAIL_FROM,
    Destination: { ToAddresses: [email.to] },
    Content: {
      Simple: {
        Subject: { Data: content.subject, Charset: 'UTF-8' },
        Body: { Text: { Data: content.text, Charset: 'UTF-8' } }
      }
    }
  }))
}
