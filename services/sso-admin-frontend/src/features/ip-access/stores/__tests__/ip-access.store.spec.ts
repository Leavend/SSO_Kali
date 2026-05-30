import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/lib/api/api-client'
import { useIpAccessStore } from '../ip-access.store'
import { ipAccessApi } from '../../services/ip-access.api'

vi.mock('../../services/ip-access.api', () => ({
  ipAccessApi: {
    list: vi.fn<() => Promise<unknown>>(),
    create: vi.fn<() => Promise<unknown>>(),
    destroy: vi.fn<() => Promise<unknown>>(),
  },
}))

describe('IpAccessStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loads rules into the store on successful fetch', async () => {
    vi.mocked(ipAccessApi.list).mockResolvedValue({
      rules: [
        {
          id: 1,
          cidr: '10.0.0.0/8',
          mode: 'allow',
          reason: 'Internal',
          expires_at: null,
          actor_subject_id: 'admin-1',
          created_at: '2026-05-30T00:00:00Z',
          updated_at: '2026-05-30T00:00:00Z',
        },
      ],
    })

    const store = useIpAccessStore()
    await store.load()

    expect(store.status).toBe('success')
    expect(store.rules).toHaveLength(1)
    expect(store.rules[0]!.cidr).toBe('10.0.0.0/8')
  })

  it('sets forbidden status on 403', async () => {
    vi.mocked(ipAccessApi.list).mockRejectedValue(
      new ApiError(403, 'Forbidden', 'access_denied', null, 'req-forbidden'),
    )

    const store = useIpAccessStore()
    await store.load()

    expect(store.status).toBe('forbidden')
    expect(store.errorMessage).toContain('izin')
  })

  it('sets unauthenticated status on 401', async () => {
    vi.mocked(ipAccessApi.list).mockRejectedValue(
      new ApiError(401, 'Unauthorized', 'invalid_token', null, 'req-401'),
    )

    const store = useIpAccessStore()
    await store.load()

    expect(store.status).toBe('unauthenticated')
    expect(store.errorMessage).toContain('Login ulang')
  })

  it('sets error status on unknown errors', async () => {
    vi.mocked(ipAccessApi.list).mockRejectedValue(new Error('Network error'))

    const store = useIpAccessStore()
    await store.load()

    expect(store.status).toBe('error')
  })

  it('creates a rule and prepends it to the list', async () => {
    vi.mocked(ipAccessApi.list).mockResolvedValue({ rules: [] })
    vi.mocked(ipAccessApi.create).mockResolvedValue({
      rule: {
        id: 2,
        cidr: '203.0.113.0/24',
        mode: 'block',
        reason: 'Block range',
        expires_at: null,
        actor_subject_id: 'admin-1',
        created_at: '2026-05-30T00:00:00Z',
        updated_at: '2026-05-30T00:00:00Z',
      },
    })

    const store = useIpAccessStore()
    store.rules = []
    await store.create({ cidr: '203.0.113.0/24', mode: 'block', reason: 'Block range' })

    expect(store.actionStatus).toBe('success')
    expect(store.rules).toHaveLength(1)
    expect(store.rules[0]!.cidr).toBe('203.0.113.0/24')
  })

  it('sets step_up_required on 428/412 action errors', async () => {
    vi.mocked(ipAccessApi.create).mockRejectedValue(
      new ApiError(428, 'Step up required', 'reauth_required', null, 'req-step-up'),
    )

    const store = useIpAccessStore()
    await store.create({ cidr: '10.0.0.0/8', mode: 'allow', reason: 'Internal' })

    expect(store.actionStatus).toBe('step_up_required')
  })

  it('destroys a rule and removes it from the list', async () => {
    vi.mocked(ipAccessApi.destroy).mockResolvedValue(undefined)

    const store = useIpAccessStore()
    store.rules = [
      {
        id: 1,
        cidr: '10.0.0.0/8',
        mode: 'allow',
        reason: null,
        expires_at: null,
        actor_subject_id: null,
        created_at: null,
        updated_at: null,
      },
    ]
    await store.destroy(1)

    expect(store.actionStatus).toBe('success')
    expect(store.rules).toHaveLength(0)
  })
})
