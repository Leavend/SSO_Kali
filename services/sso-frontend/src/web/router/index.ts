import { createRouter, createWebHistory } from 'vue-router'
import { useAdminStore } from '@/web/stores/admin'
import LoginView from '@/web/views/LoginView.vue'
import {
  ACCESS_DENIED_ROUTE,
  GENERIC_ERROR_ROUTE,
  HANDSHAKE_FAILED_ROUTE,
  INVALID_CREDENTIALS_ROUTE,
  MFA_REQUIRED_ROUTE,
  REAUTH_REQUIRED_ROUTE,
  SESSION_EXPIRED_ROUTE,
  TOO_MANY_ATTEMPTS_ROUTE,
} from '@shared/auth-status'

// Lazy-loaded views — code-split into separate chunks for faster initial load
const ConsentView = () => import('@/web/views/ConsentView.vue')
const DashboardView = () => import('@/web/views/DashboardView.vue')
const UsersView = () => import('@/web/views/UsersView.vue')
const UserDetailView = () => import('@/web/views/UserDetailView.vue')
const SessionsView = () => import('@/web/views/SessionsView.vue')
const AppsView = () => import('@/web/views/AppsView.vue')
const LegalView = () => import('@/web/views/LegalView.vue')
const StatusView = () => import('@/web/views/StatusView.vue')
const NotFoundView = () => import('@/web/views/NotFoundView.vue')

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'login', component: LoginView },
    { path: '/auth/consent', name: 'consent', component: ConsentView },
    { path: '/dashboard', name: 'dashboard', component: DashboardView, meta: { requiresAuth: true } },
    { path: '/users', name: 'users', component: UsersView, meta: { requiresAuth: true } },
    { path: '/users/:id', name: 'user-detail', component: UserDetailView, meta: { requiresAuth: true } },
    { path: '/sessions', name: 'sessions', component: SessionsView, meta: { requiresAuth: true } },
    { path: '/apps', name: 'apps', component: AppsView, meta: { requiresAuth: true } },
    { path: '/terms', name: 'terms', component: LegalView },
    { path: '/privacy', name: 'privacy', component: LegalView },
    { path: '/docs', name: 'docs', component: LegalView },
    ...[
      ACCESS_DENIED_ROUTE,
      HANDSHAKE_FAILED_ROUTE,
      INVALID_CREDENTIALS_ROUTE,
      MFA_REQUIRED_ROUTE,
      REAUTH_REQUIRED_ROUTE,
      TOO_MANY_ATTEMPTS_ROUTE,
      SESSION_EXPIRED_ROUTE,
      GENERIC_ERROR_ROUTE,
    ].map((path) => ({ path, component: StatusView })),
    { path: '/:pathMatch(.*)*', component: NotFoundView },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  const admin = useAdminStore()
  const ok = await admin.ensureSession()

  if (!ok) {
    return admin.redirectTo ? admin.redirectTo : '/'
  }

  return true
})
