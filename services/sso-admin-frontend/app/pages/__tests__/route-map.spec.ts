import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// process.cwd() is the service root (services/sso-admin-frontend) when tests
// run via `npm run test` — reliable in jsdom where import.meta.url is not file://
const pagesDir = resolve(process.cwd(), 'app', 'pages') + '/'
const read = (rel: string): string => readFileSync(`${pagesDir}${rel}`, 'utf8')

const domainPages: ReadonlyArray<{ file: string; name: string; permissions: readonly string[] }> = [
  { file: 'dashboard.vue', name: 'admin.dashboard', permissions: ['admin.dashboard.view'] },
  {
    file: 'oidc-foundation.vue',
    name: 'admin.oidc-foundation',
    permissions: ['admin.dashboard.view'],
  },
  { file: 'clients/index.vue', name: 'admin.clients', permissions: ['admin.clients.read'] },
  { file: 'clients/new.vue', name: 'admin.clients.create', permissions: ['admin.clients.write'] },
  { file: 'users/index.vue', name: 'admin.users', permissions: ['admin.users.read'] },
  { file: 'users/new.vue', name: 'admin.users.create', permissions: ['admin.users.write'] },
  {
    file: 'users/[subjectId].vue',
    name: 'admin.users.detail',
    permissions: ['admin.users.read'],
  },
  {
    file: 'observability/index.vue',
    name: 'admin.observability',
    permissions: ['admin.observability.read'],
  },
  {
    file: 'observability/compliance.vue',
    name: 'admin.observability.compliance',
    permissions: ['admin.observability.read'],
  },
  { file: 'sessions.vue', name: 'admin.sessions', permissions: ['admin.sessions.terminate'] },
  { file: 'policy.vue', name: 'admin.policy', permissions: ['admin.security-policy.read'] },
  {
    file: 'sso-error-templates.vue',
    name: 'admin.sso-error-templates',
    permissions: ['admin.security-policy.read'],
  },
  {
    file: 'external-idps.vue',
    name: 'admin.external-idps',
    permissions: ['admin.external-idps.read'],
  },
  { file: 'ip-access.vue', name: 'admin.ip-access', permissions: ['admin.ip-access.read'] },
  { file: 'ops.vue', name: 'admin.ops', permissions: ['admin.dashboard.view'] },
  { file: 'roles.vue', name: 'admin.roles', permissions: ['admin.roles.read'] },
  {
    file: 'authentication-audit.vue',
    name: 'admin.authentication-audit',
    permissions: ['admin.authentication-audit.read'],
  },
  { file: 'profile.vue', name: 'admin.profile', permissions: ['profile.read'] },
]

const redirectTargets: ReadonlyArray<{ file: string; name: string }> = [
  { file: 'forbidden.vue', name: 'admin.forbidden' },
  { file: 'mfa-required.vue', name: 'admin.mfa-required' },
  { file: 'step-up-required.vue', name: 'admin.step-up-required' },
  { file: 'admin-error.vue', name: 'admin.error' },
  { file: 'admin-api-unreachable.vue', name: 'admin.api-unreachable' },
]

describe('admin route map', () => {
  it.each(domainPages)(
    'guards $name with admin role and its permissions',
    ({ file, name, permissions }) => {
      expect(existsSync(`${pagesDir}${file}`)).toBe(true)
      const src = read(file)
      expect(src).toContain('definePageMeta(')
      expect(src).toContain(`name: '${name}'`)
      expect(src).toContain('requiresAdmin: true')
      expect(src).toContain(`layout: 'admin'`)
      for (const permission of permissions) expect(src).toContain(`'${permission}'`)
    },
  )

  it.each(redirectTargets)(
    'exposes redirect target $name without admin gating',
    ({ file, name }) => {
      expect(existsSync(`${pagesDir}${file}`)).toBe(true)
      const src = read(file)
      expect(src).toContain(`name: '${name}'`)
      expect(src).toContain('layout: false')
      expect(src).not.toContain('requiresAdmin: true')
    },
  )

  it('redirects /, /audit and /audit/compliance to their canonical routes', () => {
    expect(read('index.vue')).toContain(`navigateTo('/dashboard'`)
    expect(read('audit/index.vue')).toContain(`name: 'admin.observability'`)
    expect(read('audit/compliance.vue')).toContain(`name: 'admin.observability.compliance'`)
  })
})
