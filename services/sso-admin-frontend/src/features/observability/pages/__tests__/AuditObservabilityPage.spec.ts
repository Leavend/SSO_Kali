import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AuditObservabilityPage from '../AuditObservabilityPage.vue'
import { useObservabilityStore } from '../../stores/observability.store'

describe('AuditObservabilityPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the observability cockpit and keeps compliance evidence reachable', async () => {
    const store = useObservabilityStore()
    store.status = 'success'
    store.requestId = 'req-observability-1'
    store.summary = {
      generated_at: '2026-06-21T00:00:00Z',
      partial: false,
      degraded: [],
      services: [
        {
          key: 'sso-backend',
          name: 'SSO-Backend',
          status: 'healthy',
          summary: 'Database and Redis readiness checks passed.',
          freshness_seconds: 15,
          queue: { pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null },
        },
        {
          key: 'sso-portal',
          name: 'SSO-Portal',
          status: 'healthy',
          summary: 'Portal BFF path is reachable.',
          freshness_seconds: 0,
        },
        {
          key: 'admin-sso',
          name: 'Admin-SSO',
          status: 'healthy',
          summary: 'Admin BFF path is reachable.',
          freshness_seconds: 15,
        },
      ],
      metrics: {
        window_seconds: 900,
        freshness_seconds: 30,
        queue: { pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null },
        auth_funnel: { total_15m: 12, succeeded_15m: 11, failed_15m: 1, failure_rate_percent: 8.33 },
        admin_activity: { total_15m: 4, denied_15m: 0, denied_rate_percent: 0 },
      },
      freshness: {
        recent_events_seconds: 5,
      },
      logs: [
        {
          id: '01LOG',
          service: 'admin-sso',
          severity: 'info',
          message: 'admin_api',
          reference: 'REF-OBSLOG1',
          occurred_at: '2026-06-21T00:00:00Z',
        },
      ],
      traces: {
        status: 'unavailable',
        reason: 'Distributed tracing is not instrumented yet.',
        next_step: 'Propagate traceparent.',
        last_seen_trace_id: null,
      },
    }

    const wrapper = mount(AuditObservabilityPage, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a data-test="router-link"><slot /></a>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('Metrics, Logs, Traces')
    expect(wrapper.text()).toContain('SSO-Backend')
    expect(wrapper.text()).toContain('SSO-Portal')
    expect(wrapper.text()).toContain('Admin-SSO')
    expect(wrapper.text()).toContain('Compliance evidence')
    expect(wrapper.text()).toContain('refreshed about every 30s')
    expect(wrapper.text()).toContain('live')
    expect(wrapper.text()).not.toContain('Request Rate')
    expect(wrapper.text()).not.toContain('Error Rate')

    await wrapper.findAll('button').find((button) => button.text().includes('Logs'))?.trigger('click')
    expect(wrapper.text()).toContain('Recent correlated events')
    expect(wrapper.text()).toContain('refreshed about every 5s')
    expect(wrapper.text()).toContain('REF-OBSLOG1')

    await wrapper.findAll('button').find((button) => button.text().includes('Traces'))?.trigger('click')
    expect(wrapper.text()).toContain('Distributed traces')
    expect(wrapper.text()).toContain('Propagate traceparent')
  })
})
