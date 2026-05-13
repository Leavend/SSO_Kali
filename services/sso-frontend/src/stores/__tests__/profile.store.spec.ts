import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { profileApi } from '@/services/profile.api'
import type { ConnectedApp, ProfilePortal, UserSessionSummary } from '@/types/profile.types'
import { useProfileStore } from '../profile.store'

const PROFILE_FIXTURE: ProfilePortal = {
  profile: {
    subject_id: 'sub-1',
    display_name: 'Sasha',
    email: 'sasha@example.com',
    status: 'active',
    last_login_at: '2026-05-10T01:23:45Z',
  },
  authorization: { scope: 'openid profile email', roles: ['user'], permissions: [] },
  security: { session_id: 'sess-1', risk_score: 12, mfa_required: false, last_seen_at: null },
}

const CONNECTED_APP_FIXTURE: ConnectedApp = {
  client_id: 'app-a',
  display_name: 'App A',
  first_connected_at: '2026-05-01T00:00:00Z',
  last_used_at: '2026-05-10T10:00:00Z',
  expires_at: '2027-05-01T00:00:00Z',
  active_refresh_tokens: 1,
}

const SESSION_FIXTURE: UserSessionSummary = {
  session_id: 'sess-1',
  opened_at: '2026-05-10T00:00:00Z',
  last_used_at: '2026-05-10T00:05:00Z',
  expires_at: '2026-05-17T00:00:00Z',
  client_count: 1,
  client_ids: ['app-a'],
  client_display_names: ['App A'],
}

describe('useProfileStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads profile from service', async () => {
    vi.spyOn(profileApi, 'getProfile').mockResolvedValue(PROFILE_FIXTURE)

    const store = useProfileStore()
    await store.loadProfile()

    expect(store.profile).toEqual(PROFILE_FIXTURE)
    expect(store.scope).toBe('openid profile email')
    expect(store.roles).toEqual(['user'])
  })

  it('updateProfile replaces state with returned payload', async () => {
    const updated = {
      ...PROFILE_FIXTURE,
      profile: { ...PROFILE_FIXTURE.profile, display_name: 'Sasha Baru' },
    }
    const spy = vi.spyOn(profileApi, 'updateProfile').mockResolvedValue(updated)

    const store = useProfileStore()
    await store.updateProfile({ display_name: 'Sasha Baru' })

    expect(spy).toHaveBeenCalledWith({ display_name: 'Sasha Baru' })
    expect(store.profile?.profile.display_name).toBe('Sasha Baru')
  })

  it('loadConnectedApps stores array from service', async () => {
    vi.spyOn(profileApi, 'getConnectedApps').mockResolvedValue([CONNECTED_APP_FIXTURE])

    const store = useProfileStore()
    await store.loadConnectedApps()

    expect(store.connectedApps).toEqual([CONNECTED_APP_FIXTURE])
  })

  it('revokeConnectedApp refetches list after revoke', async () => {
    const revokeSpy = vi.spyOn(profileApi, 'revokeConnectedApp').mockResolvedValue({
      client_id: 'app-a',
      revoked: true,
      revoked_refresh_tokens: 2,
    })
    const listSpy = vi.spyOn(profileApi, 'getConnectedApps').mockResolvedValue([])

    const store = useProfileStore()
    await store.revokeConnectedApp('app-a')

    expect(revokeSpy).toHaveBeenCalledWith('app-a')
    expect(listSpy).toHaveBeenCalled()
    expect(store.connectedApps).toEqual([])
  })

  it('loadSessions + revokeSession flow', async () => {
    vi.spyOn(profileApi, 'getSessions').mockResolvedValueOnce([SESSION_FIXTURE])
    const revokeSpy = vi.spyOn(profileApi, 'revokeSession').mockResolvedValue({
      session_id: 'sess-1',
      revoked: true,
      revoked_refresh_tokens: 1,
    })
    vi.spyOn(profileApi, 'getSessions').mockResolvedValueOnce([])

    const store = useProfileStore()
    await store.loadSessions()
    expect(store.sessions).toHaveLength(1)

    await store.revokeSession('sess-1')
    expect(revokeSpy).toHaveBeenCalledWith('sess-1')
    expect(store.sessions).toEqual([])
  })

  it('revokeAllSessions clears list after call', async () => {
    vi.spyOn(profileApi, 'revokeAllSessions').mockResolvedValue({
      revoked: true,
      revoked_sessions: 2,
      revoked_refresh_tokens: 5,
    })

    const store = useProfileStore()
    store.$patch({ sessions: [SESSION_FIXTURE] })
    await store.revokeAllSessions()

    expect(store.sessions).toEqual([])
  })
})
