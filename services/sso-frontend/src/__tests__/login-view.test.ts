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

  it('renders the production portal login experience', async () => {
    const wrapper = mount(LoginView)

    expect(wrapper.find('.portal-login').exists()).toBe(true)
    expect(wrapper.text()).toContain('Dev-SSO')
    expect(wrapper.text()).toContain('Masuk ke akunmu')
    expect(wrapper.text()).toContain('Portal autentikasi tunggal untuk semua aplikasi kamu.')
    expect(wrapper.find('#login-identifier').attributes('placeholder')).toBe('user@company.com')
    expect(wrapper.find('#login-password').exists()).toBe(true)
    expect(wrapper.find('#portal-theme-toggle').exists()).toBe(true)
    expect(wrapper.find('#portal-password-toggle').exists()).toBe(true)
    expect(wrapper.find('#portal-login-submit').attributes('disabled')).toBeDefined()

    await wrapper.find('#login-identifier').setValue('admin@example.com')
    await wrapper.find('#login-password').setValue('secret')

    expect(wrapper.find('#portal-login-submit').attributes('disabled')).toBeUndefined()
  })

  it('resets the submit loading state when the browser returns from identity UI', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    const wrapper = mount(LoginView)

    await wrapper.find('#login-identifier').setValue('admin@example.com')
    await wrapper.find('#login-password').setValue('secret')
    await wrapper.find('form').trigger('submit')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Memproses…')

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Masuk')
    expect(wrapper.text()).not.toContain('Memproses…')
  })
})
