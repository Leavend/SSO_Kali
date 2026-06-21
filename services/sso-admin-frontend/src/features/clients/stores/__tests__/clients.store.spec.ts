import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { clientsApi } from '../../services/clients.api'
import { useClientsStore } from '../clients.store'
import type { AdminClient } from '../../types'

vi.mock('../../services/clients.api', () => ({
  clientsApi: {
    list: vi.fn<() => Promise<{ clients: readonly AdminClient[] }>>(),
    listWithRequestId:
      vi.fn<
        () => Promise<{ data: { clients: readonly AdminClient[] }; requestId: string | null }>
      >(),
    show: vi.fn<(clientId: string) => Promise<{ client: AdminClient }>>(),
    registrations: vi.fn<() => Promise<{ registrations: readonly AdminClient[] }>>(),
    update: vi.fn<(clientId: string, payload: unknown) => Promise<{ client: AdminClient }>>(),
    create: vi.fn<
      (payload: unknown) => Promise<{
        registration: AdminClient
        plaintext_secret?: string
        client_secret?: string
        secret?: string
      }>
    >(),
    syncScopes: vi.fn<(clientId: string, payload: unknown) => Promise<{ client: AdminClient }>>(),
    disable:
      vi.fn<(clientId: string, payload: unknown) => Promise<{ registration: AdminClient }>>(),
    decommission: vi.fn<(clientId: string) => Promise<{ registration: AdminClient }>>(),
    rotateSecret:
      vi.fn<
        (
          clientId: string,
        ) => Promise<{ rotation: { client_id: string; plaintext_secret?: string } }>
      >(),
    contract: vi.fn<(payload: unknown) => Promise<{ contract: Record<string, unknown> }>>(),
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
    vi.mocked(clientsApi.listWithRequestId).mockReset()
    vi.mocked(clientsApi.show).mockReset()
    vi.mocked(clientsApi.registrations).mockReset()
    vi.mocked(clientsApi.update).mockReset()
    vi.mocked(clientsApi.create).mockReset()
    vi.mocked(clientsApi.syncScopes).mockReset()
    vi.mocked(clientsApi.disable).mockReset()
    vi.mocked(clientsApi.decommission).mockReset()
    vi.mocked(clientsApi.rotateSecret).mockReset()
    vi.mocked(getLastRequestId).mockReturnValue('req-clients-1')
  })

  it('loads runtime clients, merges staged registrations, and stores request evidence', async () => {
    vi.mocked(clientsApi.listWithRequestId).mockResolvedValue({
      data: { clients: [client] },
      requestId: 'req-clients-1',
    })
    vi.mocked(clientsApi.registrations).mockResolvedValue({
      registrations: [
        client,
        {
          ...client,
          client_id: 'prototype-app-b',
          display_name: 'Prototype App B',
          redirect_uris: ['https://app-b.example.test/callback'],
          post_logout_redirect_uris: ['https://app-b.example.test/logout'],
          status: 'staged',
        },
      ],
    })
    const store = useClientsStore()

    await store.load()

    expect(store.status).toBe('success')
    expect(store.clients).toEqual([
      client,
      {
        ...client,
        client_id: 'prototype-app-b',
        display_name: 'Prototype App B',
        redirect_uris: ['https://app-b.example.test/callback'],
        post_logout_redirect_uris: ['https://app-b.example.test/logout'],
        status: 'staged',
      },
    ])
    expect(store.selectedClientId).toBe('prototype-app-a')
    expect(store.requestId).toBe('req-clients-1')
  })

  it('keeps runtime client request evidence when registrations load also updates the last request id', async () => {
    vi.mocked(clientsApi.listWithRequestId).mockResolvedValue({
      data: { clients: [client] },
      requestId: 'req-clients-1',
    })
    vi.mocked(clientsApi.registrations).mockImplementation(async () => {
      vi.mocked(getLastRequestId).mockReturnValue('req-client-registrations-1')
      return { registrations: [client] }
    })
    const store = useClientsStore()

    await store.load()

    expect(store.requestId).toBe('req-clients-1')
  })

  it('loads runtime clients and registrations in parallel', async () => {
    let resolveList!: (value: {
      data: { clients: readonly AdminClient[] }
      requestId: string | null
    }) => void
    let resolveRegistrations!: (value: { registrations: readonly AdminClient[] }) => void
    vi.mocked(clientsApi.listWithRequestId).mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve
      }),
    )
    vi.mocked(clientsApi.registrations).mockReturnValue(
      new Promise((resolve) => {
        resolveRegistrations = resolve
      }),
    )
    const store = useClientsStore()

    const loading = store.load()
    await Promise.resolve()

    expect(clientsApi.listWithRequestId).toHaveBeenCalledTimes(1)
    expect(clientsApi.registrations).toHaveBeenCalledTimes(1)

    vi.mocked(getLastRequestId).mockReturnValue('req-client-registrations-1')
    resolveRegistrations({ registrations: [client] })
    await Promise.resolve()
    expect(store.status).toBe('loading')

    vi.mocked(getLastRequestId).mockReturnValue('req-clients-1')
    resolveList({ data: { clients: [client] }, requestId: 'req-clients-1' })
    await loading

    expect(store.status).toBe('success')
    expect(store.requestId).toBe('req-clients-1')
  })

  it('preserves registration metadata when runtime clients have incomplete display fields', async () => {
    const registrationClient: AdminClient = {
      ...client,
      client_id: 'sso-frontend-portal',
      display_name: 'SSO Frontend Portal',
      type: 'confidential',
      environment: 'production',
      owner_email: 'identity@example.test',
      backchannel_logout_uri: 'https://frontend.example.test/backchannel-logout',
    }
    const runtimeClient: AdminClient = {
      ...registrationClient,
      display_name: null,
      type: null,
      environment: null,
      owner_email: null,
      backchannel_logout_uri: null,
      redirect_uris: ['https://frontend.example.test/callback'],
    }
    vi.mocked(clientsApi.listWithRequestId).mockResolvedValue({
      data: { clients: [runtimeClient] },
      requestId: 'req-clients-1',
    })
    vi.mocked(clientsApi.registrations).mockResolvedValue({ registrations: [registrationClient] })
    const store = useClientsStore()

    await store.load()

    expect(store.selectedClient).toMatchObject({
      client_id: 'sso-frontend-portal',
      display_name: 'SSO Frontend Portal',
      type: 'confidential',
      environment: 'production',
      owner_email: 'identity@example.test',
      backchannel_logout_uri: 'https://frontend.example.test/backchannel-logout',
      redirect_uris: ['https://frontend.example.test/callback'],
    })
  })

  it('loads selected client detail', async () => {
    vi.mocked(clientsApi.show).mockResolvedValue({ client })
    const store = useClientsStore()

    await store.selectClient('prototype-app-a')

    expect(store.selectedClient).toEqual(client)
    expect(store.detailStatus).toBe('success')
    expect(clientsApi.show).toHaveBeenCalledWith('prototype-app-a')
  })

  it('creates clients and selects the new client with request evidence', async () => {
    const createdClient: AdminClient = {
      ...client,
      client_id: 'prototype-app-b',
      display_name: 'Prototype App B',
      type: 'public',
      redirect_uris: ['https://app-b.example.test/callback'],
      post_logout_redirect_uris: ['https://app-b.example.test/logout'],
      status: 'active',
      has_secret_hash: false,
    }
    vi.mocked(clientsApi.create).mockResolvedValue({ registration: createdClient })
    const store = useClientsStore()
    store.clients = [client]

    const result = await store.createClient({
      app_name: 'Prototype App B',
      client_id: 'prototype-app-b',
      environment: 'development',
      client_type: 'public',
      app_base_url: 'https://app-b.example.test',
      callback_path: '/callback',
      logout_path: '/logout',
      owner_email: 'owner@example.test',
      provisioning: 'jit',
      allowed_scopes: ['openid', 'profile', 'email'],
    })

    expect(store.selectedClientId).toBe('prototype-app-b')
    expect(store.selectedClient).toEqual(createdClient)
    expect(store.requestId).toBe('req-clients-1')
    expect(clientsApi.create).toHaveBeenCalledWith({
      app_name: 'Prototype App B',
      client_id: 'prototype-app-b',
      environment: 'development',
      client_type: 'public',
      app_base_url: 'https://app-b.example.test',
      callback_path: '/callback',
      logout_path: '/logout',
      owner_email: 'owner@example.test',
      provisioning: 'jit',
      allowed_scopes: ['openid', 'profile', 'email'],
    })
    expect(result).toEqual({ registration: createdClient })
  })

  it('stores a transient created-client intent after successful creation', () => {
    const store = useClientsStore()

    store.setCreatedClientIntent({
      clientId: 'prototype-app-a',
      type: 'confidential',
      plaintextSecret: 'secret-once',
      envSnippet: 'SSO_CLIENT_ID=prototype-app-a',
    })

    expect(store.createdClientIntent).toEqual({
      clientId: 'prototype-app-a',
      type: 'confidential',
      plaintextSecret: 'secret-once',
      envSnippet: 'SSO_CLIENT_ID=prototype-app-a',
    })
    expect(store.consumeCreatedClientIntent('different-client')).toBeNull()
    expect(store.consumeCreatedClientIntent('prototype-app-a')).toEqual({
      clientId: 'prototype-app-a',
      type: 'confidential',
      plaintextSecret: 'secret-once',
      envSnippet: 'SSO_CLIENT_ID=prototype-app-a',
    })
    expect(store.createdClientIntent).toBeNull()
  })

  it('returns a confidential create secret without storing it in rotation state', async () => {
    const createdClient: AdminClient = {
      ...client,
      client_id: 'conf-app',
      display_name: 'Conf App',
      type: 'confidential',
      status: 'active',
    }
    const responseWithSecret = {
      registration: createdClient,
      plaintext_secret: 'conf-secret-value-123',
    }
    vi.mocked(clientsApi.create).mockResolvedValue(responseWithSecret)
    const store = useClientsStore()

    const result = await store.createClient({
      app_name: 'Conf App',
      client_id: 'conf-app',
      environment: 'development',
      client_type: 'confidential',
      app_base_url: 'https://conf.example.test',
      callback_path: '/callback',
      logout_path: '/logout',
      owner_email: 'owner@example.test',
      provisioning: 'jit',
      allowed_scopes: ['openid', 'profile', 'email'],
    })

    expect(result).toEqual(responseWithSecret)
    expect(store.rotationSecret).toBeNull()
    expect(store.rotationClientId).toBeNull()
  })

  it('creates public client and does not set rotationSecret', async () => {
    const createdClient: AdminClient = {
      ...client,
      client_id: 'pub-app',
      display_name: 'Pub App',
      type: 'public',
      status: 'active',
      has_secret_hash: false,
    }
    vi.mocked(clientsApi.create).mockResolvedValue({ registration: createdClient })
    const store = useClientsStore()

    const result = await store.createClient({
      app_name: 'Pub App',
      client_id: 'pub-app',
      environment: 'development',
      client_type: 'public',
      app_base_url: 'https://pub.example.test',
      callback_path: '/callback',
      logout_path: '/logout',
      owner_email: 'owner@example.test',
      provisioning: 'jit',
      allowed_scopes: ['openid'],
    })

    expect(result).toEqual({ registration: createdClient })
    expect(store.rotationSecret).toBeNull()
    expect(store.rotationClientId).toBeNull()
  })

  it('updates client scope consent policy through the dedicated scope API', async () => {
    vi.mocked(clientsApi.syncScopes).mockResolvedValue({
      client: { ...client, allowed_scopes: ['openid', 'profile', 'email'] },
    })
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = client.client_id

    await store.syncSelectedScopes(['openid', 'profile', 'email'])

    expect(store.selectedClient?.allowed_scopes).toEqual(['openid', 'profile', 'email'])
    expect(clientsApi.syncScopes).toHaveBeenCalledWith('prototype-app-a', {
      scopes: ['openid', 'profile', 'email'],
    })
  })

  it('updates editable metadata and URI policy through the API', async () => {
    vi.mocked(clientsApi.update).mockResolvedValue({
      client: {
        ...client,
        display_name: 'Renamed App',
        redirect_uris: ['https://app.example.test/new-callback'],
        post_logout_redirect_uris: ['https://app.example.test/new-logout'],
      },
    })
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = client.client_id

    await store.updateSelected({
      display_name: 'Renamed App',
      redirect_uris: ['https://app.example.test/new-callback'],
      post_logout_redirect_uris: ['https://app.example.test/new-logout'],
    })

    expect(store.selectedClient?.display_name).toBe('Renamed App')
    expect(store.selectedClient?.redirect_uris).toEqual(['https://app.example.test/new-callback'])
    expect(store.selectedClient?.post_logout_redirect_uris).toEqual([
      'https://app.example.test/new-logout',
    ])
    expect(clientsApi.update).toHaveBeenCalledWith('prototype-app-a', {
      display_name: 'Renamed App',
      redirect_uris: ['https://app.example.test/new-callback'],
      post_logout_redirect_uris: ['https://app.example.test/new-logout'],
    })
  })

  it('disables and decommissions clients with request evidence', async () => {
    vi.mocked(clientsApi.disable).mockResolvedValue({
      registration: { ...client, status: 'disabled', disabled_at: '2026-05-28T00:00:00Z' },
    })
    vi.mocked(clientsApi.decommission).mockResolvedValue({
      registration: { ...client, status: 'decommissioned', redirect_uris: [] },
    })
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = client.client_id

    await store.disableSelected({ reason: 'incident response' })

    expect(store.selectedClient?.status).toBe('disabled')
    expect(store.requestId).toBe('req-clients-1')
    expect(clientsApi.disable).toHaveBeenCalledWith('prototype-app-a', {
      reason: 'incident response',
    })

    await store.decommissionSelected()

    expect(store.selectedClient?.status).toBe('decommissioned')
    expect(store.selectedClient?.redirect_uris).toEqual([])
    expect(clientsApi.decommission).toHaveBeenCalledWith('prototype-app-a')
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

  it('maps step-up create failures to state without redirecting directly', async () => {
    vi.mocked(clientsApi.create).mockRejectedValue(
      new ApiError(428, 'Step up required', 'step_up_required', null, 'req-step-up'),
    )
    const store = useClientsStore()

    const result = await store.createClient({
      app_name: 'Conf App',
      client_id: 'conf-app',
      environment: 'development',
      client_type: 'confidential',
      app_base_url: 'https://conf.example.test',
      callback_path: '/callback',
      logout_path: '/logout',
      owner_email: 'owner@example.test',
      provisioning: 'jit',
      allowed_scopes: ['openid', 'profile', 'email'],
    })

    expect(result).toBeNull()
    expect(store.actionStatus).toBe('step_up_required')
  })

  it('maps backend validation errors to safe copy with request evidence', async () => {
    vi.mocked(clientsApi.update).mockRejectedValue(
      new ApiError(
        422,
        'SQLSTATE leaked validation trace',
        'validation_error',
        null,
        'req-client-422',
      ),
    )
    const store = useClientsStore()
    store.clients = [client]
    store.selectedClientId = client.client_id

    await store.updateSelected({ redirect_uris: ['https://app.example.test/callback'] })

    expect(store.requestId).toBe('req-client-422')
    expect(store.errorMessage).toBe(
      'Validasi OAuth client gagal. Periksa input lalu gunakan kode referensi REF-LIENT422 untuk investigasi jika perlu.',
    )
    expect(store.errorMessage).not.toContain('SQLSTATE')
  })

  it('maps forbidden errors to safe copy without raw backend details', async () => {
    vi.mocked(clientsApi.listWithRequestId).mockRejectedValue(
      new ApiError(403, 'SQLSTATE leaked forbidden trace'),
    )
    const store = useClientsStore()

    await store.load()

    expect(store.status).toBe('forbidden')
    expect(store.errorMessage).toBe('Kamu tidak memiliki izin untuk melihat OAuth clients.')
    expect(store.errorMessage).not.toContain('SQLSTATE')
  })

  it('maps server errors to safe copy with request evidence', async () => {
    vi.mocked(clientsApi.listWithRequestId).mockRejectedValue(
      new ApiError(500, 'raw token Bearer abc', 'server_error', null, 'req-clients-fail'),
    )
    const store = useClientsStore()

    await store.load()

    expect(store.status).toBe('error')
    expect(store.requestId).toBe('req-clients-fail')
    expect(store.errorMessage).toBe(
      'OAuth clients belum bisa dimuat. Gunakan kode referensi REF-ENTSFAIL untuk investigasi.',
    )
    expect(store.errorMessage).not.toMatch(/Bearer|raw token/i)
  })
})
