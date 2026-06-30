import { afterEach, describe, expect, it, vi } from 'vitest'
import { policyApi } from '../policy.api'
import { apiClient } from '@/lib/api/api-client'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<(path: string) => Promise<unknown>>(),
    post: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
  },
}))

const get = vi.mocked(apiClient.get)
const post = vi.mocked(apiClient.post)

afterEach(() => {
  vi.clearAllMocks()
})

describe('policyApi', () => {
  it('list GETs the category-scoped endpoint', async () => {
    get.mockResolvedValue({ category: 'password', active: {}, policies: [] })
    await policyApi.list('password')
    expect(get).toHaveBeenCalledWith('/api/admin/security-policies/password')
  })

  it('propose POSTs the payload + reason to the category endpoint', async () => {
    post.mockResolvedValue({ policy: {} })
    await policyApi.propose('session', { payload: { idle_timeout_minutes: 15 }, reason: 'tighten' })
    expect(post).toHaveBeenCalledWith('/api/admin/security-policies/session', {
      payload: { idle_timeout_minutes: 15 },
      reason: 'tighten',
    })
  })

  it('activate POSTs to the version activate endpoint', async () => {
    post.mockResolvedValue({ policy: {} })
    await policyApi.activate('mfa', 4, { reason: 'go live' })
    expect(post).toHaveBeenCalledWith('/api/admin/security-policies/mfa/4/activate', {
      reason: 'go live',
    })
  })

  it('rollback POSTs to the version rollback endpoint', async () => {
    post.mockResolvedValue({ policy: {} })
    await policyApi.rollback('lockout', 2, { reason: 'revert' })
    expect(post).toHaveBeenCalledWith('/api/admin/security-policies/lockout/2/rollback', {
      reason: 'revert',
    })
  })

  it('path-encodes the category segment', async () => {
    get.mockResolvedValue({ category: 'legal_hold', active: {}, policies: [] })
    await policyApi.list('legal_hold')
    expect(get).toHaveBeenCalledWith('/api/admin/security-policies/legal_hold')
  })
})
