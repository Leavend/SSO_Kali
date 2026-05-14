import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AUTH_SHELL } from '@parent-ui/auth-shell.mjs'
import LoginView from '../web/views/LoginView.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

describe('LoginView', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps the legacy Next login experience copy and actions in Vue', async () => {
    const wrapper = mount(LoginView)

    expect(wrapper.text()).toContain('Dev-SSO')
    expect(wrapper.text()).toContain(AUTH_SHELL.copy.loginTitle)
    expect(wrapper.text()).toContain(AUTH_SHELL.copy.loginSubtitle)
    expect(wrapper.find('input[type="email"]').attributes('placeholder')).toBe('user@company.com')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()

    await wrapper.find('input[type="email"]').setValue('admin@example.com')

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.floating-actions').exists()).toBe(true)
    expect(wrapper.find('.floating-actions').attributes('style')).toBeUndefined()
    expect(wrapper.find('footer.auth-footer').text()).toContain('© 2026 Dev-SSO')
  })

  it('defaults SSO login return target to the public user home', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const wrapper = mount(LoginView)

    await wrapper.find('input[type="email"]').setValue('huanamasi123@gmail.com')
    await wrapper.find('form').trigger('submit')

    expect(assign).toHaveBeenCalledWith(
      '/auth/login?return_to=%2Fhome&login_hint=huanamasi123%40gmail.com',
    )
  })
})
