import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8')
const compose = readFileSync(resolve(process.cwd(), '../../docker-compose.main.yml'), 'utf8')
const deployWorkflow = readFileSync(
  resolve(process.cwd(), '../../.github/workflows/deploy-main.yml'),
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
    expect(proxySource).toContain("const ALLOWED_REQUEST_HEADERS = new Set(['accept', 'content-type', 'x-request-id'])")
  })

  it('wires production runtime env for admin OIDC and server-side sessions', () => {
    expect(compose).toContain('x-sso-admin-frontend-env: &sso-admin-frontend-env')
    expect(compose).toContain('ADMIN_OIDC_CLIENT_ID: ${ADMIN_PANEL_CLIENT_ID:-sso-admin-panel}')
    expect(compose).toContain('ADMIN_OIDC_SCOPE: ${ADMIN_OIDC_SCOPE:-openid profile email offline_access roles permissions}')
    expect(compose).toContain('SSO_ADMIN_SESSION_REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/5')
    expect(compose).toContain('ADMIN_PANEL_REDIRECT_URI: ${SSO_ADMIN_FRONTEND_URL:-https://admin-sso.timeh.my.id}/auth/callback')
  })

  it('keeps anonymous production smoke strict enough to detect JSON BFF responses', () => {
    expect(deployWorkflow).toContain('/api/admin/me')
    expect(deployWorkflow).toContain('expected anonymous /api/admin/me to return 401 JSON')
    expect(deployWorkflow).toContain('^content-type: application/json')
    expect(deployWorkflow).toContain('<!doctype html\\|<html')
    expect(deployWorkflow).toContain('"error"[[:space:]]*:[[:space:]]*"no_session"')
  })
})
