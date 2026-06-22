import { createRouter, createWebHistory } from 'vue-router'
import { resolveAdminGuard } from './guards'
import AdminApiUnreachableView from '@/views/AdminApiUnreachableView.vue'
import ForbiddenView from '@/views/ForbiddenView.vue'
import AdminErrorView from '@/views/AdminErrorView.vue'
import AdminMfaRequiredView from '@/views/AdminMfaRequiredView.vue'
import AdminShellLayout from '@/layouts/AdminShellLayout.vue'

const dashboardPage = () => import('@/features/dashboard/pages/DashboardPage.vue')
const oidcFoundationPage = () => import('@/features/oidc-foundation/pages/OidcFoundationPage.vue')
const clientsPage = () => import('@/features/clients/pages/ClientsPage.vue')
const clientCreatePage = () => import('@/features/clients/pages/ClientCreatePage.vue')
const usersPage = () => import('@/features/users/pages/UsersPage.vue')
const userCreatePage = () => import('@/features/users/pages/UserCreatePage.vue')
const auditPage = () => import('@/features/observability/pages/AuditObservabilityPage.vue')
const auditCompliancePage = () => import('@/features/audit/pages/AuditPage.vue')
const sessionsPage = () => import('@/features/sessions/pages/SessionsPage.vue')
const policyPage = () => import('@/features/policy/pages/PolicyPage.vue')
const ssoErrorTemplatesPage = () =>
  import('@/features/sso-error-templates/pages/SsoErrorTemplatesPage.vue')
const externalIdpsPage = () => import('@/features/external-idps/pages/ExternalIdpsPage.vue')
const ipAccessPage = () => import('@/features/ip-access/pages/IpAccessPage.vue')
const opsPage = () => import('@/features/ops/pages/OpsPage.vue')
const rolesPage = () => import('@/features/roles/pages/RolesPage.vue')
const authenticationAuditPage = () =>
  import('@/features/authentication-audit/pages/AuthenticationAuditPage.vue')
const adminProfilePage = () => import('@/features/profile/pages/AdminProfilePage.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/',
      component: AdminShellLayout,
      children: [
        {
          path: 'dashboard',
          name: 'admin.dashboard',
          component: dashboardPage,
          meta: { requiresAdmin: true, permissions: ['admin.dashboard.view'] },
        },
        {
          path: 'oidc-foundation',
          name: 'admin.oidc-foundation',
          component: oidcFoundationPage,
          meta: { requiresAdmin: true, permissions: ['admin.dashboard.view'] },
        },
        {
          path: 'clients',
          name: 'admin.clients',
          component: clientsPage,
          meta: { requiresAdmin: true, permissions: ['admin.clients.read'] },
        },
        {
          path: 'clients/new',
          name: 'admin.clients.create',
          component: clientCreatePage,
          meta: { requiresAdmin: true, permissions: ['admin.clients.write'] },
        },
        {
          path: 'users',
          name: 'admin.users',
          component: usersPage,
          meta: { requiresAdmin: true, permissions: ['admin.users.read'] },
        },
        {
          path: 'users/new',
          name: 'admin.users.create',
          component: userCreatePage,
          meta: { requiresAdmin: true, permissions: ['admin.users.write'] },
        },
        {
          path: 'observability',
          name: 'admin.observability',
          component: auditPage,
          meta: { requiresAdmin: true, permissions: ['admin.observability.read'] },
        },
        {
          path: 'observability/compliance',
          name: 'admin.observability.compliance',
          component: auditCompliancePage,
          meta: { requiresAdmin: true, permissions: ['admin.observability.read'] },
        },
        {
          path: 'audit',
          redirect: { name: 'admin.observability' },
        },
        {
          path: 'audit/compliance',
          redirect: { name: 'admin.observability.compliance' },
        },
        {
          path: 'sessions',
          name: 'admin.sessions',
          component: sessionsPage,
          meta: { requiresAdmin: true, permissions: ['admin.sessions.terminate'] },
        },
        {
          path: 'policy',
          name: 'admin.policy',
          component: policyPage,
          meta: { requiresAdmin: true, permissions: ['admin.security-policy.read'] },
        },
        {
          path: 'sso-error-templates',
          name: 'admin.sso-error-templates',
          component: ssoErrorTemplatesPage,
          meta: { requiresAdmin: true, permissions: ['admin.security-policy.read'] },
        },
        {
          path: 'external-idps',
          name: 'admin.external-idps',
          component: externalIdpsPage,
          meta: { requiresAdmin: true, permissions: ['admin.external-idps.read'] },
        },
        {
          path: 'ip-access',
          name: 'admin.ip-access',
          component: ipAccessPage,
          meta: { requiresAdmin: true, permissions: ['admin.ip-access.read'] },
        },
        {
          path: 'ops',
          name: 'admin.ops',
          component: opsPage,
          meta: { requiresAdmin: true, permissions: ['admin.dashboard.view'] },
        },
        {
          path: 'roles',
          name: 'admin.roles',
          component: rolesPage,
          meta: { requiresAdmin: true, permissions: ['admin.roles.read'] },
        },
        {
          path: 'authentication-audit',
          name: 'admin.authentication-audit',
          component: authenticationAuditPage,
          meta: { requiresAdmin: true, permissions: ['admin.authentication-audit.read'] },
        },
        {
          path: 'profile',
          name: 'admin.profile',
          component: adminProfilePage,
          meta: { requiresAdmin: true, permissions: ['profile.read'] },
        },
      ],
    },
    {
      path: '/forbidden',
      name: 'admin.forbidden',
      component: ForbiddenView,
    },
    {
      path: '/mfa-required',
      name: 'admin.mfa-required',
      component: AdminMfaRequiredView,
      props: { mode: 'enrollment' },
    },
    {
      path: '/step-up-required',
      name: 'admin.step-up-required',
      component: AdminMfaRequiredView,
      props: { mode: 'step_up' },
    },
    {
      path: '/admin-error',
      name: 'admin.error',
      component: AdminErrorView,
    },
    {
      path: '/admin-api-unreachable',
      name: 'admin.api-unreachable',
      component: AdminApiUnreachableView,
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/dashboard',
    },
  ],
})

router.beforeEach(resolveAdminGuard)

export function preloadInitialAdminRoute(pathname: string): Promise<unknown> | null {
  const resolved = router.resolve(pathname === '/' ? '/dashboard' : pathname)
  const leafRoute = resolved.matched[resolved.matched.length - 1]
  const component: unknown = leafRoute?.components?.default

  if (!isLazyRouteComponent(component)) return null

  const preload = component()
  return isPromiseLike(preload) ? preload : null
}

type LazyRouteComponent = () => unknown

function isLazyRouteComponent(component: unknown): component is LazyRouteComponent {
  return typeof component === 'function'
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value
}

export default router
