import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import RegisterPage from '../RegisterPage.vue'
import { ApiError, type ApiViolation } from '@/lib/api/api-error'
import { apiClient } from '@/lib/api/api-client'

const routerPushMock = vi.fn<(...args: unknown[]) => Promise<void>>()

vi.mock('vue-router', () => ({
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
  return new ApiError(
    status,
    message,
    status === 422 ? 'validation_failed' : null,
    violations,
  )
}

async function fillValidForm(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('input#register-name').setValue('Asep Sunandar')
  await wrapper.find('input#register-email').setValue('asep@example.test')
  await wrapper.find('input#register-password').setValue('CorrectHorse9!Battery')
  await wrapper.find('input#register-password-confirm').setValue('CorrectHorse9!Battery')
}

function mountRegister() {
  return mount(RegisterPage, {
    global: {
      components: {
        RouterLink: defineComponent({
          name: 'RouterLink',
          props: { to: { type: [String, Object], required: true } },
          setup(_, { slots }) {
            return () => h('a', {}, slots.default?.())
          },
        }),
      },
      stubs: {
        SsoGlassCard: defineComponent({
          name: 'SsoGlassCard',
          setup(_, { slots }) {
            return () =>
              h('section', {}, [
                slots.header?.(),
                slots.default?.(),
                slots.footer?.(),
              ])
          },
        }),
        SsoGlassButton: defineComponent({
          name: 'SsoGlassButton',
          props: { disabled: { type: Boolean, default: false } },
          emits: ['click'],
          setup(props, { slots, emit }) {
            return () =>
              h(
                'button',
                {
                  type: 'submit',
                  disabled: props.disabled,
                  onClick: (e: Event) => emit('click', e),
                },
                slots.default?.(),
              )
          },
        }),
        SsoGlassFormField: defineComponent({
          name: 'SsoGlassFormField',
          props: {
            id: { type: String, required: true },
            modelValue: { type: String, default: '' },
            label: { type: String, default: '' },
            type: { type: String, default: 'text' },
            error: { type: String, default: null },
          },
          emits: ['update:modelValue'],
          setup(props, { emit }) {
            return () =>
              h('div', {}, [
                h('label', { for: props.id }, props.label),
                h('input', {
                  id: props.id,
                  type: props.type,
                  value: props.modelValue,
                  onInput: (event: Event) =>
                    emit('update:modelValue', (event.target as HTMLInputElement).value),
                }),
                props.error
                  ? h('p', { 'data-testid': `${props.id}-error` }, props.error)
                  : null,
              ])
          },
        }),
        SsoAlertBanner: defineComponent({
          name: 'SsoAlertBanner',
          props: { tone: { type: String, default: 'error' }, message: { type: String, required: true } },
          setup(props) {
            return () =>
              h('p', { 'data-testid': `register-banner-${props.tone}` }, props.message)
          },
        }),
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

  it('blocks submission when password does not meet the 12-character policy', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({})
    const wrapper = mountRegister()

    await wrapper.find('input#register-name').setValue('Asep')
    await wrapper.find('input#register-email').setValue('asep@example.test')
    await wrapper.find('input#register-password').setValue('Sh0rty!')
    await wrapper.find('input#register-password-confirm').setValue('Sh0rty!')

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(postSpy).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="register-password-error"]').text()).toContain('kebijakan keamanan')
  })

  it('renders generic safe copy for unknown 5xx ApiError instead of leaking backend message', async () => {
    const leak = 'SQLSTATE[HY000]: connection refused at 192.168.10.5'
    vi.spyOn(apiClient, 'post').mockRejectedValue(buildApiError(500, leak))
    const wrapper = mountRegister()

    await fillValidForm(wrapper)
    await wrapper.find('form').trigger('submit.prevent')
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

    await fillValidForm(wrapper)
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.find('[data-testid="register-email-error"]').text()).toBe('Email ini sudah terdaftar.')
    const nameError = wrapper.find('[data-testid="register-name-error"]').text()

    expect(nameError).toBe('Data tidak valid.')
    expect(nameError).not.toContain('leak@example.test')
  })

  it('shows generic copy when a non-ApiError is thrown by the network layer', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(new TypeError('Failed to fetch'))
    const wrapper = mountRegister()

    await fillValidForm(wrapper)
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const banner = wrapper.find('[data-testid="register-banner-error"]')

    expect(banner.text()).toBe('Gagal mendaftarkan akun. Coba lagi beberapa saat.')
    expect(banner.text()).not.toContain('Failed to fetch')
  })
})
