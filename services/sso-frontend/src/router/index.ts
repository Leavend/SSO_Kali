/**
 * Vue Router — route record dengan pola `{domain}.{action}` dan meta layout.
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useSessionStore } from '@/stores/session.store'

export type RouteLayout = 'auth' | 'portal' | 'admin'

declare module 'vue-router' {
  interface RouteMeta {
    layout?: RouteLayout
    requiresAuth?: boolean
    requiresGuest?: boolean
    /** Roles required to access this route (principle of least privilege). */
    requiredRoles?: readonly string[]
    title?: string
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'auth.login',
    component: () => import('@/pages/auth/LoginPage.vue'),
    meta: { layout: 'auth', requiresGuest: true, title: 'Masuk' },
  },
  {
    path: '/auth/register',
    name: 'auth.register',
    component: () => import('@/pages/auth/RegisterPage.vue'),
    meta: { layout: 'auth', requiresGuest: true, title: 'Daftar' },
  },
  {
    path: '/auth/callback',
    name: 'auth.callback',
    component: () => import('@/pages/auth/CallbackPage.vue'),
    meta: { layout: 'auth', title: 'Memverifikasi login' },
  },
  {
    path: '/auth/consent',
    name: 'auth.consent',
    component: () => import('@/pages/auth/ConsentPage.vue'),
    meta: { layout: 'auth', title: 'Otorisasi Aplikasi' },
  },
  {
    path: '/auth/mfa-challenge',
    name: 'auth.mfa-challenge',
    component: () => import('@/pages/auth/MfaChallengePage.vue'),
    meta: { layout: 'auth', title: 'Verifikasi MFA' },
  },
  {
    path: '/home',
    name: 'portal.home',
    component: () => import('@/pages/portal/HomePage.vue'),
    meta: { layout: 'portal', requiresAuth: true, title: 'Beranda' },
  },
  {
    path: '/profile',
    name: 'portal.profile',
    component: () => import('@/pages/portal/ProfilePage.vue'),
    meta: { layout: 'portal', requiresAuth: true, title: 'Profil' },
  },
  {
    path: '/apps',
    name: 'portal.apps',
    component: () => import('@/pages/portal/ConnectedAppsPage.vue'),
    meta: { layout: 'portal', requiresAuth: true, title: 'Aplikasi Terhubung' },
  },
  {
    path: '/sessions',
    name: 'portal.sessions',
    component: () => import('@/pages/portal/SessionsPage.vue'),
    meta: { layout: 'portal', requiresAuth: true, title: 'Sesi Aktif' },
  },
  {
    path: '/security',
    name: 'portal.security',
    component: () => import('@/pages/portal/SecurityPage.vue'),
    meta: { layout: 'portal', requiresAuth: true, title: 'Keamanan' },
  },
  {
    path: '/security/mfa',
    name: 'portal.mfa-settings',
    component: () => import('@/pages/portal/MfaSettingsPage.vue'),
    meta: { layout: 'portal', requiresAuth: true, title: 'Pengaturan MFA' },
  },
  {
    path: '/admin/clients',
    name: 'admin.clients',
    component: () => import('@/pages/admin/ClientManagementPage.vue'),
    meta: {
      layout: 'admin',
      requiresAuth: true,
      requiredRoles: ['admin'],
      title: 'Admin Client Management',
    },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'error.not-found',
    component: () => import('@/pages/errors/NotFoundPage.vue'),
    meta: { layout: 'auth', title: 'Tidak ditemukan' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL ?? '/'),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const session = useSessionStore()

  if (to.meta.requiresAuth) {
    // Session hydration runs once per page load; subsequent calls are cached.
    // The session API is preloaded via <link rel="preload" as="fetch"> in
    // index.html so by the time this guard runs, the response is usually
    // already in browser cache — render delay is minimized without an
    // optimistic-render security trade-off.
    const ok = session.isAuthenticated || (await session.ensureSession())
    if (!ok) {
      return { name: 'auth.login', query: { redirect: to.fullPath } }
    }
  }

  // Role-based access control (FR-003 — principle of least privilege).
  if (to.meta.requiredRoles && to.meta.requiredRoles.length > 0) {
    const userRoles = session.roles
    const hasRole = to.meta.requiredRoles.some((role) => userRoles.includes(role))
    if (!hasRole) {
      return { name: 'portal.home' }
    }
  }

  if (to.meta.requiresGuest) {
    // FR-027 / UC-14: If RP sends prompt=login, force re-authentication.
    const promptParam = to.query.prompt as string | undefined
    if (promptParam === 'login') {
      return true
    }

    // Hard reload / reopened tab loses Pinia memory, but the persistent
    // HttpOnly SSO cookie can still be valid. Hydrate once on guest routes so
    // returning users are silently restored instead of seeing the login form.
    const ok = session.isAuthenticated || (await session.ensureSession())
    if (ok) {
      return { name: 'portal.home' }
    }
  }

  return true
})

router.afterEach((to) => {
  const base = import.meta.env.VITE_APP_NAME ?? 'Dev-SSO'
  document.title = to.meta.title ? `${String(to.meta.title)} · ${base}` : base
})

export default router
