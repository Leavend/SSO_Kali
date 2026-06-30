import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionsApi } from '../sessions.api'
import { apiClient } from '@/lib/api/api-client'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<(path: string) => Promise<unknown>>(),
    delete: vi.fn<(path: string) => Promise<unknown>>(),
  },
}))

const get = vi.mocked(apiClient.get)
const del = vi.mocked(apiClient.delete)

afterEach(() => {
  vi.clearAllMocks()
})

describe('sessionsApi', () => {
  it('list GETs the sessions endpoint', async () => {
    get.mockResolvedValue({ sessions: [] })
    await sessionsApi.list()
    expect(get).toHaveBeenCalledWith('/api/admin/sessions')
  })

  it('revoke DELETEs the session endpoint', async () => {
    del.mockResolvedValue({ revoked: true, session_id: 'sess_1' })
    await sessionsApi.revoke('sess_1')
    expect(del).toHaveBeenCalledWith('/api/admin/sessions/sess_1')
  })

  it('path-encodes the session id', async () => {
    del.mockResolvedValue({ revoked: true, session_id: 'a/b' })
    await sessionsApi.revoke('a/b')
    expect(del).toHaveBeenCalledWith('/api/admin/sessions/a%2Fb')
  })
})
