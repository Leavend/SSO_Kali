import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OpsPage from '../OpsPage.vue'
import { useOpsStore } from '../../stores/ops.store'
import { OPS_DRILLS } from '../../drills'

const readyReadiness = {
  service: 'sso-backend',
  ready: true,
  checks: {
    database: true,
    redis: true,
    queue: {
      pending_jobs: 0,
      failed_jobs: 0,
      oldest_pending_age_seconds: null,
    },
  },
} as const

describe('OpsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders readiness, drill evidence placeholders, and request evidence', () => {
    const store = useOpsStore()
    store.status = 'success'
    store.requestId = 'req-ops-1'
    store.readiness = {
      service: 'sso-backend',
      ready: true,
      checks: {
        database: true,
        redis: true,
        queue: {
          pending_jobs: 0,
          failed_jobs: 0,
          oldest_pending_age_seconds: null,
        },
      },
    }

    const wrapper = mount(OpsPage)

    expect(wrapper.text()).toContain('Ops Evidence')
    expect(wrapper.text()).toContain('sso-backend')
    expect(wrapper.text()).toContain('ready')
    expect(wrapper.text()).toContain('JWKS rotation drill')
    expect(wrapper.text()).toContain('SIEM sink verification')
    expect(wrapper.text()).toContain('Backup restore drill')
    expect(wrapper.text()).toContain('DR failover drill')
    expect(wrapper.text()).toContain('REF-REQOPS1')
    expect(wrapper.text()).not.toContain('req-ops-1')
    expect(wrapper.text()).toContain('Lihat evidence')
    expect(wrapper.text()).not.toMatch(/Bearer|metrics token|secret|SQLSTATE/u)
  })

  it('renders safe forbidden state', () => {
    const store = useOpsStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat ops evidence.'

    const wrapper = mount(OpsPage)

    expect(wrapper.text()).toContain('Ops evidence access denied')
    expect(wrapper.text()).not.toContain('SQLSTATE')
  })

  it('renders empty state when no ops readiness evidence is available', () => {
    const store = useOpsStore()
    store.status = 'success'
    store.readiness = null

    const wrapper = mount(OpsPage)

    expect(wrapper.text()).toContain('No operational evidence to display.')
    expect(wrapper.find('.ui-empty-state').exists()).toBe(true)
  })

  it('uses shared loading and status primitives', async () => {
    const store = useOpsStore()
    store.status = 'loading'

    const wrapper = mount(OpsPage)

    expect(wrapper.find('.ui-skeleton').exists()).toBe(true)

    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat ops evidence.'
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.ui-status-view').exists()).toBe(true)
  })

  it('renders a runbook link and system of record for every drill, not a confusing placeholder', () => {
    const store = useOpsStore()
    store.status = 'success'
    store.readiness = readyReadiness

    const wrapper = mount(OpsPage)

    const runbookLinks = wrapper.findAll('a.runbook-link')
    expect(runbookLinks).toHaveLength(OPS_DRILLS.length)

    for (const link of runbookLinks) {
      const href = link.attributes('href') ?? ''
      expect(href).toMatch(/^https:\/\/github\.com\/.+\/docs\/.+\.(md|yml)$/)
      expect(link.attributes('rel')).toContain('noopener')
    }

    // Evidence links rendered for drills that have evidenceRef
    const drillsWithEvidence = OPS_DRILLS.filter((d) => d.evidenceRef !== undefined)
    const evidenceLinks = wrapper.findAll('a.evidence-link')
    expect(evidenceLinks).toHaveLength(drillsWithEvidence.length)

    for (const link of evidenceLinks) {
      const href = link.attributes('href') ?? ''
      expect(href).toMatch(/^https:\/\/github\.com\/.+\/docs\/ops\/evidence\/.+\.md$/)
      expect(link.attributes('rel')).toContain('noopener')
    }

    // Real system-of-record references replace the old stub copy.
    expect(wrapper.text()).toContain('jwks-rotation-simulation.yml')
    expect(wrapper.text()).toContain('backup-restore-drill.yml')
    expect(wrapper.text()).not.toContain('belum tersedia di backend admin contract')
  })
})
