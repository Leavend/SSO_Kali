import { createRouter, createWebHistory } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { useSessionStore } from '@/stores/session'
import LoginView from '@/views/LoginView.vue'
import ConsentView from '@/views/ConsentView.vue'
import HomeView from '@/views/HomeView.vue'
import ProfileView from '@/views/ProfileView.vue'
import MySessionsView from '@/views/MySessionsView.vue'
import ConnectedAppsView from '@/views/ConnectedAppsView.vue'
import SecurityView from '@/views/SecurityView.vue'
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
    { path: '/home', name: 'home', component: HomeView, meta: { requiresUserAuth: true } },
    { path: '/profile', name: 'profile', component: ProfileView, meta: { requiresUserAuth: true } },
    { path: '/sessions', name: 'my-sessions', component: MySessionsView, meta: { requiresUserAuth: true } },
    { path: '/apps', name: 'connected-apps', component: ConnectedAppsView, meta: { requiresUserAuth: true } },
    { path: '/security', name: 'security', component: SecurityView, meta: { requiresUserAuth: true } },
    { path: '/dashboard', name: 'dashboard', component: DashboardView, meta: { requiresAdminAuth: true } },
    { path: '/admin', redirect: '/dashboard' },
    { path: '/users', name: 'users', component: UsersView, meta: { requiresAdminAuth: true } },
    { path: '/users/:id', name: 'user-detail', component: UserDetailView, meta: { requiresAdminAuth: true } },
    { path: '/admin/sessions', name: 'admin-sessions', component: SessionsView, meta: { requiresAdminAuth: true } },
    { path: '/admin/apps', name: 'admin-apps', component: AppsView, meta: { requiresAdminAuth: true } },
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
  if (to.meta.requiresUserAuth) {
    const session = useSessionStore()
    const ok = await session.ensureSession()
    return ok ? true : '/'
  }

  if (to.meta.requiresAdminAuth) {
    const admin = useAdminStore()
    const ok = await admin.ensureSession()
    return ok ? true : (admin.redirectTo ?? '/')
  }

  return true
})
