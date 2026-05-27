import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { clientsApi } from '../../services/clients.api'
import { useClientsStore } from '../clients.store'
import type { AdminClient } from '../../types'

vi.mock('../../services/clients.api', () => ({
  clientsApi: {
    list: vi.fn<() => Promise<{ clients: readonly AdminClient[] }>>(),
    show: vi.fn<(clientId: string) => Promise<{ client: AdminClient }>>(),
    update: vi.fn<(clientId: string, payload: unknown) => Promise<{ client: AdminClient }>>(),
    rotateSecret:
      vi.fn<
        (
          clientId: string,
        ) => Promise<{ rotation: { client_id: string; plaintext_secret?: string } }>
      >(),
  },
}))

vi.mock('@/lib/api/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-client')>()
  return {
    ...actual,
    getLastRequestId: vi.fn<() => string | null>(() => 'req-clients-1'),
  }
})

const client: AdminClient = {
  client_id: 'prototype-app-a',
  display_name: 'Prototype App A',
  type: 'confidential',
  environment: 'production',
  app_base_url: 'https://app.example.test',
  redirect_uris: ['https://app.example.test/callback'],
  post_logout_redirect_uris: ['https://app.example.test/logout'],
  allowed_scopes: ['openid', 'profile'],
  owner_email: 'owner@example.test',
  status: 'active',
  has_secret_hash: true,
}

describe('useClientsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(clientsApi.list).mockReset()
    vi.mocked(clientsApi.show).mockReset()
    vi.mocked(clientsApi.update).mockReset()
    vi.mocked(clientsApi.rotateSecret).mockReset()
    vi.mocked(getLastRequestId).mockReturnValue('req-clients-1')
  })

  it('loads clients and stores request evidence', async () => {
    vi.mocked(clientsApi.list).mockResolvedValue({ clients: [client] })
    const store = useClientsStore()

    await store.load()

    expect(store.status).toBe('success')
    expect(store.clients).toEqual([client])
    expect(store.selectedClientId).toBe('prototype-app-a')
    expect(store.requestId).toBe('req-clients-1')
  })

  it('loads selected client detail', async () => {
    vi.mocked(clientsApi.show).mockResolvedValue({ client })
    const store = useClientsStore()

    await store.selectClient('prototype-app-a')

    expect(store.selectedClient).toEqual(client)
    expect(store.detailStatus).toBe('success')
    expect(clientsApi.show).toHaveBeenCalledWith('prototype-app-a')
  })

  it('updates editable metadata through the API', async () => {
    vi.mocked(clientsApi.update).mockResolvedValue({
      client: { ...client, display_name: 'Renamed App' },
    })
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = client.client_id

    await store.updateSelected({ display_name: 'Renamed App' })

    expect(store.selectedClient?.display_name).toBe('Renamed App')
    expect(clientsApi.update).toHaveBeenCalledWith('prototype-app-a', {
      display_name: 'Renamed App',
    })
  })

  it('keeps rotated secret transient and clears it explicitly', async () => {
    vi.mocked(clientsApi.rotateSecret).mockResolvedValue({
      rotation: { client_id: 'prototype-app-a', plaintext_secret: 'once-secret' },
    })
    const store = useClientsStore()
    store.selectedClientId = client.client_id

    await store.rotateSelectedSecret()

    expect(store.rotationSecret).toBe('once-secret')
    expect(store.rotationClientId).toBe('prototype-app-a')

    store.clearRotationSecret()

    expect(store.rotationSecret).toBeNull()
    expect(store.rotationClientId).toBeNull()
  })

  it('maps forbidden errors to safe copy without raw backend details', async () => {
    vi.mocked(clientsApi.list).mockRejectedValue(
      new ApiError(403, 'SQLSTATE leaked forbidden trace'),
    )
    const store = useClientsStore()

    await store.load()

    expect(store.status).toBe('forbidden')
    expect(store.errorMessage).toBe('Kamu tidak memiliki izin untuk melihat OAuth clients.')
    expect(store.errorMessage).not.toContain('SQLSTATE')
  })

  it('maps server errors to safe copy with request evidence', async () => {
    vi.mocked(clientsApi.list).mockRejectedValue(
      new ApiError(500, 'raw token Bearer abc', 'server_error', null, 'req-clients-fail'),
    )
    const store = useClientsStore()

    await store.load()

    expect(store.status).toBe('error')
    expect(store.requestId).toBe('req-clients-fail')
    expect(store.errorMessage).toBe(
      'OAuth clients belum bisa dimuat. Coba lagi atau gunakan request ID req-clients-fail untuk investigasi.',
    )
    expect(store.errorMessage).not.toMatch(/Bearer|raw token/i)
  })
})
