import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminDashboardPage from './AdminDashboardPage.vue'
import { useAdminConsoleStore } from '@/stores/admin-console.store'
import type { AdminPrincipal } from '@/types/admin.types'

vi.mock('vue-router', () => ({
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
}))

describe('AdminDashboardPage contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders dashboard summary cards and RBAC quick actions', async () => {
    installAdmin({ 'admin.dashboard.view': true, 'admin.audit.read': true })
    const fetchMock = mockFetch()

    const wrapper = mount(AdminDashboardPage)
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/dashboard/summary',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(wrapper.text()).toContain('Pengguna')
    expect(wrapper.text()).toContain('42')
    expect(wrapper.text()).toContain('Audit Trail')
    expect(wrapper.text()).not.toContain('Kelola User')
    expect(wrapper.text()).not.toContain('Export Audit')
  })

  it('shows safe error copy without raw backend traces', async () => {
    installAdmin({ 'admin.dashboard.view': true })
    mockFetch({ status: 500 })

    const wrapper = mount(AdminDashboardPage)
    await flushPromises()

    expect(wrapper.text()).toContain('Layanan SSO sedang tidak tersedia. Coba lagi nanti.')
    expect(wrapper.text()).not.toContain('SQLSTATE')
  })
})

function installAdmin(capabilities: Record<string, boolean>): void {
  useAdminConsoleStore().principal = {
    subject_id: 'admin-1',
    email: 'admin@example.test',
    display_name: 'Admin Example',
    role: 'admin',
    last_login_at: null,
    permissions: { view_admin_panel: true, manage_sessions: false, permissions: [], capabilities },
  } satisfies AdminPrincipal
}

function mockFetch(options: { readonly status?: number } = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => jsonResponse(summaryPayload(), options.status ?? 200))
  globalThis.fetch = fetchMock as typeof fetch
  return fetchMock
}

function summaryPayload(): unknown {
  return {
    generated_at: '2026-05-16T00:00:00Z',
    counters: {
      users: { total: 42, active: 40, disabled: 1, locked: 1 },
      sessions: { portal_active: 12, rp_active: 8 },
      clients: { total: 7, active: 5, staged: 1, decommissioned: 1 },
      audit: { admin_last_24h: 11, auth_last_24h: 19 },
      incidents: { admin_denied_last_24h: 2 },
      data_subject_requests: { submitted: 3, approved: 1, rejected: 0, fulfilled: 4 },
    },
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  const body = status >= 400 ? { message: 'SQLSTATE[42P01] stack trace' } : payload
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}
