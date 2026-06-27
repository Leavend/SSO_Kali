import tailwindcss from '@tailwindcss/vite'

// SSR Identity Provider admin control plane.
// Secrets are read from their real deployment env-var names and kept in the
// PRIVATE half of runtimeConfig (server-only). Only adminAppBaseUrl is public.
export default defineNuxtConfig({
  ssr: true,
  srcDir: 'app/',
  compatibilityDate: '2026-06-27',
  devtools: { enabled: true },
  modules: ['@pinia/nuxt', 'reka-ui/nuxt'],
  css: ['~/assets/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  runtimeConfig: {
    adminOidcIssuer: process.env.ADMIN_OIDC_ISSUER ?? '',
    adminOidcPublicIssuer: process.env.ADMIN_OIDC_PUBLIC_ISSUER ?? '',
    ssoInternalBaseUrl: process.env.SSO_INTERNAL_BASE_URL ?? '',
    ssoInternalTokenUrl: process.env.SSO_INTERNAL_TOKEN_URL ?? '',
    ssoInternalJwksUrl: process.env.SSO_INTERNAL_JWKS_URL ?? '',
    adminOidcClientId: process.env.ADMIN_OIDC_CLIENT_ID ?? '',
    adminOidcClientSecret: process.env.ADMIN_OIDC_CLIENT_SECRET ?? '',
    ssoAdminSessionRedisUrl: process.env.SSO_ADMIN_SESSION_REDIS_URL ?? '',
    ssoSessionIdleTtlSeconds: process.env.SSO_SESSION_IDLE_TTL_SECONDS ?? '',
    ssoSessionAbsoluteTtlSeconds: process.env.SSO_SESSION_ABSOLUTE_TTL_SECONDS ?? '',
    ssoFreshAuthTtlSeconds: process.env.SSO_FRESH_AUTH_TTL_SECONDS ?? '',
    sessionEncryptionSecret: process.env.SESSION_ENCRYPTION_SECRET ?? '',
    public: {
      adminAppBaseUrl: process.env.ADMIN_APP_BASE_URL ?? '',
    },
  },
})
