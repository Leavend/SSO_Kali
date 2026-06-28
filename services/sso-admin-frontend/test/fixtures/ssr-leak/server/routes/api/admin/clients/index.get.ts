// SSR token-leak fixture: a representative MASKED OAuth-client list so the §3.3
// gate can render /clients in its READY state and the payload collectors cover the
// masked AdminClientListItem DTO. The confidential client exposes only
// `has_secret_hash: true` — NEVER a secret value, NEVER a client_secret field. No
// digit run reaches 10, so collectPiiShapeLeaks stays clean. A more-specific route
// wins over the layer's catch-all server/routes/api/admin/[...].ts.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  clients: [
    {
      client_id: 'acme-portal',
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
    },
  ],
}))
