import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session.store'
import SsoErrorTemplatesPage from '../SsoErrorTemplatesPage.vue'
import { useSsoErrorTemplatesStore } from '../../stores/sso-error-templates.store'
import type { SsoErrorTemplate } from '../../types'

vi.mock('../../services/sso-error-templates.api', () => ({
  ssoErrorTemplatesApi: {
    list: vi.fn<() => Promise<unknown>>(),
    get: vi.fn<() => Promise<unknown>>(),
    update: vi.fn<() => Promise<unknown>>(),
    reset: vi.fn<() => Promise<unknown>>(),
  },
}))

const template: SsoErrorTemplate = {
  error_code: 'session_expired',
  locale: 'id',
  title: 'Sesi berakhir',
  message: 'Silakan login kembali.',
  action_label: 'Login ulang',
  action_url: 'https://sso.example.test/login',
  retry_allowed: true,
  alternative_login_allowed: false,
  is_enabled: true,
}

function seedPrincipal(capabilities: Record<string, boolean>): void {
  useSessionStore().setPrincipal({
    subject_id: 'admin-1',
    email: 'admin@example.test',
    display_name: 'Admin One',
    role: 'admin',
    last_login_at: null,
    auth_context: {
      auth_time: null,
      amr: [],
      acr: null,
      mfa_enforced: false,
      mfa_verified: false,
    },
    permissions: {
      view_admin_panel: true,
      manage_sessions: capabilities['admin.sessions.terminate'] === true,
      capabilities,
      permissions: Object.keys(capabilities),
      menus: [],
    },
  })
}

function seedFullAccessPrincipal(): void {
  seedPrincipal({
    'admin.sso-error-templates.write': true,
  })
}

describe('SsoErrorTemplatesPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    seedFullAccessPrincipal()
  })

  it('renders the catalog with a customized template', () => {
    const store = useSsoErrorTemplatesStore()
    store.templates = [template]
    store.status = 'success'
    store.requestId = 'req-templates-1'

    const wrapper = mount(SsoErrorTemplatesPage)

    expect(wrapper.text()).toContain('SSO Error Templates')
    expect(wrapper.text()).toContain('session_expired')
    expect(wrapper.text()).toContain('Sesi berakhir')
    expect(wrapper.text()).toContain('Silakan login kembali.')
    expect(wrapper.text()).toContain('req-templates-1')
  })

  it('renders loading state', () => {
    const store = useSsoErrorTemplatesStore()
    store.status = 'loading'

    const wrapper = mount(SsoErrorTemplatesPage)

    expect(wrapper.text()).toContain('Memuat SSO error templates')
    expect(wrapper.find('.ui-skeleton').exists()).toBe(true)
  })

  it('renders forbidden state with safe copy', () => {
    const store = useSsoErrorTemplatesStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat SSO error templates.'

    const wrapper = mount(SsoErrorTemplatesPage)

    expect(wrapper.text()).toContain('Akses ditolak')
    expect(wrapper.text()).toContain('Kamu tidak memiliki izin untuk melihat SSO error templates.')
    expect(wrapper.find('.ui-status-view').exists()).toBe(true)
  })

  it('renders unauthenticated state', () => {
    const store = useSsoErrorTemplatesStore()
    store.status = 'unauthenticated'
    store.errorMessage = 'Sesi admin berakhir. Login ulang untuk melanjutkan.'

    const wrapper = mount(SsoErrorTemplatesPage)

    expect(wrapper.text()).toContain('Sesi admin berakhir')
    expect(wrapper.find('.ui-status-view').exists()).toBe(true)
  })

  it('renders error state', () => {
    const store = useSsoErrorTemplatesStore()
    store.status = 'error'
    store.errorMessage = 'Gunakan request ID req-err untuk investigasi.'

    const wrapper = mount(SsoErrorTemplatesPage)

    expect(wrapper.text()).toContain('SSO error templates belum bisa dimuat')
    expect(wrapper.text()).toContain('req-err')
    expect(wrapper.find('.ui-status-view').exists()).toBe(true)
  })

  it('uses shared form primitives while editing a template', async () => {
    const store = useSsoErrorTemplatesStore()
    store.templates = [template]
    store.status = 'success'

    const wrapper = mount(SsoErrorTemplatesPage)
    const card = wrapper.findAll('.ui-card').find((node) => node.text().includes('session_expired'))
    const editButton = card!.findAll('button').find((btn) => btn.text() === 'Edit')
    await editButton!.trigger('click')

    expect(card!.find('.ui-form-field').exists()).toBe(true)
    expect(card!.find('.ui-control').exists()).toBe(true)
  })

  it('shows default badge for an un-customized error code', () => {
    const store = useSsoErrorTemplatesStore()
    store.templates = [template]
    store.status = 'success'

    const wrapper = mount(SsoErrorTemplatesPage)

    // 'server_error' is in the catalog list but has no stored template → default
    expect(wrapper.text()).toContain('server_error')
    expect(wrapper.text()).toContain('Default catalog entry')
  })

  it('surfaces step-up guidance when actionStatus is step_up_required', () => {
    const store = useSsoErrorTemplatesStore()
    store.templates = [template]
    store.status = 'success'
    store.actionStatus = 'step_up_required'
    store.errorMessage =
      'Aksi ini membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.'

    const wrapper = mount(SsoErrorTemplatesPage)

    expect(wrapper.text()).toContain('Aksi ini membutuhkan fresh-auth atau MFA assurance')
  })

  it('opens the edit form prefilled and calls store.upsert on save', async () => {
    const store = useSsoErrorTemplatesStore()
    store.templates = [template]
    store.status = 'success'
    const upsertSpy = vi.spyOn(store, 'upsert').mockResolvedValue()

    const wrapper = mount(SsoErrorTemplatesPage)

    const card = wrapper.findAll('.ui-card').find((node) => node.text().includes('session_expired'))
    expect(card).toBeTruthy()

    const editButton = card!.findAll('button').find((btn) => btn.text() === 'Edit')
    await editButton!.trigger('click')

    expect(card!.find('input').exists()).toBe(true)

    const saveButton = card!.findAll('button').find((btn) => btn.text() === 'Save')
    await saveButton!.trigger('click')

    expect(upsertSpy).toHaveBeenCalledWith(
      'session_expired',
      expect.objectContaining({ locale: 'id', title: 'Sesi berakhir' }),
    )
  })

  it('calls store.resetTemplate for the targeted error code', async () => {
    const store = useSsoErrorTemplatesStore()
    store.templates = [template]
    store.status = 'success'
    const resetSpy = vi.spyOn(store, 'resetTemplate').mockResolvedValue()

    const wrapper = mount(SsoErrorTemplatesPage)

    const card = wrapper.findAll('.ui-card').find((node) => node.text().includes('session_expired'))
    const resetButton = card!.findAll('button').find((btn) => btn.text() === 'Reset')
    await resetButton!.trigger('click')

    expect(resetSpy).toHaveBeenCalledWith('session_expired', 'id')
  })

  it('hides template write actions for read-only principals', () => {
    seedPrincipal({})
    const store = useSsoErrorTemplatesStore()
    store.templates = [template]
    store.status = 'success'

    const wrapper = mount(SsoErrorTemplatesPage)

    expect(wrapper.text()).not.toContain('Edit')
    expect(wrapper.text()).not.toContain('Reset')
    expect(wrapper.text()).not.toContain('Save')
  })
})
