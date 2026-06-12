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
    titleKey?: string
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
      titleKey: 'routes.login',
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
      titleKey: 'routes.register',
      hero: { aurora: 'default' },
    },
  },
  {
    path: '/auth/callback',
    name: 'auth.callback',
    component: () => import('@/pages/auth/CallbackPage.vue'),
    meta: {
      layout: 'auth',
      titleKey: 'routes.callback',
      hero: { aurora: 'cool' },
    },
  },
  {
    path: '/auth/consent',
    name: 'auth.consent',
    component: () => import('@/pages/auth/ConsentPage.vue'),
    meta: {
      layout: 'auth',
      titleKey: 'routes.consent',
      hero: { aurora: 'cool', maxWidth: 'lg' },
    },
  },
  {
    path: '/auth/mfa-challenge',
    name: 'auth.mfa-challenge',
    component: () => import('@/pages/auth/MfaChallengePage.vue'),
    meta: {
      layout: 'auth',
      titleKey: 'routes.mfa_challenge',
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
      titleKey: 'routes.forgot_password',
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
      titleKey: 'routes.reset_password',
      hero: { aurora: 'default' },
    },
  },
  {
    path: '/home',
    name: 'portal.home',
    component: () => import('@/pages/portal/HomePage.vue'),
    meta: { layout: 'portal', requiresAuth: true, titleKey: 'routes.home' },
  },
  {
    path: '/profile',
    name: 'portal.profile',
    component: () => import('@/pages/portal/ProfilePage.vue'),
    meta: { layout: 'portal', requiresAuth: true, titleKey: 'routes.profile' },
  },
  {
    path: '/apps',
    name: 'portal.apps',
    component: () => import('@/pages/portal/ConnectedAppsPage.vue'),
    meta: { layout: 'portal', requiresAuth: true, titleKey: 'routes.apps' },
  },
  {
    path: '/sessions',
    name: 'portal.sessions',
    component: () => import('@/pages/portal/SessionsPage.vue'),
    meta: { layout: 'portal', requiresAuth: true, titleKey: 'routes.sessions' },
  },
  {
    path: '/security',
    name: 'portal.security',
    component: () => import('@/pages/portal/SecurityPage.vue'),
    meta: { layout: 'portal', requiresAuth: true, titleKey: 'routes.security' },
  },
  {
    path: '/profile/security',
    redirect: { name: 'portal.security' },
  },
  {
    path: '/privacy',
    name: 'portal.privacy',
    component: () => import('@/pages/portal/PrivacyPage.vue'),
    meta: { layout: 'portal', requiresAuth: true, titleKey: 'routes.privacy' },
  },
  {
    path: '/security/mfa',
    name: 'portal.mfa-settings',
    component: () => import('@/pages/portal/MfaSettingsPage.vue'),
    meta: { layout: 'portal', requiresAuth: true, titleKey: 'routes.mfa_settings' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'error.not-found',
    component: () => import('@/pages/errors/NotFoundPage.vue'),
    meta: {
      layout: 'auth',
      titleKey: 'routes.not_found',
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

export function updateDocumentTitle(titleKey?: string): void {
  const base = import.meta.env.VITE_APP_NAME ?? 'Dev-SSO'
  const { t } = useI18n()
  const title = titleKey ? t(titleKey) : ''
  document.title = title ? `${title} · ${base}` : base
}

router.afterEach((to) => {
  updateDocumentTitle(to.meta.titleKey)
})

export default router
