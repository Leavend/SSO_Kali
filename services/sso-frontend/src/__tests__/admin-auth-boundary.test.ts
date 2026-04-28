import type { IncomingMessage } from 'node:http'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../web/App.vue'
import { useAdminStore } from '../web/stores/admin'
import { handleSession } from '../server/admin-handlers'
import type { AdminSessionView } from '../shared/admin'

const routeState = vi.hoisted(() => ({
  path: '/',
  meta: {} as Record<string, unknown>,
}))

vi.mock('vue-router', () => ({
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
  RouterView: { template: '<section data-testid="router-view">Masuk</section>' },
  useRoute: () => routeState,
}))

describe('admin auth boundary', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('dark')
  })

  it('does not render the admin shell on public routes with stale principal state', () => {
    const wrapper = mountApp({ principal: principalView(), routeMeta: {} })

    expect(wrapper.find('.sidebar').exists()).toBe(false)
    expect(wrapper.find('.main-surface--auth').exists()).toBe(true)
    expect(wrapper.find('#devsso-theme-toggle').exists()).toBe(false)
    expect(wrapper.find('footer.auth-footer').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('SSO Admin')
    wrapper.unmount()
  })

  it('renders the admin shell and shared parent UI on authenticated admin routes', () => {
    const wrapper = mountApp({
      principal: principalView(),
      routeMeta: { requiresAuth: true },
    })

    expect(wrapper.find('.sidebar').exists()).toBe(true)
    expect(wrapper.find('#devsso-theme-toggle').exists()).toBe(true)
    expect(wrapper.find('#devsso-theme-float.admin-theme-toggle-anchor').exists()).toBe(true)
    expect(wrapper.find('footer.auth-footer.admin-auth-footer').text()).toContain('© 2026 Dev-SSO')
    expect(wrapper.text()).toContain('SSO Admin')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    wrapper.unmount()
  })

  it('clears stale admin cookies when the session cannot be read', async () => {
    const response = await handleSession({ headers: {} } as IncomingMessage)
    const cookie = response.headers?.['set-cookie']
    const serialized = Array.isArray(cookie) ? cookie.join(';') : String(cookie)

    expect(response.status).toBe(401)
    expect(serialized).toContain('__Secure-admin-session=')
    expect(serialized).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })
})

function mountApp(options: {
  readonly principal: AdminSessionView
  readonly routeMeta: Record<string, unknown>
}) {
  routeState.meta = options.routeMeta
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore(pinia).principal = options.principal

  return mount(App, {
    global: {
      plugins: [pinia],
    },
  })
}

function principalView(): AdminSessionView {
  return {
    subject: 'user-1',
    email: 'huanamasi123@gmail.com',
    displayName: 'Tio Pranoto',
    role: 'admin',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    authTime: Math.floor(Date.now() / 1000),
    amr: ['pwd', 'otp'],
    acr: null,
    lastLoginAt: null,
    permissions: {
      view_admin_panel: true,
      manage_sessions: true,
    },
  }
}
