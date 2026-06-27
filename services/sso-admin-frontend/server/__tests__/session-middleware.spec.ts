import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalSession } from '../utils/session'
import { publicSession } from '../utils/session'
import type { ResolvedSsoSession } from '../utils/sso-session-resolver'

// Mock resolveSsoSession so the middleware never touches real session storage,
// makes HTTP calls (RP registration / refresh), or reads real cookies.
vi.mock('../utils/sso-session-resolver', () => ({
  resolveSsoSession: vi.fn<(req: unknown) => Promise<ResolvedSsoSession | null>>(),
}))

import { resolveSsoSession } from '../utils/sso-session-resolver'
import { attachSessionContext } from '../middleware/session'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function baseSession(): PortalSession {
  return {
    accessToken: 'legacy-admin-access-token',
    idToken: 'id-token',
    refreshToken: 'refresh-token',
    sub: 'sub-admin',
    sid: 'sid-value',
    subject: 'sub-admin',
    email: 'admin@example.test',
    displayName: 'Admin',
    role: 'admin',
    expiresAt: 4_102_444_800,
    authTime: null,
    amr: ['pwd'],
    acr: null,
    lastLoginAt: null,
    issuedAt: 1_780_000_000,
    absoluteExpiresAt: 4_102_444_800,
    lastRefreshedAt: 1_780_000_000,
  }
}

function resolvedSession(overrides: Partial<ResolvedSsoSession> = {}): ResolvedSsoSession {
  return {
    sessionId: 'test-session-id',
    session: baseSession(),
    cookies: [],
    ...overrides,
  }
}

/**
 * Minimal H3-shaped event. Includes a `res` stub so that cookie-setting paths
 * in `appendEventCookie` can be exercised without touching a real HTTP socket.
 */
function fakeEvent() {
  const req = Readable.from([]) as Readable & { headers: Record<string, string> }
  req.headers = {}

  const setCookies: string[] = []
  const res = {
    getHeader(name: string): string[] | undefined {
      return name === 'set-cookie' && setCookies.length > 0 ? [...setCookies] : undefined
    },
    setHeader(_name: string, value: string[]): void {
      setCookies.splice(0, setCookies.length, ...value)
    },
    // Expose captured cookies for test assertions.
    get _cookies(): readonly string[] {
      return setCookies
    },
  }

  return {
    node: { req, res },
    context: {} as { session: PortalSession | null },
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('server session middleware', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
    vi.stubEnv('NODE_ENV', 'test')
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  // ── custody path: full session lives in event.context (server-only) ───────

  it('attaches the resolved session to event.context.session (server-only)', async () => {
    vi.mocked(resolveSsoSession).mockResolvedValueOnce(resolvedSession())

    const event = fakeEvent()
    await attachSessionContext(event as never)

    expect(event.context.session?.accessToken).toBe('legacy-admin-access-token')
    expect(event.context.session?.sub).toBe('sub-admin')
  })

  it('event.context.session carries all token fields (confirming server-only custody)', async () => {
    vi.mocked(resolveSsoSession).mockResolvedValueOnce(resolvedSession())

    const event = fakeEvent()
    await attachSessionContext(event as never)

    const s = event.context.session
    expect(s).not.toBeNull()
    expect(s?.accessToken).toBe('legacy-admin-access-token')
    expect(s?.refreshToken).toBe('refresh-token')
    expect(s?.idToken).toBe('id-token')
    expect(s?.sid).toBe('sid-value')
  })

  // ── unauthenticated path: must not throw ──────────────────────────────────

  it('sets event.context.session to null when no session is resolved (no throw)', async () => {
    vi.mocked(resolveSsoSession).mockResolvedValueOnce(null)

    const event = fakeEvent()
    await expect(attachSessionContext(event as never)).resolves.toBeUndefined()
    expect(event.context.session).toBeNull()
  })

  // ── cookie-forwarding: refresh re-mint cookies reach the response ─────────

  it('sets resolver-returned cookies on the response (refresh re-mint path)', async () => {
    const refreshCookie =
      '__Host-sso-admin-session=newid; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Strict'
    vi.mocked(resolveSsoSession).mockResolvedValueOnce(
      resolvedSession({ cookies: [refreshCookie] }),
    )

    const event = fakeEvent()
    await attachSessionContext(event as never)

    expect((event.node.res as ReturnType<typeof fakeEvent>['node']['res'])._cookies).toContain(
      refreshCookie,
    )
  })

  it('does not mutate the response headers when the resolver returns no cookies', async () => {
    vi.mocked(resolveSsoSession).mockResolvedValueOnce(resolvedSession({ cookies: [] }))

    const event = fakeEvent()
    const setHeaderSpy = vi.spyOn(event.node.res, 'setHeader')
    await attachSessionContext(event as never)

    expect(setHeaderSpy).not.toHaveBeenCalled()
  })

  // ── token-free projection: publicSession() must never expose tokens ───────

  it('publicSession() projection has NO accessToken', async () => {
    vi.mocked(resolveSsoSession).mockResolvedValueOnce(resolvedSession())
    const event = fakeEvent()
    await attachSessionContext(event as never)

    const projection = publicSession(event.context.session!)
    expect(projection).not.toHaveProperty('accessToken')
  })

  it('publicSession() projection has NO refreshToken', async () => {
    vi.mocked(resolveSsoSession).mockResolvedValueOnce(resolvedSession())
    const event = fakeEvent()
    await attachSessionContext(event as never)

    const projection = publicSession(event.context.session!)
    expect(projection).not.toHaveProperty('refreshToken')
  })

  it('publicSession() projection has NO idToken', async () => {
    vi.mocked(resolveSsoSession).mockResolvedValueOnce(resolvedSession())
    const event = fakeEvent()
    await attachSessionContext(event as never)

    const projection = publicSession(event.context.session!)
    expect(projection).not.toHaveProperty('idToken')
  })

  it('publicSession() projection has NO sid', async () => {
    vi.mocked(resolveSsoSession).mockResolvedValueOnce(resolvedSession())
    const event = fakeEvent()
    await attachSessionContext(event as never)

    const projection = publicSession(event.context.session!)
    expect(projection).not.toHaveProperty('sid')
  })

  it('publicSession() projection has NO sub (raw internal subject id)', async () => {
    vi.mocked(resolveSsoSession).mockResolvedValueOnce(resolvedSession())
    const event = fakeEvent()
    await attachSessionContext(event as never)

    // PortalSessionView uses `subject` (public alias), not `sub` (internal).
    const projection = publicSession(event.context.session!)
    expect(projection).not.toHaveProperty('sub')
  })

  // ── combined: tokens in context, absent from projection ──────────────────

  it('tokens present in event.context.session but absent from publicSession projection', async () => {
    vi.mocked(resolveSsoSession).mockResolvedValueOnce(resolvedSession())
    const event = fakeEvent()
    await attachSessionContext(event as never)

    // Server-only context has all tokens.
    expect(event.context.session?.accessToken).toBeDefined()
    expect(event.context.session?.refreshToken).toBeDefined()
    expect(event.context.session?.idToken).toBeDefined()

    // Token-free projection omits them.
    const projection = publicSession(event.context.session!)
    expect(Object.keys(projection)).not.toContain('accessToken')
    expect(Object.keys(projection)).not.toContain('refreshToken')
    expect(Object.keys(projection)).not.toContain('idToken')
    expect(Object.keys(projection)).not.toContain('sid')
  })

  // ── forwarding: resolveSsoSession is called with event.node.req ──────────

  it('passes event.node.req to resolveSsoSession', async () => {
    vi.mocked(resolveSsoSession).mockResolvedValueOnce(null)
    const event = fakeEvent()
    await attachSessionContext(event as never)

    expect(vi.mocked(resolveSsoSession)).toHaveBeenCalledOnce()
    expect(vi.mocked(resolveSsoSession)).toHaveBeenCalledWith(event.node.req)
  })
})
