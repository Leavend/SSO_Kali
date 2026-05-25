import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionCard from '../SessionCard.vue'
import type { UserSessionSummary } from '@/types/profile.types'

const currentSession: UserSessionSummary = {
  session_id: 'session-current',
  user_agent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  ip_address: '103.88.12.10',
  location: 'Bontang, Kalimantan Timur',
  opened_at: '2026-05-20T16:30:00Z',
  last_used_at: '2026-05-20T18:42:00Z',
  expires_at: '2026-05-21T02:42:00Z',
  is_current: true,
  client_count: 2,
  client_ids: ['portal', 'dashboard'],
  client_display_names: ['Dev-SSO Portal', 'Bontang Civic Dashboard'],
}

const foreignSession: UserSessionSummary = {
  session_id: 'session-mobile-1',
  user_agent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  ip_address: '36.82.10.20',
  location: null,
  opened_at: '2026-05-19T07:30:00Z',
  last_used_at: '2026-05-20T10:11:00Z',
  expires_at: '2026-05-20T22:11:00Z',
  is_current: false,
  client_count: 1,
  client_ids: ['mobile-companion'],
  client_display_names: ['Mobile Companion With A Very Long Name'],
}

describe('SessionCard', () => {
  it('shows current session details without a revoke action', () => {
    const wrapper = mount(SessionCard, {
      props: { session: currentSession, pending: false, currentIp: '103.88.12.10' },
    })

    expect(wrapper.text()).toContain('Chrome · macOS · Mac')
    expect(wrapper.text()).toContain('Sesi Aktif Saat Ini')
    expect(wrapper.text()).toContain('103.88.12.10')
    expect(wrapper.text()).toContain('Bontang, Kalimantan Timur')
    expect(wrapper.text()).toContain('21/05/26, 00:30')
    expect(wrapper.text()).toContain('Token kedaluwarsa: 21/05/26, 10:42')
    expect(wrapper.text()).toContain('Untuk keluar dari perangkat ini, gunakan tombol Logout')
    expect(wrapper.find('[data-testid="session-revoke-button"]').exists()).toBe(false)
  })

  it('highlights unfamiliar IP sessions and emits revoke only for other sessions', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-21T10:11:00Z'))

    const wrapper = mount(SessionCard, {
      props: { session: foreignSession, pending: false, currentIp: '103.88.12.10' },
    })

    expect(wrapper.text()).toContain('Safari · iOS · iPhone')
    expect(wrapper.text()).toContain('36.82.10.20')
    expect(wrapper.text()).toContain('Lokasi tidak dikenal')
    expect(wrapper.text()).toContain('1 hari lalu')
    expect(wrapper.find('[data-testid="session-last-used-relative"]').attributes('title')).toBe(
      '20/05/26, 18:11',
    )
    expect(wrapper.text()).toContain(
      'Sesi ini dibuka dari IP yang belum pernah digunakan sebelumnya',
    )
    expect(wrapper.classes()).toContain('border-error-700/40')
    expect(wrapper.classes()).toContain('dark:border-error-700/50')
    expect(wrapper.classes()).toContain('dark:bg-error-950/25')
    expect(wrapper.find('[data-testid="session-risk-warning"]').classes()).toContain(
      'dark:text-error-300',
    )

    await wrapper.find('[data-testid="session-revoke-button"]').trigger('click')
    expect(wrapper.emitted('revoke')?.[0]).toEqual(['session-mobile-1'])

    vi.useRealTimers()
  })

  it('marks sessions inactive after seven days and keeps metadata from overflowing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-28T10:11:00Z'))

    const wrapper = mount(SessionCard, {
      props: { session: foreignSession, pending: false, currentIp: '103.88.12.10' },
    })

    const content = wrapper.find('[data-testid="session-card-content"]')
    const titleRow = wrapper.find('[data-testid="session-card-title-row"]')
    const clients = wrapper.find('[data-testid="session-card-clients"]')
    const revokeButton = wrapper.find('[data-testid="session-revoke-button"]')
    const actionElement = revokeButton.element.parentElement

    if (!(actionElement instanceof HTMLElement)) {
      throw new Error('Missing session card action container.')
    }

    expect(wrapper.classes()).toContain('md:grid-cols-[2.75rem_minmax(0,1fr)_auto]')
    expect(wrapper.classes()).not.toContain('sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]')
    expect(content.classes()).toContain('min-w-0')
    expect(titleRow.classes()).toContain('min-w-0')
    expect(clients.classes()).toContain('truncate')
    expect(actionElement.className).toContain('w-full')
    expect(actionElement.className).toContain('md:justify-end')
    expect(revokeButton.classes()).toContain('md:w-fit')
    expect(revokeButton.classes()).not.toContain('sm:w-fit')
    expect(wrapper.text()).toContain('Tidak aktif')

    vi.useRealTimers()
  })
})
