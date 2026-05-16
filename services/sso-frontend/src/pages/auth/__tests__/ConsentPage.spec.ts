import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'
import ConsentPage from '../ConsentPage.vue'

const assignMock = vi.fn()

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign: assignMock },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  assignMock.mockReset()
})

describe('ConsentPage', () => {
  it('approves consent and redirects to OAuth continuation', async () => {
    const fetchMock = mockFetch({ decisionRedirect: 'https://rp.example/callback?code=abc&state=client-state' })
    const wrapper = await mountConsentPage()

    await wrapper.get('button:not([disabled]) + button').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/connect/consent', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ state: 'tx-state', decision: 'allow' }),
    }))
    expect(assignMock).toHaveBeenCalledWith('https://rp.example/callback?code=abc&state=client-state')
  })

  it('denies consent and redirects to safe OAuth error', async () => {
    mockFetch({ decisionRedirect: 'https://rp.example/callback?error=access_denied&state=client-state' })
    const wrapper = await mountConsentPage()

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(assignMock).toHaveBeenCalledWith('https://rp.example/callback?error=access_denied&state=client-state')
  })

  it('shows localized non-technical copy when the backend rejects a decision', async () => {
    mockFetch({ decisionStatus: 400, decisionPayload: { error: 'invalid_request', message: 'stack trace' } })
    const wrapper = await mountConsentPage()

    await wrapper.get('button:not([disabled]) + button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Keputusan persetujuan gagal diproses. Coba lagi beberapa saat.')
    expect(wrapper.text()).not.toContain('stack trace')
  })

  it('renders unknown scopes from the request with a safe generic fallback', async () => {
    mockFetch({ decisionRedirect: 'https://rp.example/callback?code=abc' })
    const wrapper = await mountConsentPage('/auth/consent?client_id=rp-client&scope=openid+admin%3Acustom&state=tx-state')

    expect(wrapper.text()).toContain('Akses tambahan (belum terverifikasi)')
    expect(wrapper.text()).toContain('admin:custom')
    expect(wrapper.text()).toContain('Permintaan ini berisi scope yang tidak dikenal')
  })
})

async function mountConsentPage(initialPath = '/auth/consent?client_id=rp-client&scope=openid+email&state=tx-state') {
  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/auth/consent', component: ConsentPage }],
  })
  await router.push(initialPath)
  await router.isReady()

  const wrapper = mount(ConsentPage, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

function mockFetch(options: {
  readonly decisionRedirect?: string
  readonly decisionStatus?: number
  readonly decisionPayload?: unknown
}) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)

    if (url.startsWith('/connect/consent?')) {
      return jsonResponse({
        client: { client_id: 'rp-client', display_name: 'RP Client', type: 'confidential' },
        scopes: [{ name: 'openid', description: 'Identitas dasar', claims: ['sub'] }],
        state: 'tx-state',
      })
    }

    if (url === '/connect/consent' && init?.method === 'POST') {
      return jsonResponse(
        options.decisionPayload ?? { redirect_uri: options.decisionRedirect },
        options.decisionStatus ?? 200,
      )
    }

    return new Response('not found', { status: 404 })
  })

  globalThis.fetch = fetchMock as typeof fetch
  return fetchMock
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}
