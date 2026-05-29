import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OpsPage from '../OpsPage.vue'
import { useOpsStore } from '../../stores/ops.store'

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
    expect(wrapper.text()).toContain('req-ops-1')
    expect(wrapper.text()).not.toMatch(/Bearer|metrics token|secret|SQLSTATE/u)
  })

  it('renders safe forbidden state', () => {
    const store = useOpsStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat ops evidence.'

    const wrapper = mount(OpsPage)

    expect(wrapper.text()).toContain('Akses ops evidence ditolak')
    expect(wrapper.text()).not.toContain('SQLSTATE')
  })

  it('renders empty state when no ops readiness evidence is available', () => {
    const store = useOpsStore()
    store.status = 'success'
    store.readiness = null

    const wrapper = mount(OpsPage)

    expect(wrapper.text()).toContain('Belum ada evidence operasional untuk ditampilkan.')
  })
})
