import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ConnectedAppsPage from '../ConnectedAppsPage.vue'
import { profileApi } from '@/services/profile.api'
import { useProfileStore } from '@/stores/profile.store'
import type { ConnectedApp } from '@/types/profile.types'

vi.mock('@/services/profile.api', () => ({
  profileApi: {
    getConnectedApps: vi.fn().mockResolvedValue([]),
    revokeConnectedApp: vi.fn().mockResolvedValue({
      client_id: 'bontang-civic-dashboard',
      revoked: true,
      revoked_refresh_tokens: 2,
    }),
  },
}))

const connectedApp: ConnectedApp = {
  client_id: 'bontang-civic-dashboard',
  display_name: 'Bontang Civic Dashboard',
  first_connected_at: '2026-05-12T08:00:00Z',
  last_used_at: '2026-05-20T17:35:00Z',
  expires_at: '2026-06-20T17:35:00Z',
  active_refresh_tokens: 2,
  scopes: ['profile.read', 'email', 'sessions.revoke', 'offline_access'],
  description: 'Dashboard manajemen data kota Bontang — aplikasi web resmi Pemda.',
  category: 'Web App Internal',
  logo_initials: 'BCD',
}

const dormantApp: ConnectedApp = {
  client_id: 'ops-mobile-app',
  display_name: 'Operations Mobile App',
  first_connected_at: '2026-05-10T09:15:00Z',
  last_used_at: '2026-05-19T21:10:00Z',
  expires_at: '2026-06-19T21:10:00Z',
  active_refresh_tokens: 0,
  scopes: ['profile.read', 'email'],
  description: 'Aplikasi mobile operasional untuk akses lapangan.',
  category: 'Mobile App',
  logo_initials: 'OMA',
}

describe('ConnectedAppsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function mountPage(apps: readonly ConnectedApp[]): Promise<ReturnType<typeof mount>> {
    vi.mocked(profileApi.getConnectedApps).mockResolvedValue(apps)
    const profile = useProfileStore()
    profile.connectedApps = apps

    const wrapper = mount(ConnectedAppsPage, {
      global: {
        stubs: {
          ConfirmDialog: {
            props: ['open', 'title', 'description', 'confirmLabel'],
            emits: ['confirm'],
            template: `
              <section v-if="open" data-testid="connected-app-confirm-dialog">
                <h2>{{ title }}</h2>
                <p>{{ description }}</p>
                <button data-testid="connected-app-confirm-action" @click="$emit('confirm')">{{ confirmLabel }}</button>
              </section>
            `,
          },
          Skeleton: true,
        },
      },
    })

    await flushPromises()
    await nextTick()
    return wrapper
  }

  it('centers and explains the empty state', async () => {
    const wrapper = await mountPage([])

    const emptyState = wrapper.find('[data-testid="connected-apps-empty-state"]')
    const emptyIcon = wrapper.find('[data-testid="connected-apps-empty-icon"]')
    const emptyCopy = wrapper.find('[data-testid="connected-apps-empty-copy"]')

    expect(emptyState.classes()).toContain('items-center')
    expect(emptyIcon.classes()).toContain('mx-auto')
    expect(wrapper.text()).toContain('Belum ada aplikasi yang terhubung.')
    expect(emptyCopy.text()).toContain('Aplikasi yang kamu otorisasi melalui Dev-SSO')
  })

  it('shows scopes, active state, app identity, and sensitive-scope warning', async () => {
    const wrapper = await mountPage([connectedApp])

    expect(wrapper.text()).toContain('Aplikasi yang saat ini memiliki akses')
    expect(wrapper.text()).not.toContain('OAuth Clients')
    expect(wrapper.find('[data-testid="connected-app-avatar"]').text()).toBe('BCD')
    expect(wrapper.text()).toContain('Sedang dipakai')
    expect(wrapper.text()).toContain('Dashboard manajemen data kota Bontang')
    expect(wrapper.text()).toContain('Web App Internal')
    expect(wrapper.text()).toContain('profile.read')
    expect(wrapper.text()).toContain('email')
    expect(wrapper.text()).toContain('sessions.revoke')
    expect(wrapper.text()).toContain('offline_access')
    expect(wrapper.text()).toContain(
      'Aplikasi ini memiliki akses ke sesi dan dapat memperbarui token tanpa login ulang.',
    )
    expect(wrapper.text()).toContain('Terhubung')
    expect(wrapper.text()).toContain('12 Mei 2026')
    expect(wrapper.text()).toContain('Terakhir Dipakai')
    expect(wrapper.text()).toContain('20 Mei 2026')
  })

  it('hides technical client ID until details are expanded', async () => {
    const wrapper = await mountPage([connectedApp])

    expect(wrapper.text()).not.toContain('Client ID:')

    const detailButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Lihat Detail'))
    expect(detailButton?.attributes('aria-expanded')).toBe('false')

    await detailButton?.trigger('click')
    await nextTick()

    expect(wrapper.html()).toContain('connected-app-details')
    expect(wrapper.find('[data-testid="connected-app-details"]').text()).toContain('Aplikasi:')
    expect(wrapper.find('[data-testid="connected-app-details"]').text()).toContain(
      'Bontang Civic Dashboard',
    )
    expect(wrapper.find('[data-testid="connected-app-details"]').text()).not.toContain(
      'bontang-civic-dashboard',
    )
  })

  it('requires confirmation before revoking connected app access', async () => {
    const wrapper = await mountPage([connectedApp])

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Cabut Akses'))
      ?.trigger('click')
    await flushPromises()

    expect(profileApi.revokeConnectedApp).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="connected-app-confirm-dialog"]').text()).toContain(
      'Cabut akses Bontang Civic Dashboard?',
    )
    expect(wrapper.find('[data-testid="connected-app-confirm-dialog"]').text()).toContain(
      'Aplikasi tidak bisa lagi mengakses akun kamu sampai kamu otorisasi ulang.',
    )
    expect(wrapper.find('[data-testid="connected-app-confirm-action"]').text()).toContain(
      'Ya, Cabut Akses',
    )

    await wrapper.find('[data-testid="connected-app-confirm-action"]').trigger('click')
    await flushPromises()

    expect(profileApi.revokeConnectedApp).toHaveBeenCalledWith('bontang-civic-dashboard')
  })

  it('surfaces dormant usage context for older apps', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-23T21:10:00Z'))

    const wrapper = await mountPage([dormantApp])

    expect(wrapper.text()).toContain('OMA')
    expect(wrapper.text()).toContain('Mobile App')
    expect(wrapper.text()).toContain('4 hari lalu')

    vi.useRealTimers()
  })
})
