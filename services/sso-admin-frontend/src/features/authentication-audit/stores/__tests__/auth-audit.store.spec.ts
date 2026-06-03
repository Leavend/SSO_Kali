import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/lib/api/api-client'
import { authAuditApi } from '../../services/auth-audit.api'
import { useAuthAuditStore } from '../auth-audit.store'

vi.mock('../../services/auth-audit.api')
vi.mock('@/lib/api/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-client')>()
  return { ...actual, getLastRequestId: vi.fn<() => string>(() => 'req-auth-audit-id') }
})

const mockEvent = {
  event_id: 'EVT001',
  event_type: 'login',
  outcome: 'succeeded',
  subject: { subject_id: 'user-1', email: 'user@example.com' },
  client_id: 'sso-portal',
  session_id: 'sid-1',
  request: { ip_address: '127.0.0.1', request_id: 'req-1' },
  error_code: null,
  occurred_at: '2026-06-01T10:00:00Z',
}

const mockListResponse = {
  events: [mockEvent],
  pagination: { has_more: false, next_cursor: null },
}

describe('useAuthAuditStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('initializes with idle status and empty events', () => {
      const store = useAuthAuditStore()

      expect(store.status).toBe('idle')
      expect(store.events).toEqual([])
      expect(store.selectedEvent).toBeNull()
      expect(store.errorMessage).toBeNull()
    })
  })

  describe('load()', () => {
    it('sets success and populates events', async () => {
      vi.mocked(authAuditApi.listEvents).mockResolvedValueOnce(mockListResponse)

      const store = useAuthAuditStore()
      await store.load()

      expect(store.status).toBe('success')
      expect(store.events).toHaveLength(1)
      expect(store.events[0]?.event_id).toBe('EVT001')
    })

    it('sets loading during request', () => {
      vi.mocked(authAuditApi.listEvents).mockReturnValueOnce(new Promise(() => {}))

      const store = useAuthAuditStore()
      void store.load()

      expect(store.status).toBe('loading')
    })

    it('sets unauthenticated on 401', async () => {
      vi.mocked(authAuditApi.listEvents).mockRejectedValueOnce(
        new ApiError(401, 'Unauthenticated', 'req-401'),
      )

      const store = useAuthAuditStore()
      await store.load()

      expect(store.status).toBe('unauthenticated')
    })

    it('sets forbidden on 403', async () => {
      vi.mocked(authAuditApi.listEvents).mockRejectedValueOnce(
        new ApiError(403, 'Forbidden', 'req-403'),
      )

      const store = useAuthAuditStore()
      await store.load()

      expect(store.status).toBe('forbidden')
      expect(store.errorMessage).toContain('izin')
    })

    it('clears events on failure', async () => {
      vi.mocked(authAuditApi.listEvents).mockResolvedValueOnce(mockListResponse)
      const store = useAuthAuditStore()
      await store.load()

      vi.mocked(authAuditApi.listEvents).mockRejectedValueOnce(new Error('fail'))
      await store.load()

      expect(store.events).toEqual([])
    })
  })

  describe('search()', () => {
    it('applies filters and resets selectedEventDetail', async () => {
      vi.mocked(authAuditApi.listEvents).mockResolvedValue(mockListResponse)

      const store = useAuthAuditStore()
      await store.search({ subject_id: 'user-1', outcome: 'succeeded' })

      expect(store.status).toBe('success')
      expect(store.filters.subject_id).toBe('user-1')
      expect(store.selectedEventDetail).toBeNull()
    })
  })

  describe('selectEvent()', () => {
    it('upserts event detail into events list', async () => {
      vi.mocked(authAuditApi.listEvents).mockResolvedValueOnce(mockListResponse)
      vi.mocked(authAuditApi.showEvent).mockResolvedValueOnce({ event: mockEvent })

      const store = useAuthAuditStore()
      await store.load()
      await store.selectEvent('EVT001')

      expect(store.selectedEventDetail).toEqual(mockEvent)
      expect(store.selectedEvent?.event_id).toBe('EVT001')
    })
  })

  describe('loadMore()', () => {
    it('appends events when next_cursor is available', async () => {
      const firstPage = {
        events: [mockEvent],
        pagination: { has_more: true, next_cursor: 'cursor-abc' },
      }
      const secondPage = {
        events: [{ ...mockEvent, event_id: 'EVT002' }],
        pagination: { has_more: false, next_cursor: null },
      }
      vi.mocked(authAuditApi.listEvents)
        .mockResolvedValueOnce(firstPage)
        .mockResolvedValueOnce(secondPage)

      const store = useAuthAuditStore()
      await store.load()
      await store.loadMore()

      expect(store.events).toHaveLength(2)
    })

    it('does nothing when no next_cursor', async () => {
      vi.mocked(authAuditApi.listEvents).mockResolvedValueOnce(mockListResponse)

      const store = useAuthAuditStore()
      await store.load()

      const callCount = vi.mocked(authAuditApi.listEvents).mock.calls.length
      await store.loadMore()

      expect(vi.mocked(authAuditApi.listEvents).mock.calls.length).toBe(callCount)
    })
  })
})
