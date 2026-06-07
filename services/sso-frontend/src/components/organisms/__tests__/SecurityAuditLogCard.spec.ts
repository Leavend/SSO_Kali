import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SecurityAuditLogCard from '../SecurityAuditLogCard.vue'
import { knownLoginIpAddresses } from '@/lib/portal-security'
import type { AuditEvent } from '@/types/audit.types'

const events: readonly AuditEvent[] = [
  {
    id: 'login-1',
    event: 'login',
    ip_address: '103.88.12.10',
    user_agent: 'Chrome macOS',
    created_at: '2026-05-20T18:25:00Z',
  },
  {
    id: 'revoked-1',
    event: 'session_revoked',
    ip_address: '36.82.10.20',
    user_agent: 'Mobile Safari iOS',
    created_at: '2026-05-18T09:18:00Z',
  },
]

describe('SecurityAuditLogCard', () => {
  it('renders a loading state', () => {
    const wrapper = mount(SecurityAuditLogCard, {
      props: { events: [], knownLoginIps: new Set(), isPending: true },
      global: { stubs: { Skeleton: true } },
    })

    expect(wrapper.findAll('.h-10.w-full.rounded-lg')).toHaveLength(3)
  })

  it('renders normal and risky audit events with readable labels', () => {
    const wrapper = mount(SecurityAuditLogCard, {
      props: { events, knownLoginIps: knownLoginIpAddresses(events), isPending: false },
    })

    const rows = wrapper.findAll('[data-testid="audit-event-row"]')
    const riskyRow = rows.find((row) => row.text().includes('Sesi Keluar Otomatis'))

    expect(wrapper.text()).toContain('Login Berhasil')
    expect(wrapper.text()).toContain('20 Mei 2026')
    expect(riskyRow?.text()).toContain('36.82.10.20')
    expect(wrapper.text()).toContain('Riwayat Keamanan Terbaru')
    expect(riskyRow?.text()).toContain('Aktivitas sensitif terdeteksi dari IP yang tidak dikenal')
    expect(riskyRow?.classes().join(' ')).toContain('border-error-700/40')
    expect(wrapper.text()).not.toContain('session_revoked')
  })
})
