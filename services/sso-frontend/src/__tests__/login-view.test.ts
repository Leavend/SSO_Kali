import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '../pages/auth/LoginPage.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
}))

describe('LoginPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the production entry login page from src/pages/auth', async () => {
    const wrapper = mount(LoginPage, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })

    expect(wrapper.text()).toContain('Selamat datang kembali')
    expect(wrapper.text()).toContain(
      'Gunakan kredensial SSO-mu untuk mengakses semua aplikasi kerja.',
    )
    expect(wrapper.find('#login-identifier').attributes('placeholder')).toBe('user@company.com')
    expect(wrapper.find('#login-password').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()

    await wrapper.find('#login-identifier').setValue('admin@example.com')
    await wrapper.find('#login-password').setValue('password-secret')

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})
