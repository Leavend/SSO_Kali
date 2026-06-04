import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DashboardPage from '../DashboardPage.vue'
import { useDashboardStore } from '../../stores/dashboard.store'
import type { DashboardSummary } from '../../types'

vi.mock('../../services/dashboard.api', () => ({
  dashboardApi: {
    getSummary: vi.fn<() => Promise<unknown>>(),
  },
}))

const summary: DashboardSummary = {
  generated_at: '2026-05-27T00:00:00Z',
  counters: {
    users: { total: 10, active: 8, disabled: 1, locked: 1 },
    sessions: { portal_active: 5, rp_active: 7 },
    clients: { total: 3, active: 2, staged: 1, decommissioned: 0 },
    audit: { admin_last_24h: 4, auth_last_24h: 9 },
    incidents: { admin_denied_last_24h: 2 },
    data_subject_requests: {
      submitted: 1,
      approved: 1,
      rejected: 0,
      fulfilled: 2,
      on_hold: 0,
    },
  },
}

describe('DashboardPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders dashboard counters and request evidence', async () => {
    const store = useDashboardStore()
    store.summary = summary
    store.status = 'success'
    store.requestId = 'req-dashboard-1'

    const wrapper = mount(DashboardPage)

    expect(wrapper.text()).toContain('Admin Dashboard')
    expect(wrapper.text()).toContain('Users')
    expect(wrapper.text()).toContain('10')
    expect(wrapper.text()).toContain('Request ID')
    expect(wrapper.text()).toContain('req-dashboard-1')
    expect(wrapper.text()).toContain('2026-05-27T00:00:00Z')
  })

  it('renders safe forbidden state without raw backend details', () => {
    const store = useDashboardStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat dashboard admin.'

    const wrapper = mount(DashboardPage)

    expect(wrapper.text()).toContain('Dashboard access denied')
    expect(wrapper.text()).not.toContain('SQLSTATE')
  })

  it('renders safe error state with request evidence', () => {
    const store = useDashboardStore()
    store.status = 'error'
    store.requestId = 'req-fail-1'
    store.errorMessage =
      'Dashboard admin belum bisa dimuat. Coba lagi atau gunakan request ID req-fail-1 untuk investigasi.'

    const wrapper = mount(DashboardPage)

    expect(wrapper.text()).toContain('Admin dashboard could not be loaded')
    expect(wrapper.text()).toContain('req-fail-1')
    expect(wrapper.text()).not.toMatch(/Bearer|refreshToken|SQLSTATE/i)
  })

  it('renders empty state when dashboard summary has no counters', () => {
    const store = useDashboardStore()
    store.status = 'success'
    store.summary = {
      generated_at: '2026-05-27T00:00:00Z',
      counters: {
        users: {},
        sessions: {},
        clients: {},
        audit: {},
        incidents: {},
        data_subject_requests: {},
      },
    }

    const wrapper = mount(DashboardPage)

    expect(wrapper.text()).toContain('No dashboard summary to display.')
  })
})
