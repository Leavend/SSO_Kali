// app/components/auth-audit/__tests__/AuthAuditFilterBar.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AuthAuditFilterBar from '@/components/auth-audit/AuthAuditFilterBar.vue'

const LABELS = {
  title: 'Filter events',
  outcome: 'Outcome',
  outcomeAll: 'All outcomes',
  outcomeSucceeded: 'Succeeded',
  outcomeFailed: 'Failed',
  outcomeStarted: 'Started',
  eventType: 'Event type',
  subjectId: 'Account code',
  from: 'From',
  to: 'To',
  filter: 'Filter',
  reset: 'Reset',
}

function mountBar() {
  return mount(AuthAuditFilterBar, { props: { labels: LABELS } })
}

describe('AuthAuditFilterBar', () => {
  it('emits search with the entered filters on submit', async () => {
    const w = mountBar()
    await w.find('[data-testid="auth-audit-filter-event-type"]').setValue('user.login')
    await w.find('[data-testid="auth-audit-filter-subject-id"]').setValue('01HSUB')
    await w.find('[data-testid="auth-audit-filter-form"]').trigger('submit')
    const emitted = w.emitted('search')?.[0]?.[0] as Record<string, unknown>
    expect(emitted.event_type).toBe('user.login')
    expect(emitted.subject_id).toBe('01HSUB')
  })

  it('emits reset and clears the inputs', async () => {
    const w = mountBar()
    const eventType = w.find('[data-testid="auth-audit-filter-event-type"]')
    await eventType.setValue('user.login')
    await w.find('[data-testid="auth-audit-filter-reset"]').trigger('click')
    expect(w.emitted('reset')).toHaveLength(1)
    expect((eventType.element as HTMLInputElement).value).toBe('')
  })

  it('renders the four outcome options via the UiSelect :options prop', () => {
    const w = mountBar()
    const options = w.find('[data-testid="auth-audit-filter-outcome"]').findAll('option')
    expect(options).toHaveLength(4)
    expect(options[0]?.text()).toBe(LABELS.outcomeAll)
    expect(options[2]?.attributes('value')).toBe('failed')
  })
})
