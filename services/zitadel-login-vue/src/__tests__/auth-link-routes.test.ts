import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import LoginView from '../web/views/LoginView.vue'
import PasswordView from '../web/views/PasswordView.vue'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))

vi.mock('@/stores/loginFlow', () => ({
  useLoginFlowStore: () => ({
    displayName: 'huanamasi123@gmail.com',
    errorMessage: '',
    hydrateFromRoute: () => null,
    isLoading: false,
    loginName: 'huanamasi123@gmail.com',
    submitAuthRequest: () => null,
    submitLoginName: () => null,
    submitPassword: () => null,
  }),
}))

describe('Vue login anchor routes', () => {
  it('routes reset and register anchors through the Vue login base path', async () => {
    const wrapper = mount(LoginView)
    await nextTick()

    await wrapper.find('input').setValue('huanamasi123@gmail.com')

    expect(wrapper.find('a[href^="/ui/v2/auth/password/reset"]').attributes('href')).toBe(
      '/ui/v2/auth/password/reset?login_hint=huanamasi123%40gmail.com',
    )
    expect(wrapper.find('a[href^="/ui/v2/auth/register"]').attributes('href')).toBe(
      '/ui/v2/auth/register?login_hint=huanamasi123%40gmail.com',
    )
  })

  it('keeps password reset anchored to the selected account', () => {
    const wrapper = mount(PasswordView)

    expect(wrapper.find('a[href^="/ui/v2/auth/password/reset"]').attributes('href')).toBe(
      '/ui/v2/auth/password/reset?login_hint=huanamasi123%40gmail.com',
    )
  })
})
