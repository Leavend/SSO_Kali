// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { clientsApi } from '@/services/clients.api'
import { useClientDetail } from '../useClientDetail'
import type { ClientDetailResponse } from '@/types/clients.types'

vi.mock('@/services/clients.api', () => ({
  clientsApi: { show: vi.fn<(id: string) => Promise<ClientDetailResponse>>() },
}))

const data = ref<ClientDetailResponse | null>(null)
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

// Detail DTO as the backend returns it: secret status is the `has_secret_hash`
// BOOLEAN plus rotation timestamps — never a secret value or field.
const ready: ClientDetailResponse = {
  client: {
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
    activated_at: '2026-01-02T00:00:00Z',
    disabled_at: null,
    secret_rotated_at: '2026-06-01T00:00:00Z',
    secret_expires_at: '2027-06-01T00:00:00Z',
  },
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

describe('useClientDetail', () => {
  it('wires the service under a stable per-client asyncData key', () => {
    useClientDetail('portal-web')
    expect(capturedKey).toBe('admin-client-detail:portal-web')
    capturedHandler?.()
    expect(clientsApi.show).toHaveBeenCalledWith('portal-web')
  })

  it('keys distinctly per client id', () => {
    useClientDetail('client-a')
    expect(capturedKey).toBe('admin-client-detail:client-a')
    useClientDetail('client-b')
    expect(capturedKey).toBe('admin-client-detail:client-b')
  })

  it('accepts a getter for the client id', () => {
    useClientDetail(() => 'from-getter')
    expect(capturedKey).toBe('admin-client-detail:from-getter')
    capturedHandler?.()
    expect(clientsApi.show).toHaveBeenCalledWith('from-getter')
  })

  it('exposes the client from the ready response', () => {
    data.value = ready
    const detail = useClientDetail('portal-web')
    expect(detail.viewState.value).toBe('ready')
    expect(detail.client.value).toEqual(ready.client)
  })

  it('returns a null client before data resolves (loading)', () => {
    const detail = useClientDetail('portal-web')
    expect(detail.viewState.value).toBe('loading')
    expect(detail.client.value).toBeNull()
  })

  it('maps a first-load 404 to not_found', () => {
    error.value = new ApiError(404, 'not found')
    expect(useClientDetail('missing').viewState.value).toBe('not_found')
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const detail = useClientDetail('portal-web')
    expect(detail.viewState.value).toBe('forbidden')
    expect(detail.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useClientDetail('portal-web').viewState.value).toBe('unauthenticated')
  })

  it('surfaces the has_secret_hash boolean but never a secret or token', () => {
    data.value = ready
    const client = useClientDetail('portal-web').client.value
    expect(client?.has_secret_hash).toBe(true)
    const serialized = JSON.stringify(client)
    expect(serialized).not.toMatch(
      /client_secret|clientSecret|access_token|refresh_token|id_token|Bearer/i,
    )
    // client_id is a public identifier and is expected to surface.
    expect(serialized).toContain('portal-web')
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useClientDetail('portal-web').refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
