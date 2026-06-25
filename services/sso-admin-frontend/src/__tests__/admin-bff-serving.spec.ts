import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8')
const adminReadme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8')
const backendReadme = readFileSync(resolve(process.cwd(), '../sso-backend/README.md'), 'utf8')
const compose = readFileSync(resolve(process.cwd(), '../../docker-compose.main.yml'), 'utf8')
const deployWorkflow = readFileSync(
  resolve(process.cwd(), '../../.github/workflows/deploy-main.yml'),
  'utf8',
)
const productionSmokeE2e = readFileSync(
  resolve(process.cwd(), 'e2e/production-smoke.spec.ts'),
  'utf8',
)
const serverSource = readFileSync(resolve(process.cwd(), 'src/server/index.ts'), 'utf8')
const proxySource = readFileSync(resolve(process.cwd(), 'src/server/admin-proxy.ts'), 'utf8')

describe('admin BFF serving contract', () => {
  it('runs the admin frontend as a Node token-broker instead of static nginx', () => {
    expect(dockerfile).toContain('FROM node:22-alpine AS runner')
    expect(dockerfile).toContain('CMD ["node", "dist/server/server/index.js"]')
    expect(dockerfile).not.toContain('nginxinc/nginx-unprivileged')
    expect(serverSource).toContain("pathname.startsWith('/api/admin/')")
    expect(serverSource).toContain('handleAdminApiProxy')
  })

  it('injects Authorization in the BFF and keeps browser token handling out of the SPA', () => {
    expect(proxySource).toContain("forwarded.set('Authorization', `Bearer ${accessToken}`)")
    expect(proxySource).toContain(
      "const ALLOWED_REQUEST_HEADERS = new Set(['accept', 'content-type', 'x-request-id'])",
    )
  })

  it('wires production runtime env for admin OIDC and server-side sessions', () => {
    expect(compose).toContain('x-sso-admin-frontend-env: &sso-admin-frontend-env')
    expect(compose).toContain('ADMIN_OIDC_CLIENT_ID: ${ADMIN_PANEL_CLIENT_ID:-sso-admin-panel}')
    expect(compose).toContain(
      'ADMIN_OIDC_CLIENT_SECRET: ${ADMIN_PANEL_CLIENT_SECRET:?ADMIN_PANEL_CLIENT_SECRET is required}',
    )
    expect(compose).not.toContain('VITE_ADMIN_OIDC_CLIENT_SECRET')
    expect(compose).toContain(
      'ADMIN_OIDC_PUBLIC_ISSUER: ${SSO_FRONTEND_URL:-https://sso.timeh.my.id}',
    )
    expect(compose).toContain(
      'ADMIN_OIDC_SCOPE: ${ADMIN_OIDC_SCOPE:-openid profile email offline_access roles permissions}',
    )
    expect(compose).toContain(
      'SSO_ADMIN_SESSION_REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/5',
    )
    expect(compose).toContain(
      'ADMIN_PANEL_REDIRECT_URI: ${SSO_ADMIN_FRONTEND_URL:-https://admin-sso.timeh.my.id}/auth/callback',
    )
  })

  it('keeps anonymous production smoke strict enough to detect JSON BFF responses', () => {
    expect(deployWorkflow).toContain('admin_url="https://${admin_authority%/}"')
    expect(deployWorkflow).toContain('[ "$health_status" = "200" ] && break')
    expect(deployWorkflow).toContain('[ "$http_health_status" != "200" ]')
    expect(deployWorkflow).not.toContain(
      'curl -fsS --max-time 20 "${admin_url%/}/healthz" >/dev/null',
    )
    expect(deployWorkflow).toContain('/api/admin/me')
    expect(deployWorkflow).toContain('expected anonymous /api/admin/me to return 401 JSON')
    expect(deployWorkflow).toContain('^content-type: application/json')
    expect(deployWorkflow).toContain('<!doctype html\\|<html')
    expect(deployWorkflow).toContain('"error"[[:space:]]*:[[:space:]]*"no_session"')
  })

  it('keeps the admin HTML shell bfcache-friendly while API responses remain private', () => {
    expect(serverSource).toContain('public, max-age=31536000, immutable')
    expect(serverSource).toContain("'private, no-cache'")
    expect(serverSource).toContain('requestHasMatchingEtag')
    expect(serverSource).toContain('no-store, no-cache, private, max-age=0')
    expect(deployWorkflow).toContain('expected / to be served by admin SPA fallback')
    expect(deployWorkflow).toContain('expected / cache-control private, no-cache')
    expect(deployWorkflow).toContain('expected / etag for shell revalidation')
    expect(deployWorkflow).toContain(
      'expected / not to redirect to upstream edge auth or stale browser-cache target',
    )
  })

  it('locks redirect diagnostic coverage for legacy home and authenticated dashboard access', () => {
    expect(deployWorkflow).toContain('/home')
    expect(deployWorkflow).toContain('expected /home to be served by admin SPA fallback')
    expect(deployWorkflow).toContain('expected /home body to be the admin SPA index shell')
    expect(deployWorkflow).toContain('expected /home not to redirect to upstream edge auth')
    expect(deployWorkflow).toContain('://sso\\.timeh\\.my\\.id/authorize')
    expect(deployWorkflow).toContain(
      'expected /auth/login Location to use the front-door SSO /authorize host',
    )
    expect(productionSmokeE2e).toContain(
      'stubbed OIDC admin session reaches dashboard with principal evidence',
    )
    expect(productionSmokeE2e).toContain('legacy /home path is handled by the admin SPA catch-all')
  })

  it('documents that admin API auth is bearer-only through the BFF, not shared portal cookies', () => {
    expect(adminReadme).toContain('bearer-only')
    expect(adminReadme).toContain('AdminGuard')
    expect(adminReadme).toContain('Domain=.timeh.my.id')
    expect(adminReadme).toContain('__Host-sso-admin-session')
    expect(backendReadme).toContain('/admin/api/*')
    expect(backendReadme).toContain('Authorization: Bearer <access_token>')
    expect(backendReadme).toContain('__Host-sso_session')
    expect(backendReadme).toContain('still would not satisfy `AdminGuard`')
  })
})
