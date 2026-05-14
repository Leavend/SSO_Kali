import { describe, expect, it } from 'vitest'
import { RouterLinkStub, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import App from '../App.vue'
import { useAdminStore } from '../stores/admin'

async function mountAdminApp() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const admin = useAdminStore()
  admin.principal = {
    subject: 'admin-1',
    displayName: 'Admin With Very Long Display Name',
    email: 'very.long.admin.email@example-company.internal',
    role: 'admin',
    expiresAt: 1_777_000_000,
    authTime: null,
    amr: [],
    acr: null,
    lastLoginAt: null,
    permissions: { view_admin_panel: true, manage_sessions: true },
  }
  admin.bootstrap = async () => {}
  admin.refreshWhenNeeded = async () => {}

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/sessions', component: { template: '<div />' }, meta: { requiresAuth: true } }],
  })
  await router.push('/sessions')
  await router.isReady()

  return mount(App, {
    global: {
      plugins: [pinia, router],
      stubs: {
        AdminHeader: true,
        AuthFooter: true,
        BottomNav: true,
        CommandPalette: true,
        FloatingActions: true,
        RouterLink: RouterLinkStub,
        RouterView: { template: '<div />' },
        ToastContainer: true,
        Transition: false,
      },
    },
  })
}

describe('App admin shell responsiveness', () => {
  it('clips horizontal overflow and constrains the admin content shell on narrow viewports', async () => {
    const wrapper = await mountAdminApp()

    const shell = wrapper.find('[data-testid="admin-app-shell"]')
    const contentShell = wrapper.find('[data-testid="admin-content-shell"]')
    const mainSurface = wrapper.find('[data-testid="admin-main-surface"]')

    expect(shell.classes()).toContain('app-shell--responsive')
    expect(contentShell.classes()).toContain('admin-content-shell--responsive')
    expect(mainSurface.classes()).toContain('main-surface--responsive')
  })
})
