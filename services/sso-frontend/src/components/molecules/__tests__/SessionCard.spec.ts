import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionCard from '../SessionCard.vue'
import type { UserSessionSummary } from '@/types/profile.types'

const session: UserSessionSummary = {
  session_id: 'session-mobile-1',
  user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  opened_at: '2026-05-13T08:00:00Z',
  last_used_at: '2026-05-13T08:30:00Z',
  expires_at: '2026-05-13T12:00:00Z',
  is_current: false,
  client_count: 2,
  client_ids: ['portal', 'mobile-companion'],
  client_display_names: ['Portal Pengguna', 'Mobile Companion With A Very Long Name'],
}

describe('SessionCard', () => {
  it('uses a compact responsive grid with centered device icon', () => {
    const wrapper = mount(SessionCard, {
      props: { session, pending: false },
    })

    const card = wrapper.find('[data-testid="session-card"]')
    const icon = wrapper.find('[data-testid="session-card-icon"]')

    expect(card.classes()).toContain('grid')
    expect(card.classes()).toContain('min-w-0')
    expect(card.classes()).toContain('grid-cols-[2.5rem_minmax(0,1fr)_2.5rem]')
    expect(card.classes()).toContain('sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]')
    expect(icon.classes()).toContain('self-start')
    expect(icon.classes()).toContain('justify-self-center')
  })

  it('keeps long session metadata from overflowing on narrow screens', () => {
    const wrapper = mount(SessionCard, {
      props: { session, pending: false },
    })

    const content = wrapper.find('[data-testid="session-card-content"]')
    const titleRow = wrapper.find('[data-testid="session-card-title-row"]')
    const clients = wrapper.find('[data-testid="session-card-clients"]')
    const metadata = wrapper.find('[data-testid="session-card-metadata"]')
    const openedAt = wrapper.find('[data-testid="session-opened-at"]')
    const lastUsedAt = wrapper.find('[data-testid="session-last-used-at"]')
    const expiresAt = wrapper.find('[data-testid="session-expires-at"]')

    expect(content.classes()).toContain('min-w-0')
    expect(titleRow.classes()).toContain('min-w-0')
    expect(clients.classes()).toContain('truncate')
    expect(metadata.classes()).toContain('grid')
    expect(metadata.classes()).toContain('min-w-0')
    expect(metadata.classes()).toContain('sm:grid-cols-2')
    expect(openedAt.classes()).toContain('tabular-nums')
    expect(lastUsedAt.classes()).toContain('tabular-nums')
    expect(expiresAt.classes()).toContain('truncate')
  })

  it('renders the revoke action as icon-only on mobile and restores text on larger screens', () => {
    const wrapper = mount(SessionCard, {
      props: { session, pending: false },
    })

    const button = wrapper.find('[data-testid="session-revoke-button"]')
    const label = wrapper.find('[data-testid="session-revoke-label"]')

    expect(button.classes()).toContain('size-10')
    expect(button.classes()).toContain('md:h-9')
    expect(button.classes()).toContain('md:w-fit')
    expect(button.classes()).toContain('md:px-3')
    expect(label.classes()).toContain('session-card__revoke-label')
  })
})
