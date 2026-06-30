import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ActivatePayload,
  ClientCreatePayload,
  ClientUpdatePayload,
  CreateClientResponse,
  DecommissionPayload,
  DisablePayload,
  RotateSecretResponse,
  SyncScopesPayload,
} from '@/types/clients.types'

const get = vi.fn<(path: string) => Promise<unknown>>()
const post = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
const patch = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
const put = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
const del = vi.fn<(path: string) => Promise<unknown>>()
vi.mock('@/lib/api/api-client', () => ({
  apiClient: { get, post, patch, put, delete: del },
}))

const { clientsApi } = await import('../clients.api')

const draft: ClientCreatePayload = {
  app_name: 'Sample Portal',
  client_id: 'sample-portal',
  environment: 'development',
  client_type: 'confidential',
  app_base_url: 'https://sample.example',
  callback_path: '/auth/callback',
  logout_path: '/auth/backchannel/logout',
  owner_email: 'owner@example.com',
  provisioning: 'jit',
  allowed_scopes: ['openid', 'profile'],
  category: 'publik',
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  put.mockReset()
  del.mockReset()
})

describe('clientsApi — read seam (clients* paths)', () => {
  it('list() GETs the same-origin client list path and passes the DTO through', async () => {
    const payload = { clients: [] }
    get.mockResolvedValue(payload)
    await expect(clientsApi.list()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/clients')
  })

  it('registrations() GETs the client-integrations registrations path', async () => {
    const payload = { registrations: [] }
    get.mockResolvedValue(payload)
    await expect(clientsApi.registrations()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/client-integrations/registrations')
  })

  it('show() GETs the detail path for the client id', async () => {
    const payload = { client: {} }
    get.mockResolvedValue(payload)
    await expect(clientsApi.show('portal')).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/clients/portal')
  })

  it('getScopes() GETs the scope catalog path', async () => {
    const payload = { scopes: [] }
    get.mockResolvedValue(payload)
    await expect(clientsApi.getScopes()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/scopes')
  })
})

describe('clientsApi — integration create/stage (client-integrations* paths)', () => {
  it('create() POSTs the draft to /client-integrations and returns the secret-bearing response by identity', async () => {
    // The plaintext secret arrives only here, as the body of this POST. The seam
    // forwards the response untouched — never copies, transforms, or logs it.
    const response: CreateClientResponse = {
      registration: { client_id: 'sample-portal', redirect_uris: [] },
      plaintext_secret: 'sample-plaintext-secret-not-real',
    }
    post.mockResolvedValue(response)
    await expect(clientsApi.create(draft)).resolves.toBe(response)
    expect(post).toHaveBeenCalledWith('/api/admin/client-integrations', draft)
  })

  it('stage() POSTs the draft to /client-integrations/stage', async () => {
    post.mockResolvedValue({ registration: {} })
    await clientsApi.stage(draft)
    expect(post).toHaveBeenCalledWith('/api/admin/client-integrations/stage', draft)
  })
})

describe('clientsApi — update + scope sync (clients* paths)', () => {
  it('update() PATCHes only the provided fields (empty omitted, null backchannel preserved)', async () => {
    patch.mockResolvedValue({ client: {} })
    const payload: ClientUpdatePayload = {
      display_name: 'Renamed Sample',
      backchannel_logout_uri: null,
      category: '' as never,
    }
    await clientsApi.update('portal', payload)
    expect(patch).toHaveBeenCalledWith('/api/admin/clients/portal', {
      display_name: 'Renamed Sample',
      backchannel_logout_uri: null,
    })
  })

  it('update() forwards redirect/post-logout arrays and category when present', async () => {
    patch.mockResolvedValue({ client: {} })
    const payload: ClientUpdatePayload = {
      owner_email: 'new-owner@example.com',
      redirect_uris: ['https://sample.example/callback'],
      post_logout_redirect_uris: ['https://sample.example'],
      category: 'kepegawaian',
    }
    await clientsApi.update('portal', payload)
    expect(patch).toHaveBeenCalledWith('/api/admin/clients/portal', {
      owner_email: 'new-owner@example.com',
      redirect_uris: ['https://sample.example/callback'],
      post_logout_redirect_uris: ['https://sample.example'],
      category: 'kepegawaian',
    })
  })

  it('syncScopes() PUTs the scopes to the clients scopes path', async () => {
    put.mockResolvedValue({ client: {} })
    const payload: SyncScopesPayload = { scopes: ['openid', 'profile'] }
    await clientsApi.syncScopes('portal', payload)
    expect(put).toHaveBeenCalledWith('/api/admin/clients/portal/scopes', {
      scopes: ['openid', 'profile'],
    })
  })
})

describe('clientsApi — secret rotation (clients* path)', () => {
  it('rotateSecret() POSTs the rotate-secret path with no body and returns the response by identity', async () => {
    const response: RotateSecretResponse = {
      rotation: {
        client_id: 'portal',
        plaintext_once: 'sample-plaintext-rotation-not-real',
        plaintext_secret: 'sample-plaintext-rotation-not-real',
      },
    }
    post.mockResolvedValue(response)
    await expect(clientsApi.rotateSecret('portal')).resolves.toBe(response)
    expect(post).toHaveBeenCalledWith('/api/admin/clients/portal/rotate-secret')
  })
})

describe('clientsApi — lifecycle (client-integrations* paths)', () => {
  it('activate() POSTs secret_hash to the activate path when provided', async () => {
    post.mockResolvedValue({ registration: {} })
    const payload: ActivatePayload = { secret_hash: 'sample-hash' }
    await clientsApi.activate('newapp', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/client-integrations/newapp/activate', {
      secret_hash: 'sample-hash',
    })
  })

  it('activate() omits secret_hash when empty', async () => {
    post.mockResolvedValue({ registration: {} })
    await clientsApi.activate('newapp', {})
    expect(post).toHaveBeenCalledWith('/api/admin/client-integrations/newapp/activate', {})
  })

  it('disable() POSTs the reason to the disable path', async () => {
    post.mockResolvedValue({ registration: {} })
    const payload: DisablePayload = { reason: 'Offboarded (sample).' }
    await clientsApi.disable('newapp', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/client-integrations/newapp/disable', {
      reason: 'Offboarded (sample).',
    })
  })

  it('disable() omits the reason when empty', async () => {
    post.mockResolvedValue({ registration: {} })
    await clientsApi.disable('newapp', {})
    expect(post).toHaveBeenCalledWith('/api/admin/client-integrations/newapp/disable', {})
  })

  it('decommission() POSTs the reason to the decommission path', async () => {
    post.mockResolvedValue({ registration: {} })
    const payload: DecommissionPayload = { reason: 'Retired (sample).' }
    await clientsApi.decommission('newapp', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/client-integrations/newapp/decommission', {
      reason: 'Retired (sample).',
    })
  })

  it('delete() DELETEs the clients detail path', async () => {
    del.mockResolvedValue({ message: 'Client registration deleted successfully.' })
    await clientsApi.delete('portal')
    expect(del).toHaveBeenCalledWith('/api/admin/clients/portal')
  })
})
