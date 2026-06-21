import { describe, expect, it } from 'vitest'
import router from '@/router'

const MENU_ID_TO_ROUTE_NAME: Record<string, string> = {
  dashboard: 'admin.dashboard',
  users: 'admin.users',
  roles: 'admin.roles',
  clients: 'admin.clients',
  'external-idps': 'admin.external-idps',
  sessions: 'admin.sessions',
  audit: 'admin.audit',
  'authentication-audit': 'admin.authentication-audit',
  profile: 'admin.profile',
  'ip-access': 'admin.ip-access',
}

describe('Admin menu-route contract (ISS-M1 regression guard)', () => {
  const registeredRouteNames = new Set(
    router.getRoutes().map((route) => route.name?.toString() ?? ''),
  )

  for (const [menuId, expectedRouteName] of Object.entries(MENU_ID_TO_ROUTE_NAME)) {
    it(`menu "${menuId}" has a registered route "${expectedRouteName}"`, () => {
      expect(registeredRouteNames.has(expectedRouteName)).toBe(true)
    })
  }

  it('every registered admin child route has requiresAdmin meta', () => {
    const adminChildRoutes = router
      .getRoutes()
      .filter(
        (r) =>
          typeof r.name === 'string' &&
          r.name.startsWith('admin.') &&
          ![
            'admin.forbidden',
            'admin.mfa-required',
            'admin.step-up-required',
            'admin.error',
            'admin.api-unreachable',
          ].includes(r.name),
      )

    for (const route of adminChildRoutes) {
      const hasRequiresAdmin = route.meta.requiresAdmin === true
      expect(hasRequiresAdmin).toBe(true)
    }
  })

  it('roles route has correct permission meta', () => {
    const rolesRoute = router.getRoutes().find((r) => r.name === 'admin.roles')
    expect(rolesRoute?.meta.permissions).toContain('admin.roles.read')
  })

  it('authentication-audit route has correct permission meta', () => {
    const authAuditRoute = router.getRoutes().find((r) => r.name === 'admin.authentication-audit')
    expect(authAuditRoute?.meta.permissions).toContain('admin.authentication-audit.read')
  })

  it('audit route is the observability cockpit and compliance audit keeps its own route', () => {
    const auditRoute = router.getRoutes().find((r) => r.name === 'admin.audit')
    const complianceRoute = router.getRoutes().find((r) => r.name === 'admin.audit.compliance')

    expect(auditRoute?.meta.permissions).toContain('admin.observability.read')
    expect(complianceRoute?.meta.permissions).toContain('admin.audit.read')
  })

  it('profile route has correct permission meta', () => {
    const profileRoute = router.getRoutes().find((r) => r.name === 'admin.profile')
    expect(profileRoute?.meta.permissions).toContain('profile.read')
  })
})
