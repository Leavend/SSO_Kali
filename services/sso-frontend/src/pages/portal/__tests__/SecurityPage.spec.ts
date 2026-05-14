import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SecurityPage from '../SecurityPage.vue'

vi.mock('@/services/profile.api', () => ({
  profileApi: {
    getAuditEvents: vi.fn().mockResolvedValue({
      events: [
        {
          id: 1,
          event: 'login.succeeded',
          ip_address: '127.0.0.1',
          created_at: '2026-05-13T08:30:00Z',
        },
      ],
    }),
    getProfile: vi.fn().mockResolvedValue({
      profile: { status: 'active' },
      authorization: { scope: '', roles: [], permissions: [] },
      security: { session_id: 'current', risk_score: 0, mfa_required: false, last_seen_at: null },
    }),
    changePassword: vi.fn().mockResolvedValue({ message: 'Password berhasil diperbarui.' }),
  },
}))

describe('SecurityPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders password form actions as mobile-first full-width controls', async () => {
    const wrapper = mount(SecurityPage, {
      global: {
        stubs: {
          RouterLink: true,
          Skeleton: true,
        },
      },
    })

    await flushPromises()
    await nextTick()
    await wrapper.find('[data-testid="password-form-toggle"]').trigger('click')
    await nextTick()

    const actionRow = wrapper.find('[data-testid="password-form-actions"]')
    const buttons = actionRow.findAll('button')

    expect(actionRow.classes()).toContain('flex-col')
    expect(actionRow.classes()).toContain('sm:flex-row')
    expect(buttons[0]?.classes()).toContain('w-full')
    expect(buttons[1]?.classes()).toContain('w-full')
  })

  it('keeps audit event rows safe for narrow mobile widths', async () => {
    const wrapper = mount(SecurityPage, {
      global: {
        stubs: {
          RouterLink: true,
          Skeleton: true,
        },
      },
    })

    await flushPromises()
    await nextTick()

    const auditList = wrapper.find('[data-testid="audit-events-list"]')
    const auditRowMeta = wrapper.find('[data-testid="audit-event-meta"]')
    const auditEventBadge = wrapper.find('[data-testid="audit-event-badge"]')
    const auditIpAddress = wrapper.find('[data-testid="audit-event-ip-address"]')

    expect(auditList.classes()).toContain('min-w-0')
    expect(auditRowMeta.classes()).toContain('grid')
    expect(auditRowMeta.classes()).toContain('grid-cols-[minmax(0,1fr)_auto]')
    expect(auditEventBadge.classes()).toContain('truncate')
    expect(auditIpAddress.classes()).toContain('whitespace-nowrap')
  })
})
