// SSR token-leak fixture: a representative masked provider list so the §3.3 gate
// renders the External IdPs page READY. has_client_secret is a BOOLEAN (never the
// secret value); client_id/issuer/endpoints are public OIDC config; no token, secret,
// session id, or PII-shaped digit run.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  providers: [
    {
      provider_key: 'sentinel-fed',
      display_name: 'Sentinel Federation',
      issuer: 'https://idp.sentinel.dev-sso.local',
      metadata_url: 'https://idp.sentinel.dev-sso.local/.well-known/openid-configuration',
      client_id: 'sso-sentinel-client',
      authorization_endpoint: 'https://idp.sentinel.dev-sso.local/authorize',
      token_endpoint: 'https://idp.sentinel.dev-sso.local/token',
      userinfo_endpoint: 'https://idp.sentinel.dev-sso.local/userinfo',
      jwks_uri: 'https://idp.sentinel.dev-sso.local/jwks',
      allowed_algorithms: ['RS256'],
      scopes: ['openid', 'profile', 'email'],
      priority: 100,
      enabled: true,
      is_backup: false,
      tls_validation_enabled: true,
      signature_validation_enabled: true,
      has_client_secret: true,
      health_status: 'healthy',
    },
    {
      provider_key: 'acme-backup',
      display_name: 'Acme Backup',
      issuer: 'https://login.acme.dev-sso.local',
      metadata_url: 'https://login.acme.dev-sso.local/.well-known/openid-configuration',
      client_id: 'sso-acme-client',
      allowed_algorithms: ['RS256', 'ES256'],
      scopes: ['openid'],
      priority: 200,
      enabled: false,
      is_backup: true,
      tls_validation_enabled: true,
      signature_validation_enabled: false,
      has_client_secret: false,
      health_status: 'unknown',
    },
  ],
  meta: { current_page: 1, per_page: 25, total: 2 },
}))
