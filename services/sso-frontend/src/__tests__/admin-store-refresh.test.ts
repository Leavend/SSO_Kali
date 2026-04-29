import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminSessionView } from '../shared/admin'
import { useAdminStore } from '../web/stores/admin'

describe('admin store refresh-token lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses silent refresh before asking the admin to authenticate again', async () => {
    const fetchMock = refreshBootstrapFetch()
    vi.stubGlobal('fetch', fetchMock)

    const store = useAdminStore()
    const loaded = await store.ensureSession()

    expect(loaded).toBe(true)
    expect(store.principal?.email).toBe('huanamasi123@gmail.com')
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/session', expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/auth/refresh', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/session', expect.any(Object))
  })

  it('broadcasts successful manual refreshes to sibling admin tabs', async () => {
    const channel = installBroadcastChannel()
    const expiresAt = now() + 900
    vi.stubGlobal('fetch', refreshOnlyFetch(expiresAt))

    const store = useAdminStore()
    store.principal = principalView({ expiresAt: now() + 20 })
    await store.refreshSession()

    expect(store.principal?.expiresAt).toBe(expiresAt)
    expect(channel.messages).toContainEqual({ type: 'refreshed', expiresAt })
  })
})

function refreshBootstrapFetch(): ReturnType<typeof vi.fn> {
  let sessionAttempts = 0

  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === '/auth/refresh') return jsonResponse({ expiresAt: now() + 900 })
    sessionAttempts += 1
    if (sessionAttempts === 1) return jsonResponse({ redirectTo: '/' }, 401)
    return jsonResponse({ principal: principalView({ expiresAt: now() + 900 }) })
  })
}

function refreshOnlyFetch(expiresAt: number): ReturnType<typeof vi.fn> {
  return vi.fn(async () => jsonResponse({ expiresAt }))
}

function installBroadcastChannel(): { readonly messages: unknown[] } {
  const messages: unknown[] = []

  class TestBroadcastChannel {
    constructor(readonly name: string) {}
    addEventListener(): void {}
    close(): void {}
    postMessage(message: unknown): void {
      messages.push(message)
    }
  }

  vi.stubGlobal('BroadcastChannel', TestBroadcastChannel)
  return { messages }
}

function principalView(overrides: Partial<AdminSessionView> = {}): AdminSessionView {
  return {
    subject: 'user-1',
    email: 'huanamasi123@gmail.com',
    displayName: 'Tio Pranoto',
    role: 'admin',
    expiresAt: now() + 3600,
    authTime: now(),
    amr: ['pwd', 'otp'],
    acr: null,
    lastLoginAt: null,
    permissions: {
      view_admin_panel: true,
      manage_sessions: true,
    },
    ...overrides,
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}
