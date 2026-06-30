import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import type { AdminSession } from '@/types/sessions.types'

const listMock = vi.fn<() => Promise<unknown>>()
vi.mock('@/services/sessions.api', () => ({ sessionsApi: { list: listMock } }))

const dataRef = ref<unknown>(null)
const pendingRef = ref(false)
const errorRef = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

mockNuxtImport('useAsyncData', () => {
  return (_key: string, handler: () => Promise<unknown>) => {
    void handler()
    return { data: dataRef, pending: pendingRef, error: errorRef, refresh: refreshMock }
  }
})

const { useSessionsList } = await import('../useSessionsList')

const session: AdminSession = {
  session_id: 'sess_1',
  client_id: 'portal',
  subject_id: 'subj_a',
  email: 'a@example.test',
  display_name: 'Alice',
}

beforeEach(() => {
  dataRef.value = null
  pendingRef.value = false
  errorRef.value = null
  listMock.mockReset()
  listMock.mockResolvedValue({ sessions: [] })
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('useSessionsList', () => {
  it('fetches the session list', () => {
    useSessionsList()
    expect(listMock).toHaveBeenCalledTimes(1)
  })

  it('maps loading / empty / ready', () => {
    const r = useSessionsList()
    pendingRef.value = true
    expect(r.viewState.value).toBe('loading')
    pendingRef.value = false
    dataRef.value = { sessions: [] }
    expect(r.viewState.value).toBe('empty')
    dataRef.value = { sessions: [session] }
    expect(r.viewState.value).toBe('ready')
    expect(r.sessions.value).toEqual([session])
  })

  it('keeps the last-good list and flags stale on a refresh error', () => {
    const r = useSessionsList()
    dataRef.value = { sessions: [session] }
    errorRef.value = new ApiError(500, 'boom')
    expect(r.viewState.value).toBe('ready')
    expect(r.isStale.value).toBe(true)
  })

  it('surfaces the ApiError requestId', () => {
    const r = useSessionsList()
    errorRef.value = new ApiError(403, 'no', undefined, {}, 'req-sessions')
    expect(r.requestId.value).toBe('req-sessions')
  })
})
