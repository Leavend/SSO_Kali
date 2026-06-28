// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { clientsApi } from '@/services/clients.api'
import { useClientsList } from '../useClientsList'
import type {
  AdminClientListItem,
  ClientListResponse,
  ClientRegistration,
  ClientRegistrationsResponse,
} from '@/types/clients.types'

vi.mock('@/services/clients.api', () => ({
  clientsApi: {
    list: vi.fn<() => Promise<ClientListResponse>>(),
    registrations: vi.fn<() => Promise<ClientRegistrationsResponse>>(),
  },
}))

// The composable's useAsyncData handler returns the MERGED list plus a captured
// request id; this controllable stand-in is shaped to match so the test can drive
// derived state and also exercise the real handler (Promise.all + mergeClients).
type ClientsListData = {
  readonly clients: readonly AdminClientListItem[]
  readonly requestId: string | null
}
const data = ref<ClientsListData | null>(null)
const pending = ref(false)
const error = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
let capturedKey: string | null = null
let capturedHandler: (() => Promise<ClientsListData>) | null = null

mockNuxtImport('useAsyncData', () => {
  return (key: string, handler: () => Promise<ClientsListData>) => {
    capturedKey = key
    capturedHandler = handler
    return { data, pending, error, refresh: refreshMock }
  }
})

// One fully-typed sample row; overrides keep each case readable. List/detail DTOs
// carry only `has_secret_hash` — never a secret — matching the live contract.
const base: AdminClientListItem = {
  client_id: 'portal-web',
  display_name: 'Portal Web',
  type: 'confidential',
  environment: 'live',
  app_base_url: 'https://portal.example.test',
  redirect_uris: ['https://portal.example.test/callback'],
  post_logout_redirect_uris: [],
  allowed_scopes: ['openid', 'profile'],
  backchannel_logout_uri: null,
  backchannel_logout_internal: false,
  owner_email: 'ops@example.test',
  provisioning: 'jit',
  status: 'active',
  category: 'publik',
  has_secret_hash: true,
}
const makeClient = (o: Partial<AdminClientListItem>): AdminClientListItem => ({ ...base, ...o })
const makeData = (clients: readonly AdminClientListItem[]): ClientsListData => ({
  clients,
  requestId: null,
})

const ready: ClientsListData = makeData([
  makeClient({ client_id: 'portal-web', display_name: 'Portal Web', status: 'active' }),
  makeClient({
    client_id: 'staff-console',
    display_name: 'Staff Console',
    category: 'kepegawaian',
    status: 'disabled',
  }),
])
const many: ClientsListData = makeData(
  Array.from({ length: 30 }, (_, i) =>
    makeClient({ client_id: `client-${i}`, display_name: `Client ${i}` }),
  ),
)

beforeEach(() => {
  data.value = null
  pending.value = false
  error.value = null
  capturedKey = null
  capturedHandler = null
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('useClientsList', () => {
  it('wires the service under a stable asyncData key and fetches list + registrations in parallel, merged', async () => {
    const listResponse: ClientListResponse = {
      clients: [
        makeClient({ client_id: 'portal-web', display_name: 'Portal Web', status: 'active' }),
      ],
    }
    const stagedReg: ClientRegistration = {
      client_id: 'staged-only',
      display_name: 'Staged Only',
      redirect_uris: ['https://staged.example.test/callback'],
      status: 'staged',
      has_secret_hash: false,
    }
    const regsResponse: ClientRegistrationsResponse = { registrations: [stagedReg] }
    vi.mocked(clientsApi.list).mockResolvedValue(listResponse)
    vi.mocked(clientsApi.registrations).mockResolvedValue(regsResponse)

    useClientsList()
    expect(capturedKey).toBe('admin-clients-list')

    const result = await capturedHandler?.()
    expect(clientsApi.list).toHaveBeenCalledTimes(1)
    expect(clientsApi.registrations).toHaveBeenCalledTimes(1)
    // The staged registration-only row survives the merge alongside the runtime client.
    expect(result?.clients.map((c) => c.client_id).sort()).toEqual(['portal-web', 'staged-only'])
  })

  it('keeps null (no response) distinct from [] and derives loading / ready / empty', () => {
    const list = useClientsList()
    expect(list.viewState.value).toBe('loading')
    expect(list.clients.value).toBeNull()
    data.value = ready
    expect(list.viewState.value).toBe('ready')
    expect(list.clients.value).toHaveLength(2)
    data.value = makeData([])
    expect(list.clients.value).toEqual([])
    expect(list.viewState.value).toBe('empty')
  })

  it('applies the search query and status filter to derived rows', () => {
    data.value = ready
    const list = useClientsList()
    list.query.value = 'staff'
    expect(list.filtered.value.map((c) => c.client_id)).toEqual(['staff-console'])
    expect(list.filteredTotal.value).toBe(1)
    list.query.value = ''
    list.statusFilter.value = 'disabled'
    expect(list.filtered.value.map((c) => c.client_id)).toEqual(['staff-console'])
    expect(list.total.value).toBe(2)
  })

  it('paginates the filtered list and reports the page count', () => {
    data.value = many
    const list = useClientsList()
    expect(list.paged.value).toHaveLength(25)
    expect(list.pageCount.value).toBe(2)
    list.page.value = 2
    expect(list.paged.value).toHaveLength(5)
  })

  it('resets to page 1 when the query or status filter changes', async () => {
    data.value = many
    const list = useClientsList()
    list.page.value = 2
    list.query.value = 'Client 1'
    await nextTick()
    expect(list.page.value).toBe(1)
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const list = useClientsList()
    expect(list.viewState.value).toBe('forbidden')
    expect(list.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useClientsList().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good list on a background refresh failure (stale)', () => {
    data.value = ready
    error.value = new ApiError(500, 'boom')
    const list = useClientsList()
    expect(list.viewState.value).toBe('ready')
    expect(list.isStale.value).toBe(true)
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useClientsList().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates only masked DTOs — no client_secret / token leaks, but the public client_id is present', () => {
    // This data boundary passes the masked backend DTO through verbatim; it must
    // never introduce a secret or token field. (The full SSR payload leak gate
    // over /clients is Task 5.14; this guards the composable boundary.)
    data.value = many
    const list = useClientsList()
    const serialized = JSON.stringify({ clients: list.clients.value, paged: list.paged.value })
    expect(serialized).not.toMatch(
      /client_secret|clientSecret|access_token|refresh_token|id_token|Bearer/i,
    )
    // client_id is a public identifier and is expected to hydrate.
    expect(serialized).toContain('client-0')
  })
})
