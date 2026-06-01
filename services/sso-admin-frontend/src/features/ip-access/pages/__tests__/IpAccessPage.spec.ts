import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session.store'
import IpAccessPage from '../IpAccessPage.vue'
import { useIpAccessStore } from '../../stores/ip-access.store'

const rule = {
  id: 1,
  cidr: '10.0.0.0/8',
  mode: 'allow' as const,
  reason: 'Internal range',
  expires_at: null,
  actor_subject_id: 'admin-1',
  created_at: '2026-05-30T00:00:00Z',
  updated_at: '2026-05-30T00:00:00Z',
}

function seedPrincipal(permissions: string[]): void {
  useSessionStore().setPrincipal({
    subject_id: 'admin-1',
    email: 'admin@example.test',
    display_name: 'Admin One',
    role: 'admin',
    last_login_at: null,
    auth_context: { auth_time: null, amr: [], acr: null, mfa_enforced: false, mfa_verified: false },
    permissions: {
      view_admin_panel: true,
      manage_sessions: true,
      capabilities: Object.fromEntries(permissions.map((p) => [p, true])),
      permissions,
      menus: [],
    },
  })
}

describe('IpAccessPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    seedPrincipal(['admin.ip-access.read', 'admin.ip-access.write'])
  })

  it('renders ip access rule list, mode badge, and create form', () => {
    const store = useIpAccessStore()
    store.status = 'success'
    store.rules = [rule]

    const wrapper = mount(IpAccessPage)

    expect(wrapper.text()).toContain('IP Access Rules')
    expect(wrapper.text()).toContain('10.0.0.0/8')
    expect(wrapper.text()).toContain('allow')
    expect(wrapper.text()).toContain('Internal range')
    expect(wrapper.text()).toContain('Tambah aturan IP')
  })

  it('renders safe forbidden state', () => {
    const store = useIpAccessStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat IP access rules.'

    const wrapper = mount(IpAccessPage)

    expect(wrapper.text()).toContain('Akses IP access rules ditolak')
    expect(wrapper.text()).not.toContain('Bearer')
    expect(wrapper.text()).not.toContain('SQLSTATE')
  })

  it('renders safe unauthenticated state', () => {
    const store = useIpAccessStore()
    store.status = 'unauthenticated'
    store.errorMessage = 'Sesi admin berakhir. Login ulang untuk melanjutkan.'

    const wrapper = mount(IpAccessPage)

    expect(wrapper.text()).toContain('Sesi admin berakhir')
    expect(wrapper.text()).not.toContain('Bearer')
    expect(wrapper.text()).not.toContain('SQLSTATE')
  })

  it('renders safe error state with request evidence', () => {
    const store = useIpAccessStore()
    store.status = 'error'
    store.requestId = 'req-ip-fail'
    store.errorMessage =
      'IP access rules belum bisa dimuat. Gunakan request ID req-ip-fail untuk investigasi.'

    const wrapper = mount(IpAccessPage)

    expect(wrapper.text()).toContain('IP access rules belum bisa dimuat')
    expect(wrapper.text()).toContain('req-ip-fail')
    expect(wrapper.text()).not.toMatch(/Bearer|SQLSTATE/i)
  })

  it('renders empty state when no rules exist', () => {
    const store = useIpAccessStore()
    store.status = 'success'
    store.rules = []

    const wrapper = mount(IpAccessPage)

    expect(wrapper.text()).toContain('Belum ada aturan IP access.')
    expect(wrapper.find('.ui-empty-state').exists()).toBe(true)
  })

  it('uses shared state, table, and form primitives', async () => {
    const store = useIpAccessStore()
    store.status = 'loading'

    const wrapper = mount(IpAccessPage)

    expect(wrapper.find('.ui-skeleton').exists()).toBe(true)

    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat IP access rules.'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ui-status-view').exists()).toBe(true)

    store.status = 'success'
    store.rules = [rule]
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ui-data-list').exists()).toBe(true)
    expect(wrapper.find('.ui-form-field').exists()).toBe(true)
    expect(wrapper.find('.ui-control').exists()).toBe(true)
  })

  it('renders re-authentication prompt when action requires step-up', () => {
    const store = useIpAccessStore()
    store.status = 'success'
    store.rules = [rule]
    store.actionStatus = 'step_up_required'
    store.errorMessage =
      'Aksi ini membutuhkan re-autentikasi (fresh-auth atau MFA assurance). Ulangi login admin lalu coba lagi.'

    const wrapper = mount(IpAccessPage)

    expect(wrapper.text()).toContain('re-autentikasi')
  })

  it('hides create form and delete buttons for read-only principals', () => {
    seedPrincipal(['admin.ip-access.read'])
    const store = useIpAccessStore()
    store.status = 'success'
    store.rules = [rule]

    const wrapper = mount(IpAccessPage)

    expect(wrapper.text()).not.toContain('Tambah aturan IP')
    expect(wrapper.text()).not.toContain('Hapus')
  })

  it('does not delete an IP rule before confirmation and cancel is no-op', async () => {
    const store = useIpAccessStore()
    store.status = 'success'
    store.rules = [rule]
    const deleteSpy = vi.spyOn(store, 'destroy')

    const wrapper = mount(IpAccessPage)

    await wrapper.find('button.ip-rule-delete-button').trigger('click')
    expect(deleteSpy).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="confirm-dialog-cancel"]').trigger('click')
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('deletes an IP rule after confirmation', async () => {
    const store = useIpAccessStore()
    store.status = 'success'
    store.rules = [rule]
    const deleteSpy = vi.spyOn(store, 'destroy')

    const wrapper = mount(IpAccessPage)

    await wrapper.find('button.ip-rule-delete-button').trigger('click')
    await wrapper.find('[data-testid="confirm-dialog-confirm"]').trigger('click')

    expect(deleteSpy).toHaveBeenCalledWith(1)
  })
})
