// SSR token-leak fixture: a representative OIDC foundation snapshot so the §3.3 gate
// renders the page READY. All PUBLIC OIDC discovery metadata + operational health —
// issuer/endpoint URLs, JWKS PUBLIC-key ids (kid/alg/use/status — never private key
// material), scope/claim/algorithm catalog, availability metrics, opaque correlation
// id. No token, secret, session id, or PII-shaped digit run (no 10/16/18-digit run).
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  checked_at: '2026-06-28T10:00:00Z',
  correlation_id: 'corr-oidc-sentinel',
  discovery: {
    issuer: 'https://sso.example/oidc',
    authorization_endpoint: 'https://sso.example/oauth/authorize',
    token_endpoint: 'https://sso.example/oauth/token',
    jwks_uri: 'https://sso.example/oauth/jwks',
    userinfo_endpoint: 'https://sso.example/oauth/userinfo',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    scopes_supported: ['openid', 'profile', 'email'],
    claims_supported: ['sub', 'email', 'name'],
    id_token_signing_alg_values_supported: ['RS256'],
  },
  jwks: {
    keys: [
      { kid: 'key-sentinel-a', alg: 'RS256', use: 'sig', status: 'published', published_at: '2026-05-01T00:00:00Z', rotated_at: null },
    ],
  },
  availability: {
    discovery: { name: 'Discovery metadata', status: 'healthy', http_status: 200, latency_ms: 42, last_checked_at: '2026-06-28T10:00:00Z', evidence_ref: null },
    jwks: { name: 'JWKS public keys', status: 'healthy', http_status: 200, latency_ms: 31, last_checked_at: '2026-06-28T10:00:00Z', evidence_ref: null },
  },
  evidence: {
    jwks_rotation: { status: 'recorded', label: 'Rotation drill', environment: 'production', latest_drill_at: '2026-05-30T00:00:00Z', operator_signoff: 'ops-lead', evidence_ref: null },
    availability_timeline: [
      { status: 'available', label: 'Daily probe', checked_at: '2026-06-28T00:00:00Z', evidence_ref: null },
    ],
  },
  catalog: {
    scopes: [{ name: 'openid', label: 'OpenID', description: 'Base OIDC scope', label_status: 'mapped' }],
    claims: [{ name: 'sub', scope_dependency: null, sensitivity: 'low' }],
    algorithms: [{ name: 'RS256', usage: 'id_token', status: 'active' }],
  },
  issuer_consistency: {
    status: 'pass',
    configured_issuer: 'https://sso.example/oidc',
    discovery_issuer: 'https://sso.example/oidc',
    public_base_url: 'https://sso.example',
    last_checked_at: '2026-06-28T10:00:00Z',
  },
  endpoint_consistency: [
    { name: 'token', discovered_url: 'https://sso.example/oauth/token', expected_url: 'https://sso.example/oauth/token', status: 'pass' },
  ],
}))
