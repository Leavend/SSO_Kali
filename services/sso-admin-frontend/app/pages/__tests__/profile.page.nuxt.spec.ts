// app/pages/__tests__/profile.page.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { AdminPrincipal } from '@/types/auth.types'

function principal(): AdminPrincipal {
  return {
    subject_id: 'sub-admin-sentinel',
    email: 'admin@example.test',
    display_name: 'Admin Sentinel',
    given_name: null,
    family_name: null,
    role: 'admin',
    last_login_at: '2026-06-28T09:00:00Z',
    auth_context: { auth_time: null, amr: ['pwd'], acr: null, mfa_enforced: true, mfa_verified: true },
    permissions: {
      view_admin_panel: true,
      manage_sessions: true,
      permissions: ['admin.dashboard.view', 'profile.read'],
      capabilities: {},
      menus: [],
    },
  }
}

const principalRef = ref<AdminPrincipal | null>(principal())
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    get principal() {
      return principalRef.value
    },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission: () => true,
    get roles() {
      return [] as readonly string[]
    },
  }),
}))
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      let val: unknown = enLocale
      for (const part of key.split('.')) val = (val as Record<string, unknown>)?.[part]
      if (typeof val !== 'string') return key
      return params
        ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
        : val
    },
  }),
}))
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
const Page = (await import('../profile.vue')).default

beforeEach(() => {
  principalRef.value = principal()
})
afterEach(() => vi.clearAllMocks())

describe('profile page', () => {
  it('renders identity + security cards through the admin shell', async () => {
    const w = await mountSuspended(Page)
    expect(w.find('[data-page="profile"]').exists()).toBe(true)
    expect(w.find('[data-testid="profile-identity"]').exists()).toBe(true)
    expect(w.find('[data-testid="profile-security"]').exists()).toBe(true)
    expect(w.text()).toContain('Admin Sentinel')
    expect(w.text()).toContain('admin@example.test')
  })

  it('lists the active permissions', async () => {
    const w = await mountSuspended(Page)
    const perms = w.find('[data-testid="profile-permissions"]')
    expect(perms.exists()).toBe(true)
    expect(perms.text()).toContain('admin.dashboard.view')
    expect(perms.text()).toContain('profile.read')
  })

  it('renders the loading skeleton when the principal is not yet resolved', async () => {
    principalRef.value = null
    const w = await mountSuspended(Page)
    expect(w.find('[data-testid="profile-identity"]').exists()).toBe(false)
  })
})
