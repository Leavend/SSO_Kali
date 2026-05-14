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

  it('keeps guest bootstrap idle without refreshing when no session exists', async () => {
    const fetchMock = guestSessionFetch()
    vi.stubGlobal('fetch', fetchMock)

    const store = useAdminStore()
    const loaded = await store.ensureSession()

    expect(loaded).toBe(false)
    expect(store.principal).toBeNull()
    expect(store.status).toBe('idle')
    expect(store.redirectTo).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/session', expect.any(Object))
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

function guestSessionFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === '/api/session') return jsonResponse({ redirectTo: '/' }, 401)
    return jsonResponse({ message: 'Unexpected request' }, 500)
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
