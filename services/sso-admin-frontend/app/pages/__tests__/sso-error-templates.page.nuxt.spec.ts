import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

// Module-level, typed service mocks — 16.8/16.9 set .mockResolvedValue per test.
const listMock = vi.fn<() => Promise<unknown>>()
const updateMock = vi.fn<(code: string, payload: unknown) => Promise<unknown>>()
const resetMock = vi.fn<(code: string, locale: string) => Promise<unknown>>()
vi.mock('@/services/sso-error-templates.api', () => ({
  ssoErrorTemplatesApi: { list: listMock, update: updateMock, reset: resetMock },
}))

const TPL_EN: SsoErrorTemplate = {
  error_code: 'access_denied',
  locale: 'en',
  title: 'Access denied',
  message: 'You do not have access.',
  action_label: 'Back to sign-in',
  action_url: 'https://sso.example/help',
  retry_allowed: false,
  alternative_login_allowed: true,
  is_enabled: true,
}

const templatesRef = ref<readonly SsoErrorTemplate[] | null>([TPL_EN])
const viewStateRef = ref<
  'loading' | 'forbidden' | 'unauthenticated' | 'error' | 'empty' | 'ready'
>('ready')
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useSsoErrorTemplates', () => ({
  useSsoErrorTemplates: () => ({
    templates: templatesRef,
    viewState: computed(() => viewStateRef.value),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: refreshMock,
  }),
}))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel', subject_id: 'a1' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission: (p: string) => permitted.includes(p),
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
const Page = (await import('../sso-error-templates.vue')).default

beforeEach(() => {
  permitted = ['admin.security-policy.read', 'admin.sso-error-templates.write']
  templatesRef.value = [TPL_EN]
  viewStateRef.value = 'ready'
})
afterEach(() => vi.clearAllMocks())

describe('sso-error-templates page — read surface', () => {
  it('renders the ready table with the error code + title', async () => {
    const wrapper = await mountSuspended(Page)
    expect(wrapper.find('[data-page="sso-error-templates"]').exists()).toBe(true)
    expect(wrapper.html()).toContain('access_denied')
    expect(wrapper.html()).toContain('Access denied')
  })

  it('renders the empty state when there are no templates', async () => {
    templatesRef.value = []
    viewStateRef.value = 'empty'
    const wrapper = await mountSuspended(Page)
    expect(wrapper.text()).toContain(enLocale.sso_templates.empty_title)
  })

  it('opens the detail drawer with the full copy when a row is selected', async () => {
    const wrapper = await mountSuspended(Page)
    await wrapper.get('[data-testid="sso-templates-select-access_denied::en"]').trigger('click')
    await flushPromises()
    const drawer = wrapper.find('[data-testid="sso-template-detail"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('You do not have access.')
  })
})

describe('sso-error-templates page — edit (PATCH)', () => {
  it('opens the prefilled edit dialog from the drawer when canWrite', async () => {
    const wrapper = await mountSuspended(Page)
    await wrapper.get('[data-testid="sso-templates-select-access_denied::en"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="sso-template-edit"]').trigger('click')
    expect(wrapper.find('[data-testid="sso-template-form"]').exists()).toBe(true)
  })

  it('hides the Edit affordance without write permission', async () => {
    permitted = ['admin.security-policy.read']
    const wrapper = await mountSuspended(Page)
    await wrapper.get('[data-testid="sso-templates-select-access_denied::en"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="sso-template-edit"]').exists()).toBe(false)
  })

  it('submits an edit via update() and refreshes on success', async () => {
    updateMock.mockResolvedValue({ template: TPL_EN })
    const wrapper = await mountSuspended(Page)
    await wrapper.get('[data-testid="sso-templates-select-access_denied::en"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="sso-template-edit"]').trigger('click')
    await wrapper.get('[data-testid="sso-template-form"]').trigger('submit')
    await flushPromises()
    expect(updateMock).toHaveBeenCalledWith(
      'access_denied',
      expect.objectContaining({ locale: 'en', title: 'Access denied' }),
    )
    expect(refreshMock).toHaveBeenCalled()
  })
})
