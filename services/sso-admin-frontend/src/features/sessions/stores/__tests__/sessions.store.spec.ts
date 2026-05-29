import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { sessionsApi } from '../../services/sessions.api'
import { useSessionsStore } from '../sessions.store'
import type { AdminSession, SessionRevokeResponse } from '../../types'

vi.mock('../../services/sessions.api', () => ({
  sessionsApi: {
    list: vi.fn<() => Promise<{ sessions: readonly AdminSession[] }>>(),
    show: vi.fn<(sessionId: string) => Promise<AdminSession>>(),
    revoke: vi.fn<(sessionId: string) => Promise<SessionRevokeResponse>>(),
    revokeUserSessions: vi.fn<(subjectId: string) => Promise<{ revoked_count: number }>>(),
  },
}))

vi.mock('@/lib/api/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-client')>()
  return {
    ...actual,
    getLastRequestId: vi.fn<() => string | null>(() => 'req-sessions-1'),
  }
})

const session1: AdminSession = {
  session_id: 'sess-001',
  client_id: 'app-a',
  subject_id: 'sub-admin',
  user_email: 'admin@example.test',
  user_display_name: 'Admin User',
  ip_address: '203.0.113.10',
  user_agent: 'Mozilla/5.0 Chrome',
  last_activity_at: '2026-05-29T10:00:00Z',
}

const session2: AdminSession = {
  session_id: 'sess-002',
  client_id: 'portal',
  subject_id: 'sub-user',
  user_email: 'user@example.test',
  user_display_name: 'Regular User',
  ip_address: '198.51.100.5',
  user_agent: 'Mozilla/5.0 Safari',
  last_activity_at: '2026-05-29T09:30:00Z',
}

describe('useSessionsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(sessionsApi.list).mockReset()
    vi.mocked(sessionsApi.show).mockReset()
    vi.mocked(sessionsApi.revoke).mockReset()
    vi.mocked(sessionsApi.revokeUserSessions).mockReset()
    vi.mocked(getLastRequestId).mockReturnValue('req-sessions-1')
  })

  describe('load()', () => {
    it('loads sessions and sets status to success', async () => {
      vi.mocked(sessionsApi.list).mockResolvedValue({ sessions: [session1, session2] })
      const store = useSessionsStore()

      await store.load()

      expect(store.status).toBe('success')
      expect(store.sessions).toEqual([session1, session2])
      expect(store.requestId).toBe('req-sessions-1')
    })

    it('maps forbidden errors to safe copy', async () => {
      vi.mocked(sessionsApi.list).mockRejectedValue(new ApiError(403, 'SQLSTATE forbidden leak'))
      const store = useSessionsStore()

      await store.load()

      expect(store.status).toBe('forbidden')
      expect(store.errorMessage).toBe('Kamu tidak memiliki izin untuk melihat sessions admin.')
      expect(store.errorMessage).not.toContain('SQLSTATE')
    })

    it('maps unauthenticated errors', async () => {
      vi.mocked(sessionsApi.list).mockRejectedValue(new ApiError(401, 'unauthenticated'))
      const store = useSessionsStore()

      await store.load()

      expect(store.status).toBe('unauthenticated')
      expect(store.errorMessage).toBe('Sesi admin berakhir. Login ulang untuk melanjutkan.')
    })

    it('maps server errors with request ID', async () => {
      vi.mocked(sessionsApi.list).mockRejectedValue(new ApiError(500, 'server crash'))
      const store = useSessionsStore()

      await store.load()

      expect(store.status).toBe('error')
      expect(store.errorMessage).toContain('req-sessions-1')
    })
  })

  describe('selectSession()', () => {
    it('loads session detail and sets selectedSessionId', async () => {
      vi.mocked(sessionsApi.show).mockResolvedValue(session1)
      const store = useSessionsStore()

      await store.selectSession('sess-001')

      expect(store.selectedSessionId).toBe('sess-001')
      expect(sessionsApi.show).toHaveBeenCalledWith('sess-001')
    })

    it('sets requestId on selection', async () => {
      vi.mocked(sessionsApi.show).mockResolvedValue(session1)
      const store = useSessionsStore()

      await store.selectSession('sess-001')

      expect(store.requestId).toBe('req-sessions-1')
    })
  })

  describe('revokeSession()', () => {
    it('revokes session, removes it from list', async () => {
      vi.mocked(sessionsApi.revoke).mockResolvedValue({
        session_id: 'sess-001',
        revoked: true,
      })
      const store = useSessionsStore()
      store.sessions = [session1, session2]

      await store.revokeSession('sess-001')

      expect(sessionsApi.revoke).toHaveBeenCalledWith('sess-001')
      expect(store.sessions).toHaveLength(1)
      expect(store.sessions[0]?.session_id).toBe('sess-002')
      expect(store.actionStatus).toBe('success')
    })

    it('maps step-up errors to safe copy', async () => {
      vi.mocked(sessionsApi.revoke).mockRejectedValue(
        new ApiError(428, 'raw ACR failure', 'fresh_auth_required', null, 'req-step-up'),
      )
      const store = useSessionsStore()

      await store.revokeSession('sess-001')

      expect(store.actionStatus).toBe('step_up_required')
      expect(store.requestId).toBe('req-step-up')
      expect(store.errorMessage).toBe(
        'Aksi ini membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.',
      )
      expect(store.errorMessage).not.toContain('raw ACR')
    })
  })

  describe('revokeUserSessions()', () => {
    it('revokes all user sessions', async () => {
      vi.mocked(sessionsApi.revokeUserSessions).mockResolvedValue({ revoked_count: 3 })
      const store = useSessionsStore()

      await store.revokeUserSessions('sub-user')

      expect(sessionsApi.revokeUserSessions).toHaveBeenCalledWith('sub-user')
      expect(store.actionStatus).toBe('success')
    })

    it('maps step-up errors for user revocation', async () => {
      vi.mocked(sessionsApi.revokeUserSessions).mockRejectedValue(
        new ApiError(428, 'fresh auth required', 'fresh_auth_required'),
      )
      const store = useSessionsStore()

      await store.revokeUserSessions('sub-user')

      expect(store.actionStatus).toBe('step_up_required')
    })
  })
})
