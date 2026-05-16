import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuditTrailPage from './AuditTrailPage.vue'
import { useAdminConsoleStore } from '@/stores/admin-console.store'
import type { AdminPrincipal } from '@/types/admin.types'

describe('AuditTrailPage contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:test'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('filters audit events and hides export without capability', async () => {
    installAdmin({ 'admin.audit.read': true })
    const fetchMock = mockFetch()
    const wrapper = mount(AuditTrailPage)
    await flushPromises()

    expect(wrapper.text()).toContain('create_managed_user')
    expect(wrapper.text()).toContain('valid')
    expect(wrapper.text()).not.toContain('Export CSV')

    await wrapper.find('#audit-action').setValue('lock_managed_user')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/audit/events?'),
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('shows export controls only with export capability', async () => {
    installAdmin({ 'admin.audit.read': true, 'admin.audit.export': true })
    const fetchMock = mockFetch()
    const wrapper = mount(AuditTrailPage)
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Export CSV'))
      ?.trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/audit/export?'),
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('uses safe failure copy for raw server errors', async () => {
    installAdmin({ 'admin.audit.read': true })
    mockFetch({ listStatus: 500 })

    const wrapper = mount(AuditTrailPage)
    await flushPromises()

    expect(wrapper.text()).toContain('Layanan SSO sedang tidak tersedia. Coba lagi nanti.')
    expect(wrapper.text()).not.toContain('PDOException')
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

function mockFetch(options: { readonly listStatus?: number } = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.startsWith('/api/admin/audit/events'))
      return jsonResponse(auditList(), options.listStatus ?? 200)
    if (url.startsWith('/api/admin/audit/integrity'))
      return jsonResponse({
        integrity: {
          valid: true,
          checked_events: 1,
          first_event_id: 'evt_1',
          last_event_id: 'evt_1',
          last_event_hash: 'abc',
          broken_event_id: null,
        },
      })
    if (url.startsWith('/api/admin/audit/export'))
      return new Response('event_id\nevt_1\n', { headers: { 'content-type': 'text/csv' } })
    return jsonResponse({ message: 'PDOException stack trace' }, 500)
  })
  globalThis.fetch = fetchMock as typeof fetch
  return fetchMock
}

function auditList(): unknown {
  return {
    events: [
      {
        event_id: 'evt_1',
        action: 'create_managed_user',
        outcome: 'succeeded',
        taxonomy: 'destructive_action_with_step_up',
        actor: { subject_id: 'admin-1', email: 'admin@example.test', role: 'admin' },
        request: { method: 'POST', path: 'admin/api/users', ip_address: '127.0.0.1' },
        reason: null,
        hash_chain: { previous_hash: null, event_hash: 'abc' },
        occurred_at: '2026-05-16T00:00:00Z',
      },
    ],
    pagination: { per_page: 25, next_cursor: null, previous_cursor: null, has_more: false },
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  const body = status >= 400 ? { message: 'PDOException stack trace' } : payload
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}
