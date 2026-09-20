import { authConfiguration } from '../../lib/auth'

export default defineEventHandler(() => {
  const config = authConfiguration()
  return {
    google: Boolean(config.googleId && config.googleSecret),
    github: Boolean(config.githubId && config.githubSecret),
    enterprise: config.providers.map(provider => ({ id: provider.providerId, label: provider.label }))
  }
})
