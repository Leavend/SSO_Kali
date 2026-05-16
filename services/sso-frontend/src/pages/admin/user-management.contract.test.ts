import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UserManagementPage from './UserManagementPage.vue'
import { useAdminConsoleStore } from '@/stores/admin-console.store'
import type { AdminPrincipal } from '@/types/admin.types'

vi.mock('@/components/molecules/ConfirmDialog.vue', () => ({
  default: {
    props: ['open'],
    emits: ['confirm', 'update:open'],
    template:
      '<div v-if="open"><button type="button" @click="$emit(\'confirm\')">Konfirmasi</button></div>',
  },
}))

describe('UserManagementPage contract', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.restoreAllMocks())

  it('hides lifecycle actions without write/lock permissions', async () => {
    installAdmin({ 'admin.users.read': true })
    mockFetch()

    const wrapper = mount(UserManagementPage)
    await flushPromises()

    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).not.toContain('Tambah User')
    expect(wrapper.text()).not.toContain('Reset Password')
    expect(wrapper.text()).not.toContain('Deactivate')
  })

  it('creates users and requires confirmation reason for destructive lifecycle actions', async () => {
    installAdmin({ 'admin.users.read': true, 'admin.users.write': true, 'admin.users.lock': true })
    const fetchMock = mockFetch()
    const wrapper = mount(UserManagementPage)
    await flushPromises()

    await wrapper.find('#new-email').setValue('new@example.test')
    await wrapper.find('#new-name').setValue('New User')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/users',
      expect.objectContaining({ method: 'POST' }),
    )

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Deactivate'))
      ?.trigger('click')
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Buka Konfirmasi'))
      ?.trigger('click')
    expect(wrapper.text()).toContain('Isi alasan minimal 5 karakter')

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/admin/users/usr_ada/deactivate',
      expect.anything(),
    )

    await wrapper.find('#action-reason').setValue('Ticket SR-42 compromise')
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Buka Konfirmasi'))
      ?.trigger('click')
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Konfirmasi'))
      ?.trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/users/usr_ada/deactivate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Ticket SR-42 compromise' }),
      }),
    )
  })

  it('shows safe copy for admin API failures', async () => {
    installAdmin({ 'admin.users.read': true })
    mockFetch({ listStatus: 500 })

    const wrapper = mount(UserManagementPage)
    await flushPromises()

    expect(wrapper.text()).toContain('Layanan SSO sedang tidak tersedia. Coba lagi nanti.')
    expect(wrapper.text()).not.toContain('stack trace')
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
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url === '/api/admin/users' && method === 'GET')
      return jsonResponse({ users: [user()] }, options.listStatus ?? 200)
    if (url === '/api/admin/users' && method === 'POST')
      return jsonResponse({ user: { ...user(), subject_id: 'usr_new' } }, 201)
    if (url === '/api/admin/users/usr_ada/deactivate' && method === 'POST')
      return jsonResponse({ user: { ...user(), status: 'disabled' } })
    return jsonResponse({ message: 'stack trace' }, 500)
  })
  globalThis.fetch = fetchMock as typeof fetch
  return fetchMock
}

function user(): Record<string, unknown> {
  return {
    id: 1,
    subject_id: 'usr_ada',
    email: 'ada@example.test',
    display_name: 'Ada Lovelace',
    given_name: 'Ada',
    family_name: 'Lovelace',
    role: 'user',
    status: 'active',
    disabled_at: null,
    disabled_reason: null,
    locked_at: null,
    locked_until: null,
    locked_reason: null,
    lock_count: 0,
    local_account_enabled: true,
    email_verified_at: null,
    last_login_at: null,
    created_at: '2026-05-16T00:00:00Z',
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  const body = status >= 400 ? { message: 'stack trace SQLSTATE[42P01]' } : payload
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}
