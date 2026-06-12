/**
 * Vue Router — route record dengan pola `{domain}.{action}` dan meta layout.
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { resolveAuthGuard } from './guards'
import { useI18n } from '@/composables/useI18n'

export type RouteLayout = 'auth' | 'portal'
export type AuroraPreset = 'default' | 'cool' | 'error'
export type AuthBackgroundVariant = 'photo' | 'aurora'

/**
 * Optional per-route hero hint consumed by AuthLayout (Aurora redesign).
 * Only visual presets — pages own their own multi-step headlines because
 * those headlines need to change per active step.
 */
export interface AuthHero {
  /** Aurora colour preset (rotates the SVG cluster). */
  aurora?: AuroraPreset
  /**
   * Backdrop variant. Default `photo` (Balaikota Bontang civic shot);
   * pages can opt into the procedural `aurora` SVG (e.g. for routes
   * where the photo would distract from a heavy form like consent).
   */
  background?: AuthBackgroundVariant
  /**
   * Constrain main width. 'sm' (default) suits forms; 'lg' suits consent
   * and content-heavy pages with scope cards.
   */
  maxWidth?: 'sm' | 'lg' | 'xl'
}

declare module 'vue-router' {
  interface RouteMeta {
    layout?: RouteLayout
    requiresAuth?: boolean
    requiresGuest?: boolean
    title?: string
    hero?: AuthHero
  }
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'auth.login',
    component: () => import('@/pages/auth/LoginPage.vue'),
    meta: {
      layout: 'auth',
      requiresGuest: true,
      title: 'Masuk',
      hero: { aurora: 'default' },
    },
  },
  {
    path: '/login',
    redirect: (to) => ({ name: 'auth.login', query: to.query }),
  },
  {
    path: '/auth/register',
    name: 'auth.register',
    component: () => import('@/pages/auth/RegisterPage.vue'),
    meta: {
      layout: 'auth',
      requiresGuest: true,
      title: 'Daftar',
      hero: { aurora: 'default' },
    },
  },
  {
    path: '/auth/callback',
    name: 'auth.callback',
    component: () => import('@/pages/auth/CallbackPage.vue'),
    meta: {
      layout: 'auth',
      title: 'Memverifikasi login',
      hero: { aurora: 'cool' },
    },
  },
  {
    path: '/auth/consent',
    name: 'auth.consent',
    component: () => import('@/pages/auth/ConsentPage.vue'),
    meta: {
      layout: 'auth',
      title: 'Otorisasi Aplikasi',
      hero: { aurora: 'cool', maxWidth: 'lg' },
    },
  },
  {
    path: '/auth/mfa-challenge',
    name: 'auth.mfa-challenge',
    component: () => import('@/pages/auth/MfaChallengePage.vue'),
    meta: {
      layout: 'auth',
      title: 'Verifikasi MFA',
      hero: { aurora: 'cool' },
    },
  },
  {
    path: '/auth/forgot-password',
    name: 'auth.forgot-password',
    component: () => import('@/pages/auth/ForgotPasswordPage.vue'),
    meta: {
      layout: 'auth',
      requiresGuest: true,
      title: 'Reset Password',
      hero: { aurora: 'default' },
    },
  },
  {
    path: '/auth/reset-password',
    name: 'auth.reset-password',
    component: () => import('@/pages/auth/ResetPasswordPage.vue'),
    meta: {
      layout: 'auth',
      requiresGuest: true,
      title: 'Password Baru',
      hero: { aurora: 'default' },
    },
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
    path: '/profile/security',
    redirect: { name: 'portal.security' },
  },
  {
    path: '/privacy',
    name: 'portal.privacy',
    component: () => import('@/pages/portal/PrivacyPage.vue'),
    meta: { layout: 'portal', requiresAuth: true, title: 'Privasi & Data' },
  },
  {
    path: '/security/mfa',
    name: 'portal.mfa-settings',
    component: () => import('@/pages/portal/MfaSettingsPage.vue'),
    meta: { layout: 'portal', requiresAuth: true, title: 'Pengaturan MFA' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'error.not-found',
    component: () => import('@/pages/errors/NotFoundPage.vue'),
    meta: {
      layout: 'auth',
      title: 'Tidak ditemukan',
      hero: { aurora: 'error' },
    },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL ?? '/'),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(resolveAuthGuard)

const routeTitleKeys: Record<string, string> = {
  'auth.login': 'routes.login',
  'auth.register': 'routes.register',
  'auth.callback': 'routes.callback',
  'auth.consent': 'routes.consent',
  'auth.mfa-challenge': 'routes.mfa_challenge',
  'auth.forgot-password': 'routes.forgot_password',
  'auth.reset-password': 'routes.reset_password',
  'portal.home': 'routes.home',
  'portal.profile': 'routes.profile',
  'portal.apps': 'routes.apps',
  'portal.sessions': 'routes.sessions',
  'portal.security': 'routes.security',
  'portal.privacy': 'routes.privacy',
  'portal.mfa-settings': 'routes.mfa_settings',
  'error.not-found': 'routes.not_found',
}

export function updateDocumentTitle(routeName: string | null | undefined, defaultTitle?: string): void {
  const base = import.meta.env.VITE_APP_NAME ?? 'Dev-SSO'
  const { t } = useI18n()
  const key = routeName ? routeTitleKeys[routeName] : null
  const title = key ? t(key) : (defaultTitle ?? '')
  document.title = title ? `${title} · ${base}` : base
}

router.afterEach((to) => {
  updateDocumentTitle(to.name as string | null | undefined, to.meta.title)
})

export default router
