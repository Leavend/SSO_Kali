// app/components/ops/__tests__/OpsReadinessCard.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OpsReadinessCard from '@/components/ops/OpsReadinessCard.vue'
import type { OpsReadiness, OpsReadinessLabels } from '@/types/ops.types'

const LABELS: OpsReadinessLabels = {
  ready: 'Ready',
  degraded: 'Degraded',
  database: 'Database',
  redis: 'Redis',
  queue: 'Queue',
  ok: 'OK',
  down: 'Down',
  pending: 'pending',
  failed: 'failed',
  oldest: 'Oldest pending',
}

function mountCard(readiness: OpsReadiness) {
  return mount(OpsReadinessCard, { props: { readiness, labels: LABELS } })
}

describe('OpsReadinessCard', () => {
  it('renders the service + a ready status badge (success tone, never colour-alone)', () => {
    const w = mountCard({ service: 'sso-backend', ready: true, checks: { database: true, redis: true } })
    expect(w.text()).toContain('sso-backend')
    const status = w.find('[data-testid="ops-readiness-status"]')
    expect(status.attributes('data-tone')).toBe('success')
    expect(status.text()).toContain('Ready')
  })

  it('shows the degraded label + danger tone when not ready, and down checks', () => {
    const w = mountCard({ service: 'sso-backend', ready: false, checks: { database: false, redis: true } })
    expect(w.find('[data-testid="ops-readiness-status"]').attributes('data-tone')).toBe('danger')
    expect(w.find('[data-testid="ops-readiness-status"]').text()).toContain('Degraded')
    expect(w.find('[data-testid="ops-check-database"]').attributes('data-tone')).toBe('danger')
    expect(w.find('[data-testid="ops-check-database"]').text()).toContain('Down')
    expect(w.find('[data-testid="ops-check-redis"]').attributes('data-tone')).toBe('success')
  })

  it('renders the queue row with a composed summary when queue is present', () => {
    const w = mountCard({
      service: 'sso-backend',
      ready: true,
      checks: {
        database: true,
        redis: true,
        queue: { pending_jobs: 3, failed_jobs: 1, oldest_pending_age_seconds: 42 },
      },
    })
    const queue = w.find('[data-testid="ops-check-queue"]')
    expect(queue.exists()).toBe(true)
    expect(queue.attributes('data-tone')).toBe('danger') // failed > 0
    expect(queue.text()).toContain('3 pending')
    expect(queue.text()).toContain('1 failed')
  })

  it('omits the queue row when queue is absent', () => {
    const w = mountCard({ service: 'sso-backend', ready: true, checks: { database: true, redis: true } })
    expect(w.find('[data-testid="ops-check-queue"]').exists()).toBe(false)
  })
})
