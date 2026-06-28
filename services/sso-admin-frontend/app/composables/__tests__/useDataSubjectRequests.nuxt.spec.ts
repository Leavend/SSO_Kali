// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { observabilityApi } from '@/services/observability.api'
import { useDataSubjectRequests } from '../useDataSubjectRequests'
import type { DataSubjectRequest, DsrListResponse } from '@/types/compliance.types'

vi.mock('@/services/observability.api', () => ({
  observabilityApi: {
    listDataSubjectRequests: vi.fn<() => Promise<DsrListResponse>>(),
  },
}))

// Controllable useAsyncData stand-in: the test mutates data/error and asserts the
// composable's derived state, and captures the key + handler to prove wiring.
const data = ref<DsrListResponse | null>(null)
const pending = ref(false)
const error = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
let capturedKey: string | null = null
let capturedHandler: (() => unknown) | null = null

mockNuxtImport('useAsyncData', () => {
  return (key: string, handler: () => unknown) => {
    capturedKey = key
    capturedHandler = handler
    return { data, pending, error, refresh: refreshMock }
  }
})

// A fully-typed sample request; overrides keep each case readable. The DTO carries
// only OPAQUE ids (request_id, subject_id) — never an email/NIK/NIP/NISN/name —
// matching the masked backend contract (design §3.3 PII minimization).
const base: DataSubjectRequest = {
  request_id: '01J0DSR0000000000000000001',
  subject_id: 'sub_budi',
  type: 'export',
  status: 'submitted',
  submitted_at: '2026-06-20T08:00:00Z',
  reviewed_at: null,
  fulfilled_at: null,
  sla_due_at: '2026-07-20T08:00:00Z',
}
const makeDsr = (o: Partial<DataSubjectRequest>): DataSubjectRequest => ({ ...base, ...o })

const ready: DsrListResponse = {
  requests: [
    makeDsr({ request_id: 'dsr_budi', subject_id: 'sub_budi', status: 'submitted' }),
    makeDsr({
      request_id: 'dsr_citra',
      subject_id: 'sub_citra',
      status: 'fulfilled',
      type: 'delete',
    }),
  ],
}
const many: DsrListResponse = {
  requests: Array.from({ length: 30 }, (_, i) =>
    makeDsr({ request_id: `dsr_${i}`, subject_id: `sub_${i}` }),
  ),
}

beforeEach(() => {
  data.value = null
  pending.value = false
  error.value = null
  capturedKey = null
  capturedHandler = null
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('useDataSubjectRequests', () => {
  it('wires the service under a stable asyncData key', () => {
    useDataSubjectRequests()
    expect(capturedKey).toBe('admin-dsr-list')
    capturedHandler?.()
    expect(observabilityApi.listDataSubjectRequests).toHaveBeenCalledTimes(1)
  })

  it('keeps requests null before an answer, distinct from an empty []', () => {
    const dsr = useDataSubjectRequests()
    expect(dsr.requests.value).toBeNull()
    expect(dsr.viewState.value).toBe('loading')
    data.value = { requests: [] }
    expect(dsr.requests.value).toEqual([])
    expect(dsr.viewState.value).toBe('empty')
  })

  it('derives ready state and exposes the queue', () => {
    data.value = ready
    const dsr = useDataSubjectRequests()
    expect(dsr.viewState.value).toBe('ready')
    expect(dsr.requests.value).toHaveLength(2)
    expect(dsr.total.value).toBe(2)
  })

  it('applies the search query and status filter to derived rows', () => {
    data.value = ready
    const dsr = useDataSubjectRequests()
    dsr.query.value = 'citra'
    expect(dsr.filtered.value.map((r) => r.request_id)).toEqual(['dsr_citra'])
    expect(dsr.filteredTotal.value).toBe(1)
    dsr.query.value = ''
    dsr.statusFilter.value = 'fulfilled'
    expect(dsr.filtered.value.map((r) => r.request_id)).toEqual(['dsr_citra'])
    expect(dsr.total.value).toBe(2)
  })

  it('paginates the filtered queue and reports the page count', () => {
    data.value = many
    const dsr = useDataSubjectRequests()
    expect(dsr.paged.value).toHaveLength(25)
    expect(dsr.pageCount.value).toBe(2)
    dsr.page.value = 2
    expect(dsr.paged.value).toHaveLength(5)
  })

  it('resets to page 1 when the query or status filter changes', async () => {
    data.value = many
    const dsr = useDataSubjectRequests()
    dsr.page.value = 2
    dsr.query.value = 'dsr_1'
    await nextTick()
    expect(dsr.page.value).toBe(1)
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const dsr = useDataSubjectRequests()
    expect(dsr.viewState.value).toBe('forbidden')
    expect(dsr.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useDataSubjectRequests().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good queue on a background refresh failure (stale)', () => {
    data.value = ready
    error.value = new ApiError(500, 'boom')
    const dsr = useDataSubjectRequests()
    expect(dsr.viewState.value).toBe('ready')
    expect(dsr.isStale.value).toBe(true)
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useDataSubjectRequests().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates only the masked DSR DTO — no token and no raw PII digit-run leaks', () => {
    // The composable passes the masked backend DTO through verbatim; it must never
    // introduce a token field or a raw identifier. (The full SSR payload leak gate
    // over the DSR DTO is Task 6.12; this guards the data boundary.)
    data.value = many
    const dsr = useDataSubjectRequests()
    const serialized = JSON.stringify({ requests: dsr.requests.value, paged: dsr.paged.value })
    expect(serialized).not.toMatch(/access_token|refresh_token|id_token|Bearer|client_secret/i)
    expect(serialized).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/)
  })
})
