// app/components/auth-audit/__tests__/AuthAuditTable.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AuthAuditTable from '@/components/auth-audit/AuthAuditTable.vue'
import type { AuthAuditEvent } from '@/types/auth-audit.types'

function event(over: Partial<AuthAuditEvent> = {}): AuthAuditEvent {
  return {
    event_id: 'EV1',
    event_type: 'user.login',
    outcome: 'failed',
    subject: { subject_id: '01HSUB', email: 'user@example.gov' },
    client_id: 'portal',
    session_id: 'sess_1',
    request: { ip_address: '203.0.113.9', user_agent: 'UA', request_id: 'req_1' },
    error_code: 'invalid_credentials',
    context: {},
    occurred_at: '2026-06-28T14:32:15+00:00',
    ...over,
  }
}

function mountTable(events: AuthAuditEvent[]) {
  return mount(AuthAuditTable, {
    props: {
      events,
      caption: 'Authentication events',
      occurredLabel: 'Occurred',
      typeLabel: 'Type',
      outcomeLabel: 'Outcome',
      subjectLabel: 'Subject',
      ipLabel: 'IP',
      outcomeText: (o: string) => ({ failed: 'Failed', succeeded: 'Succeeded' })[o] ?? o,
    },
  })
}

describe('AuthAuditTable', () => {
  it('renders a row per event with the outcome badge (tone + label, never colour-alone)', () => {
    const w = mountTable([event(), event({ event_id: 'EV2', outcome: 'succeeded' })])
    expect(w.find('[data-testid="auth-audit-select-EV1"]').exists()).toBe(true)
    expect(w.find('[data-testid="auth-audit-select-EV2"]').exists()).toBe(true)
    const badge = w.find('[data-testid="auth-audit-outcome-EV1"]')
    expect(badge.attributes('data-tone')).toBe('danger') // failed
    expect(badge.text()).toContain('Failed')
  })

  it('shows email as the subject (allowed display field) and the event type + ip', () => {
    const w = mountTable([event()])
    expect(w.text()).toContain('user@example.gov')
    expect(w.text()).toContain('user.login')
    expect(w.text()).toContain('203.0.113.9')
  })

  it('emits select with the event_id when the row button is clicked', async () => {
    const w = mountTable([event()])
    await w.find('[data-testid="auth-audit-select-EV1"]').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual(['EV1'])
  })

  it('falls back to subject_id then em dash when email is null', () => {
    const w = mountTable([event({ subject: { subject_id: '01HSUB', email: null } })])
    expect(w.text()).toContain('01HSUB')
  })
})
