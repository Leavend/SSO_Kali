import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ClientManagementPage from '../ClientManagementPage.vue'

const client = {
  client_id: 'customer-portal',
  type: 'confidential',
  redirect_uris: ['https://customer.example.com/callback'],
  backchannel_logout_uri: 'https://customer.example.com/logout',
  backchannel_logout_internal: false,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ClientManagementPage', () => {
  it('lists admin-managed clients', async () => {
    const fetchMock = mockFetch()
    const wrapper = mount(ClientManagementPage)
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/clients', expect.objectContaining({ method: 'GET' }))
    expect(wrapper.text()).toContain('customer-portal')
    expect(wrapper.text()).toContain('https://customer.example.com/callback')
  })

  it('creates a client through the admin lifecycle endpoint', async () => {
    const fetchMock = mockFetch()
    const wrapper = mount(ClientManagementPage)
    await flushPromises()

    await wrapper.find('input[placeholder="customer-portal"]').setValue('billing-portal')
    await wrapper.find('input[placeholder="Customer Portal"]').setValue('Billing Portal')
    await wrapper.find('textarea').setValue('https://billing.example.com/callback')
    await wrapper.findAll('button').find((button) => button.text().includes('Buat Client'))?.trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/client-integrations/stage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          clientId: 'billing-portal',
          displayName: 'Billing Portal',
          redirectUris: ['https://billing.example.com/callback'],
        }),
      }),
    )
  })

  it('updates, rotates secret, and decommissions a client', async () => {
    const fetchMock = mockFetch()
    const wrapper = mount(ClientManagementPage)
    await flushPromises()

    await wrapper.findAll('button').find((button) => button.text().includes('Update'))?.trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/clients/customer-portal',
      expect.objectContaining({ method: 'PATCH' }),
    )

    await wrapper.findAll('button').find((button) => button.text().includes('Rotate Secret'))?.trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/clients/customer-portal/rotate-secret',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(wrapper.text()).toContain('secret-once')

    await wrapper.findAll('button').find((button) => button.text().includes('Decommission'))?.trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/clients/customer-portal',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('shows localized safe copy when admin API fails', async () => {
    mockFetch({ listStatus: 500 })
    const wrapper = mount(ClientManagementPage)
    await flushPromises()

    expect(wrapper.text()).toContain('Daftar client tidak dapat dimuat. Silakan coba lagi.')
    expect(wrapper.text()).not.toContain('stack trace')
  })
})

function mockFetch(options: { readonly listStatus?: number } = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'

    if (url === '/api/admin/clients' && method === 'GET') {
      return jsonResponse({ clients: [client] }, options.listStatus ?? 200)
    }

    if (url === '/api/admin/client-integrations/stage' && method === 'POST') {
      return jsonResponse({ registration: { clientId: 'billing-portal' } })
    }

    if (url === '/api/admin/clients/customer-portal' && method === 'PATCH') {
      return jsonResponse(client)
    }

    if (url === '/api/admin/clients/customer-portal/rotate-secret' && method === 'POST') {
      return jsonResponse({ client_secret: 'secret-once' })
    }

    if (url === '/api/admin/clients/customer-portal' && method === 'DELETE') {
      return jsonResponse({}, 204)
    }

    return jsonResponse({ message: 'stack trace' }, 500)
  })

  globalThis.fetch = fetchMock as typeof fetch
  return fetchMock
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}
