import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { sessionsApi } from '../sessions.api'

describe('sessions.api', () => {
  let getSpy: ReturnType<typeof vi.spyOn>
  let deleteSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    getSpy = vi.spyOn(apiClient, 'get')
    deleteSpy = vi.spyOn(apiClient, 'delete')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('list()', () => {
    it('calls GET /api/admin/sessions', async () => {
      const expected = { sessions: [] }
      getSpy.mockResolvedValueOnce(expected)

      const result = await sessionsApi.list()

      expect(result).toEqual(expected)
      expect(getSpy).toHaveBeenCalledWith('/api/admin/sessions')
    })
  })

  describe('show()', () => {
    it('calls GET /api/admin/sessions/:sessionId', async () => {
      const session = { session_id: 'sess-1', client_id: 'client-a' }
      getSpy.mockResolvedValueOnce(session)

      const result = await sessionsApi.show('sess-1')

      expect(result).toEqual(session)
      expect(getSpy).toHaveBeenCalledWith('/api/admin/sessions/sess-1')
    })
  })

  describe('revoke()', () => {
    it('calls DELETE /api/admin/sessions/:sessionId', async () => {
      const expected = { session_id: 'sess-1', revoked: true }
      deleteSpy.mockResolvedValueOnce(expected)

      const result = await sessionsApi.revoke('sess-1')

      expect(result).toEqual(expected)
      expect(deleteSpy).toHaveBeenCalledWith('/api/admin/sessions/sess-1')
    })
  })

  describe('revokeUserSessions()', () => {
    it('calls DELETE /api/admin/users/:subjectId/sessions', async () => {
      const expected = { revoked_count: 3 }
      deleteSpy.mockResolvedValueOnce(expected)

      const result = await sessionsApi.revokeUserSessions('sub-123')

      expect(result).toEqual(expected)
      expect(deleteSpy).toHaveBeenCalledWith('/api/admin/users/sub-123/sessions')
    })
  })
})
