// app/composables/__tests__/useAuthAuditEvents.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import type { AuthAuditEvent, AuthAuditListResponse } from '@/types/auth-audit.types'

const listMock = vi.fn<(filters?: unknown) => Promise<AuthAuditListResponse>>()
vi.mock('@/services/auth-audit.api', () => ({ authAuditApi: { listEvents: listMock } }))

const dataRef = ref<AuthAuditListResponse | null>(null)
const pendingRef = ref(false)
const errorRef = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

mockNuxtImport('useAsyncData', () => {
  return (_key: string, handler: () => Promise<unknown>) => {
    void handler() // record the first listEvents(filters) call
    return { data: dataRef, pending: pendingRef, error: errorRef, refresh: refreshMock }
  }
})

const { useAuthAuditEvents } = await import('../useAuthAuditEvents')

function event(id: string): AuthAuditEvent {
  return {
    event_id: id,
    event_type: 'user.login',
    outcome: 'succeeded',
    subject: { subject_id: null, email: null },
    client_id: null,
    session_id: null,
    request: { ip_address: null, user_agent: null, request_id: null },
    error_code: null,
    context: {},
    occurred_at: null,
  }
}

beforeEach(() => {
  dataRef.value = null
  pendingRef.value = false
  errorRef.value = null
  listMock.mockReset()
  listMock.mockResolvedValue({ events: [] })
})
afterEach(() => vi.clearAllMocks())

describe('useAuthAuditEvents', () => {
  it('fetches the first page with the default limit', () => {
    useAuthAuditEvents()
    expect(listMock).toHaveBeenCalledWith({ limit: 50 })
  })

  it('seeds the first fetch with initial filters (deep-link pre-filter)', () => {
    useAuthAuditEvents({ client_id: 'portal' })
    expect(listMock).toHaveBeenCalledWith({ client_id: 'portal', limit: 50 })
  })

  it('maps loading / empty / ready', () => {
    const r = useAuthAuditEvents()
    pendingRef.value = true
    expect(r.viewState.value).toBe('loading')
    pendingRef.value = false
    dataRef.value = { events: [] }
    expect(r.viewState.value).toBe('empty')
    dataRef.value = { events: [event('a')] }
    expect(r.viewState.value).toBe('ready')
    expect(r.events.value).toEqual([event('a')])
  })

  it('exposes hasMore from the first page cursor', () => {
    const r = useAuthAuditEvents()
    dataRef.value = { events: [event('a')], pagination: { next_cursor: 'c1' } }
    expect(r.hasMore.value).toBe(true)
    dataRef.value = { events: [event('a')], pagination: { next_cursor: null } }
    expect(r.hasMore.value).toBe(false)
  })

  it('loadMore appends the next cursor page and advances the cursor', async () => {
    const r = useAuthAuditEvents()
    dataRef.value = { events: [event('a')], pagination: { next_cursor: 'c1' } }
    listMock.mockResolvedValueOnce({ events: [event('b')], pagination: { next_cursor: null } })
    await r.loadMore()
    expect(listMock).toHaveBeenLastCalledWith({ limit: 50, cursor: 'c1' })
    expect(r.events.value).toEqual([event('a'), event('b')])
    expect(r.hasMore.value).toBe(false)
  })

  it('loadMore is a no-op when there is no next cursor', async () => {
    const r = useAuthAuditEvents()
    dataRef.value = { events: [event('a')], pagination: { next_cursor: null } }
    listMock.mockClear()
    await r.loadMore()
    expect(listMock).not.toHaveBeenCalled()
  })

  it('search resets appended pages (collapses back to the first page)', async () => {
    const r = useAuthAuditEvents()
    dataRef.value = { events: [event('a')], pagination: { next_cursor: 'c1' } }
    listMock.mockResolvedValueOnce({ events: [event('b')], pagination: { next_cursor: null } })
    await r.loadMore()
    expect(r.events.value).toEqual([event('a'), event('b')])
    await r.search({ outcome: 'failed' })
    expect(r.events.value).toEqual([event('a')]) // appended page cleared
  })

  it('maps 401/403 and surfaces the ApiError requestId', () => {
    const r = useAuthAuditEvents()
    errorRef.value = new ApiError(403, 'no', undefined, {}, 'req-aa')
    expect(r.viewState.value).toBe('forbidden')
    expect(r.requestId.value).toBe('req-aa')
  })
})
