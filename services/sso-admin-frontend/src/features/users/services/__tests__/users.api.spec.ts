import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { usersApi } from '../users.api'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<() => Promise<unknown>>(),
    post: vi.fn<() => Promise<unknown>>(),
  },
}))

describe('usersApi', () => {
  it('uses explicit admin BFF routes for user lifecycle', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ users: [] })
    vi.mocked(apiClient.post).mockResolvedValue({ user: { subject_id: 'sub_admin' } })

    await usersApi.list()
    await usersApi.show('sub_admin')
    await usersApi.lock('sub_admin', { reason: 'Security review' })
    await usersApi.unlock('sub_admin', { reason: 'Review complete' })
    await usersApi.deactivate('sub_admin', { reason: 'Offboarding' })
    await usersApi.reactivate('sub_admin')
    await usersApi.issuePasswordReset('sub_admin')
    await usersApi.resetMfa('sub_admin', { reason: 'Lost factor' })

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/admin/users')
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/admin/users/sub_admin')
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/admin/users/sub_admin/lock', {
      reason: 'Security review',
    })
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/api/admin/users/sub_admin/unlock', {
      reason: 'Review complete',
    })
    expect(apiClient.post).toHaveBeenNthCalledWith(3, '/api/admin/users/sub_admin/deactivate', {
      reason: 'Offboarding',
    })
    expect(apiClient.post).toHaveBeenNthCalledWith(4, '/api/admin/users/sub_admin/reactivate')
    expect(apiClient.post).toHaveBeenNthCalledWith(5, '/api/admin/users/sub_admin/password-reset')
    expect(apiClient.post).toHaveBeenNthCalledWith(6, '/api/admin/users/sub_admin/reset-mfa', {
      reason: 'Lost factor',
    })
  })

  it('posts create payload to POST /api/admin/users', async () => {
    const response = { user: { subject_id: 'sub_new', email: 'new@example.test' } }
    vi.mocked(apiClient.post).mockResolvedValue(response)

    const payload = {
      email: 'new@example.test',
      display_name: 'New User',
      role: 'user' as const,
      local_account_enabled: true,
    }
    await usersApi.create(payload)

    expect(apiClient.post).toHaveBeenCalledWith('/api/admin/users', payload)
  })

  it('posts sync profile payload to POST /api/admin/users/:subjectId/sync-profile', async () => {
    const response = { user: { subject_id: 'sub_admin', email: 'synced@example.test' } }
    vi.mocked(apiClient.post).mockResolvedValue(response)

    const payload = { email: 'synced@example.test', display_name: 'Synced User' }
    await usersApi.syncProfile('sub_admin', payload)

    expect(apiClient.post).toHaveBeenCalledWith('/api/admin/users/sub_admin/sync-profile', payload)
  })
})
