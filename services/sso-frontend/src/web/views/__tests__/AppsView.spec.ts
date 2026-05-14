import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AppsView from '../AppsView.vue'
import { useAdminStore } from '../../stores/admin'

function mountAppsView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const admin = useAdminStore()
  admin.loadClients = async () => {}
  const wrapper = mount(AppsView, {
    global: {
      plugins: [pinia],
      stubs: {
        PageHeader: true,
      },
    },
  })

  return { wrapper, admin }
}

describe('AppsView', () => {
  it('centers the empty state application icon and copy on all viewports', async () => {
    const { wrapper, admin } = mountAppsView()
    admin.clients = []
    await wrapper.vm.$nextTick()

    const emptyState = wrapper.find('[data-testid="apps-empty-state"]')
    const emptyIcon = wrapper.find('[data-testid="apps-empty-state-icon"]')

    expect(emptyState.classes()).toContain('items-center')
    expect(emptyState.classes()).toContain('text-center')
    expect(emptyIcon.classes()).toContain('mx-auto')
    expect(emptyIcon.classes()).toContain('grid')
    expect(emptyIcon.classes()).toContain('place-items-center')
  })

  it('keeps application card headings visually balanced when clients exist', async () => {
    const { wrapper, admin } = mountAppsView()
    admin.clients = [
      {
        client_id: 'portal-web',
        type: 'confidential',
        redirect_uris: ['https://example.test/callback'],
        backchannel_logout_uri: null,
        backchannel_logout_internal: true,
      },
    ]
    await wrapper.vm.$nextTick()

    const appCardHeader = wrapper.find('[data-testid="app-card-header"]')

    expect(appCardHeader.classes()).toContain('items-center')
    expect(appCardHeader.classes()).toContain('text-center')
  })
})
