// SSR token-leak fixture: a representative readiness response so the §3.3 gate
// renders the ops page READY. Booleans + small queue counts only — no token,
// secret, session id, or PII-shaped digit run. `external_idps` carries a CANARY
// string to PROVE parseOpsReadiness strips the config-gated IdP health map at the
// service boundary, so it never reaches the SSR HTML or __NUXT_DATA__.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  service: 'sso-backend',
  ready: true,
  checks: {
    database: true,
    redis: true,
    queue: { pending_jobs: 2, failed_jobs: 0, oldest_pending_age_seconds: 12 },
    external_idps: {
      primary: { ok: true, endpoint: 'https://OPS-EXTERNAL-IDP-CANARY.example/oidc' },
    },
  },
}))
