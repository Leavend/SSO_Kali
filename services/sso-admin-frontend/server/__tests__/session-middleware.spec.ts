import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalSession } from '../utils/session'
import { publicSession } from '../utils/session'

// The session middleware is now a READ-ONLY principal projection: it calls the
// refresh-free `resolveAdminSession` (decrypt + store read + expiry check) and
// MUST NOT trigger token refresh, RP-session registration, or session-store
// writes. Those side effects stay in the admin proxy via `resolveSsoSession`.
//
// Mock the read so the middleware never touches real session storage or cookies.
vi.mock('../utils/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/session')>()
  return {
    ...actual,
    resolveAdminSession: vi.fn<(req: unknown) => Promise<PortalSession | null>>(),
    // Spy on the Redis write so we can assert the middleware never writes.
    replaceSession: vi.fn<typeof actual.replaceSession>(),
  }
})

// The side-effecting collaborators the OLD middleware reached through
// `resolveSsoSession`. The read-only middleware must NEVER invoke any of them;
// mocking lets us assert they are not called.
vi.mock('../utils/sso-session-resolver', () => ({
  resolveSsoSession: vi.fn<(req: unknown) => Promise<unknown>>(),
  sessionHeaders: vi.fn<() => Record<string, readonly string[]>>(() => ({})),
}))
vi.mock('../utils/session-refresh', () => ({
  refreshPortalSession: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  sessionNeedsRefresh: vi.fn<(...args: unknown[]) => boolean>(),
}))
vi.mock('../utils/session-registration', () => ({
  registerClientSession: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
}))

import { resolveAdminSession, replaceSession } from '../utils/session'
import { resolveSsoSession } from '../utils/sso-session-resolver'
import { refreshPortalSession, sessionNeedsRefresh } from '../utils/session-refresh'
import { registerClientSession } from '../utils/session-registration'
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

/**
 * Minimal H3-shaped event. Includes a `res` stub so any accidental cookie-set
 * would be observable; the read-only middleware must never touch it.
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
    context: {} as { session: PortalSession | null; principalState: unknown },
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
    vi.mocked(resolveAdminSession).mockResolvedValueOnce(baseSession())

    const event = fakeEvent()
    await attachSessionContext(event as never)

    expect(event.context.session?.accessToken).toBe('legacy-admin-access-token')
    expect(event.context.session?.sub).toBe('sub-admin')
  })

  it('event.context.session carries all token fields (confirming server-only custody)', async () => {
    vi.mocked(resolveAdminSession).mockResolvedValueOnce(baseSession())

    const event = fakeEvent()
    await attachSessionContext(event as never)

    const s = event.context.session
    expect(s).not.toBeNull()
    expect(s?.accessToken).toBe('legacy-admin-access-token')
    expect(s?.refreshToken).toBe('refresh-token')
    expect(s?.idToken).toBe('id-token')
    expect(s?.sid).toBe('sid-value')
  })

  it('attaches a token-free principalState alongside the server-only session', async () => {
    vi.mocked(resolveAdminSession).mockResolvedValueOnce(baseSession())

    const event = fakeEvent()
    await attachSessionContext(event as never)

    expect(event.context.principalState).toEqual(publicSession(baseSession()))
  })

  // ── READ-ONLY guarantee: no refresh / register / store-write side effects ─

  it('uses the read-only resolveAdminSession path (no refresh/register/Redis-write)', async () => {
    vi.mocked(resolveAdminSession).mockResolvedValueOnce(baseSession())

    const event = fakeEvent()
    await attachSessionContext(event as never)

    // The read-only read is the only collaborator the middleware may invoke.
    expect(vi.mocked(resolveAdminSession)).toHaveBeenCalledOnce()

    // None of the side-effecting collaborators may run.
    expect(vi.mocked(resolveSsoSession)).not.toHaveBeenCalled()
    expect(vi.mocked(refreshPortalSession)).not.toHaveBeenCalled()
    expect(vi.mocked(sessionNeedsRefresh)).not.toHaveBeenCalled()
    expect(vi.mocked(registerClientSession)).not.toHaveBeenCalled()
    expect(vi.mocked(replaceSession)).not.toHaveBeenCalled()

    // No cookie may be minted/forwarded by the read-only middleware.
    expect((event.node.res as ReturnType<typeof fakeEvent>['node']['res'])._cookies).toHaveLength(0)
  })

  it('never sets a response cookie (read-only: no refresh re-mint)', async () => {
    vi.mocked(resolveAdminSession).mockResolvedValueOnce(baseSession())

    const event = fakeEvent()
    const setHeaderSpy = vi.spyOn(event.node.res, 'setHeader')
    await attachSessionContext(event as never)

    expect(setHeaderSpy).not.toHaveBeenCalled()
  })

  // ── unauthenticated path: both null, must not throw ───────────────────────

  it('sets session and principalState to null when no session is resolved (no throw)', async () => {
    vi.mocked(resolveAdminSession).mockResolvedValueOnce(null)

    const event = fakeEvent()
    await expect(attachSessionContext(event as never)).resolves.toBeUndefined()
    expect(event.context.session).toBeNull()
    expect(event.context.principalState).toBeNull()
  })

  // ── fail-closed-graceful: a resolve error must not 500 the page render ─────

  it('fails closed (both null) and does NOT throw when the read-only resolve throws', async () => {
    vi.mocked(resolveAdminSession).mockRejectedValueOnce(new Error('redis down'))

    const event = fakeEvent()
    await expect(attachSessionContext(event as never)).resolves.toBeUndefined()
    expect(event.context.session).toBeNull()
    expect(event.context.principalState).toBeNull()
  })

  // ── token-free projection: publicSession() must never expose tokens ───────

  it('publicSession() projection has NO accessToken', async () => {
    vi.mocked(resolveAdminSession).mockResolvedValueOnce(baseSession())
    const event = fakeEvent()
    await attachSessionContext(event as never)

    const projection = publicSession(event.context.session!)
    expect(projection).not.toHaveProperty('accessToken')
  })

  it('publicSession() projection has NO refreshToken', async () => {
    vi.mocked(resolveAdminSession).mockResolvedValueOnce(baseSession())
    const event = fakeEvent()
    await attachSessionContext(event as never)

    const projection = publicSession(event.context.session!)
    expect(projection).not.toHaveProperty('refreshToken')
  })

  it('publicSession() projection has NO idToken', async () => {
    vi.mocked(resolveAdminSession).mockResolvedValueOnce(baseSession())
    const event = fakeEvent()
    await attachSessionContext(event as never)

    const projection = publicSession(event.context.session!)
    expect(projection).not.toHaveProperty('idToken')
  })

  it('publicSession() projection has NO sid', async () => {
    vi.mocked(resolveAdminSession).mockResolvedValueOnce(baseSession())
    const event = fakeEvent()
    await attachSessionContext(event as never)

    const projection = publicSession(event.context.session!)
    expect(projection).not.toHaveProperty('sid')
  })

  it('publicSession() projection has NO sub (raw internal subject id)', async () => {
    vi.mocked(resolveAdminSession).mockResolvedValueOnce(baseSession())
    const event = fakeEvent()
    await attachSessionContext(event as never)

    // PortalSessionView uses `subject` (public alias), not `sub` (internal).
    const projection = publicSession(event.context.session!)
    expect(projection).not.toHaveProperty('sub')
  })

  // ── combined: tokens in context, absent from projection ──────────────────

  it('tokens present in event.context.session but absent from publicSession projection', async () => {
    vi.mocked(resolveAdminSession).mockResolvedValueOnce(baseSession())
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

  // ── forwarding: resolveAdminSession is called with event.node.req ─────────

  it('passes event.node.req to resolveAdminSession', async () => {
    vi.mocked(resolveAdminSession).mockResolvedValueOnce(null)
    const event = fakeEvent()
    await attachSessionContext(event as never)

    expect(vi.mocked(resolveAdminSession)).toHaveBeenCalledOnce()
    expect(vi.mocked(resolveAdminSession)).toHaveBeenCalledWith(event.node.req)
  })
})
