import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import RegisterPage from '../RegisterPage.vue'
import { ApiError, type ApiViolation } from '@/lib/api/api-error'
import { apiClient } from '@/lib/api/api-client'

const routerPushMock = vi.fn<(...args: unknown[]) => Promise<void>>()

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: routerPushMock }),
  RouterLink: defineComponent({
    name: 'RouterLink',
    props: { to: { type: [String, Object], required: true } },
    setup(_, { slots }) {
      return () => h('a', {}, slots.default?.())
    },
  }),
}))

function buildApiError(
  status: number,
  message: string,
  violations: readonly ApiViolation[] = [],
): ApiError {
  return new ApiError(status, message, status === 422 ? 'validation_failed' : null, violations)
}

/**
 * Walk through the multi-step Aurora register flow from step `email`
 * down to `confirm`, populating the requested values.
 *
 * Step order matches RegisterPage.vue's useAuthSteps configuration:
 * email → password → confirm (with confirmation + name).
 */
async function advanceTo(
  wrapper: ReturnType<typeof mount>,
  target: 'email' | 'password' | 'confirm',
  values: { email?: string; password?: string; confirmation?: string; name?: string } = {},
) {
  const email = values.email ?? 'asep@example.test'
  const password = values.password ?? 'CorrectHorse9!Battery'
  const confirmation = values.confirmation ?? password
  const name = values.name ?? 'Asep Sunandar'

  // Step 1: email
  await wrapper.find('input#register-email').setValue(email)
  if (target === 'email') return
  await wrapper.find('form').trigger('submit')
  await flushPromises()

  // Step 2: password
  await wrapper.find('input#register-password').setValue(password)
  if (target === 'password') return
  await wrapper.find('form').trigger('submit')
  await flushPromises()

  // Step 3: confirm + name
  await wrapper.find('input#register-password-confirm').setValue(confirmation)
  await wrapper.find('input#register-name').setValue(name)
}

function mountRegister() {
  return mount(RegisterPage, {
    global: {
      stubs: {
        SsoGlassButton: defineComponent({
          name: 'SsoGlassButton',
          props: {
            disabled: { type: Boolean, default: false },
            type: { type: String, default: 'button' },
          },
          emits: ['click'],
          setup(props, { slots, emit }) {
            return () =>
              h(
                'button',
                {
                  type: props.type,
                  disabled: props.disabled,
                  onClick: (e: Event) => emit('click', e),
                },
                slots.default?.(),
              )
          },
        }),
        SsoGlassInput: defineComponent({
          name: 'SsoGlassInput',
          props: {
            id: { type: String, required: true },
            modelValue: { type: String, default: '' },
            type: { type: String, default: 'text' },
            error: { type: String, default: null },
          },
          emits: ['update:modelValue'],
          setup(props, { emit }) {
            return () =>
              h('div', {}, [
                h('input', {
                  id: props.id,
                  type: props.type,
                  value: props.modelValue,
                  onInput: (event: Event) =>
                    emit('update:modelValue', (event.target as HTMLInputElement).value),
                }),
                props.error ? h('p', { 'data-testid': `${props.id}-error` }, props.error) : null,
              ])
          },
        }),
        SsoAlertBanner: defineComponent({
          name: 'SsoAlertBanner',
          props: {
            tone: { type: String, default: 'error' },
            message: { type: String, required: true },
          },
          setup(props) {
            return () => h('p', { 'data-testid': `register-banner-${props.tone}` }, props.message)
          },
        }),
        Transition: { template: '<div><slot /></div>' },
      },
    },
  })
}

describe('RegisterPage', () => {
  beforeEach(() => {
    routerPushMock.mockReset()
    routerPushMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('blocks step advancement when password does not meet the 12-character policy', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({})
    const wrapper = mountRegister()

    await advanceTo(wrapper, 'password', { password: 'Sh0rty!' })
    // Try to advance with a too-short password.
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // We must NOT have reached step 3 (confirm) and must NOT have submitted.
    expect(wrapper.find('input#register-password-confirm').exists()).toBe(false)
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('renders generic safe copy for unknown 5xx ApiError instead of leaking backend message', async () => {
    const leak = 'SQLSTATE[HY000]: connection refused at 192.168.10.5'
    vi.spyOn(apiClient, 'post').mockRejectedValue(buildApiError(500, leak))
    const wrapper = mountRegister()

    await advanceTo(wrapper, 'confirm')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const banner = wrapper.find('[data-testid="register-banner-error"]')

    expect(banner.exists()).toBe(true)
    expect(banner.text()).not.toContain('SQLSTATE')
    expect(banner.text()).not.toContain('192.168')
    expect(banner.text()).toContain('Layanan SSO sedang tidak tersedia')
  })

  it('translates known violations and falls back to safe copy for unknown ones', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(
      buildApiError(422, 'Data tidak valid.', [
        { field: 'email', message: 'The email has already been taken.' },
        { field: 'name', message: 'Internal violation: leak@example.test from server stack' },
      ]),
    )
    const wrapper = mountRegister()

    await advanceTo(wrapper, 'confirm')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // After a 422 with email violation, RegisterPage routes back to step `email`
    // so the email error becomes visible inline. The name violation is sanitised
    // and reported via the banner / step-3 inline error if visible.
    const emailError = wrapper.find('[data-testid="register-email-error"]')

    expect(emailError.exists()).toBe(true)
    expect(emailError.text()).toBe('Email ini sudah terdaftar.')
    expect(wrapper.text()).not.toContain('leak@example.test')
  })

  it('shows generic copy when a non-ApiError is thrown by the network layer', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(new TypeError('Failed to fetch'))
    const wrapper = mountRegister()

    await advanceTo(wrapper, 'confirm')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const banner = wrapper.find('[data-testid="register-banner-error"]')

    expect(banner.exists()).toBe(true)
    expect(banner.text()).toBe('Gagal mendaftarkan akun. Coba lagi beberapa saat.')
    expect(banner.text()).not.toContain('Failed to fetch')
  })
})
