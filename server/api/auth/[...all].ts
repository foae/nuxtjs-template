import { isIP } from 'node:net'
import { getRequestIP, toWebRequest } from 'h3'
import { authConfiguration, getAuth } from '../../lib/auth'
import { logger, redact } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event)
  const headers = new Headers(request.headers)
  const socketIP = getRequestIP(event, { xForwardedFor: false }) ?? ''
  const normalizedIP = socketIP.startsWith('::ffff:') ? socketIP.slice(7) : socketIP
  const proxyIP = headers.get('x-real-ip') ?? ''
  // Only an explicitly trusted socket peer may supply a single client address.
  const clientIP = authConfiguration().trustedProxyIPs.includes(normalizedIP) && isIP(proxyIP)
    ? proxyIP
    : normalizedIP
  headers.set('x-auth-client-ip', clientIP)
  const forwarded = new Request(request, { headers })
  const response = await getAuth(useDb()).handler(forwarded)
  if (response.status >= 400) {
    const details = redact({ method: request.method, path: new URL(request.url).pathname, status: response.status })
    if (response.status >= 500) logger.error('Authentication request failed', details)
    else logger.warn('Authentication request rejected', details)
  }
  if (response.status === 403 && new URL(request.url).pathname === '/api/auth/verify-email') {
    const body: unknown = await response.clone().json().catch(() => null)
    if (body && typeof body === 'object' && 'code' in body && body.code === 'EMAIL_VERIFICATION_SESSION_REQUIRED') {
      return Response.redirect(new URL('/login?error=verification-session-required', authConfiguration().baseURL), 302)
    }
  }
  if (response.status === 422) {
    const body: unknown = await response.clone().json().catch(() => null)
    if (body && typeof body === 'object') {
      const errors = 'errors' in body
        ? body.errors
        : 'code' in body && body.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
          ? { email: 'This email is already registered.' }
          : null
      if (!errors) return response
      return new Response(JSON.stringify({ ...body, data: { errors } }), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    }
  }
  return response
})
