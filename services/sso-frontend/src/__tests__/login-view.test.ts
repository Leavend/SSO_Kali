import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginView from '../web/views/LoginView.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

describe('LoginView', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the legacy Next login experience copy and actions in Vue', async () => {
    const wrapper = mount(LoginView)

    expect(wrapper.text()).toContain('Dev-SSO')
    expect(wrapper.text()).toContain('Masuk')
    expect(wrapper.text()).toContain('Masukkan email yang terdaftar untuk melanjutkan.')
    expect(wrapper.find('input[type="email"]').attributes('placeholder')).toBe('user@company.com')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()

    await wrapper.find('input[type="email"]').setValue('admin@example.com')

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('a[href^="/auth/password-reset"]').attributes('href')).toBe(
      '/auth/password-reset?login_hint=admin%40example.com',
    )
    expect(wrapper.find('a[href^="/auth/register"]').attributes('href')).toBe(
      '/auth/register?login_hint=admin%40example.com',
    )
    expect(wrapper.find('#devsso-theme-toggle').exists()).toBe(true)
    expect(wrapper.find('footer.auth-footer').text()).toContain('© 2026 Dev-SSO')
    expect(wrapper.find('footer.auth-footer').text()).toContain('Terms')
  })

  it('resets the submit loading state when the browser returns from identity UI', async () => {
    const wrapper = mount(LoginView)

    await wrapper.find('input[type="email"]').setValue('admin@example.com')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('Loading...')

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Lanjutkan')
    expect(wrapper.text()).not.toContain('Loading...')
  })
})
