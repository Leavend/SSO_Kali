// SSR token-leak fixture: a representative MASKED OAuth-client detail so the §3.3
// gate can render /clients/[clientId] in its READY state. It carries only
// `has_secret_hash: true` plus secret TIMESTAMPS (rotated/expires) — NEVER the
// plaintext secret and NEVER a client_secret field: the masked-DTO invariant
// (Task 5.1) keeps the secret off the SSR path entirely, and useClientDetail
// serializes this response verbatim into __NUXT_DATA__, so anything placed on
// client.* would genuinely leak. No digit run reaches 10.
import { defineEventHandler } from 'h3'

export default defineEventHandler((event) => {
  const clientId = (event.context.params?.clientId as string | undefined) ?? 'acme-portal'
  return {
    client: {
      client_id: clientId,
      display_name: 'Acme Portal',
      type: 'confidential',
      environment: 'live',
      app_base_url: 'https://acme.example.test',
      redirect_uris: ['https://acme.example.test/auth/callback'],
      post_logout_redirect_uris: ['https://acme.example.test/auth/logout'],
      allowed_scopes: ['openid', 'profile', 'email'],
      backchannel_logout_uri: 'https://acme.example.test/auth/backchannel/logout',
      backchannel_logout_internal: false,
      owner_email: 'ops@acme.example.test',
      provisioning: 'jit',
      status: 'active',
      category: 'kepegawaian',
      has_secret_hash: true,
      activated_at: '2026-06-01T00:00:00Z',
      disabled_at: null,
      secret_rotated_at: '2026-06-01T00:00:00Z',
      secret_expires_at: '2026-12-01T00:00:00Z',
    },
  }
})
