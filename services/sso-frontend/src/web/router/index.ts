import { createRouter, createWebHistory } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import LoginView from '@/views/LoginView.vue'
import ConsentView from '@/views/ConsentView.vue'
import DashboardView from '@/views/DashboardView.vue'
import UsersView from '@/views/UsersView.vue'
import UserDetailView from '@/views/UserDetailView.vue'
import SessionsView from '@/views/SessionsView.vue'
import AppsView from '@/views/AppsView.vue'
import LegalView from '@/views/LegalView.vue'
import StatusView from '@/views/StatusView.vue'
import NotFoundView from '@/views/NotFoundView.vue'
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
