import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  ConnectedApp,
  ProfileUpdatePayload,
  SsoPrincipal,
  UserProfile,
  UserSessionSummary,
} from '@shared/user'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type SsoAuthMessage = {
  readonly type: 'expired' | 'refreshed'
  readonly expiresAt?: number
}

const ssoAuthChannelName = 'devsso-portal-auth-session'

export const useSessionStore = defineStore('sso-session', () => {
  const principal = ref<SsoPrincipal | null>(null)
  const profile = ref<UserProfile | null>(null)
  const connectedApps = ref<ConnectedApp[]>([])
  const mySessions = ref<UserSessionSummary[]>([])
  const status = ref<LoadState>('idle')
  const errorMessage = ref<string | null>(null)
  const redirectTo = ref<string | null>(null)
  let refreshInFlight: Promise<void> | null = null
  let authChannel: BroadcastChannel | null = null

  const isAuthenticated = computed(() => principal.value !== null)
  const displayName = computed(() => principal.value?.displayName ?? '')

  function clearSessionState(): void {
    principal.value = null
    profile.value = null
    connectedApps.value = []
    mySessions.value = []
  }

  async function bootstrap(): Promise<void> {
    startAuthSync()
    if (principal.value || status.value === 'loading') return
    await ensureSession()
  }

  async function ensureSession(): Promise<boolean> {
    status.value = 'loading'
    errorMessage.value = null
    redirectTo.value = null
    let failure: unknown = null

    try {
      await loadPrincipal()
      return true
    } catch (error) {
      failure = error
    }

    if (await trySilentRefresh()) return retryPrincipalLoad(failure)

    clearSessionState()
    status.value = 'idle'
    redirectTo.value = redirectFromError(failure)
    return false
  }

  async function loadProfile(): Promise<void> {
    try {
      profile.value = await fetchJson<UserProfile>('/api/me/profile')
      status.value = 'ready'
    } catch (error) {
      if (!redirectAfterAuthFailure(error)) {
        status.value = 'error'
        errorMessage.value = errorMessageFrom(error)
      }
    }
  }

  async function updateProfile(payload: ProfileUpdatePayload): Promise<void> {
    profile.value = await fetchJson<UserProfile>('/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  async function loadConnectedApps(): Promise<void> {
    try {
      const data = await fetchJson<{ connected_apps: ConnectedApp[] }>('/api/me/connected-apps')
      connectedApps.value = [...data.connected_apps]
    } catch (error) {
      if (!redirectAfterAuthFailure(error)) throw error
    }
  }

  async function revokeConnectedApp(clientId: string): Promise<void> {
    await fetchJson(`/api/me/connected-apps/${encodeURIComponent(clientId)}`, { method: 'DELETE' })
    await loadConnectedApps()
  }

  async function loadMySessions(): Promise<void> {
    try {
      const data = await fetchJson<{ sessions: UserSessionSummary[] }>('/api/me/sessions')
      mySessions.value = [...data.sessions]
    } catch (error) {
      if (!redirectAfterAuthFailure(error)) throw error
    }
  }

  async function revokeMySession(sessionId: string): Promise<void> {
    await fetchJson(`/api/me/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
    await loadMySessions()
  }

  async function logoutEverywhere(): Promise<void> {
    try {
      await fetchJson('/auth/global-logout', { method: 'POST' })
    } finally {
      clearSessionState()
      window.location.assign('/')
    }
  }

  async function refreshSession(): Promise<void> {
    refreshInFlight ??= refreshWithBrowserLock().finally(() => {
      refreshInFlight = null
    })

    return refreshInFlight
  }

  async function refreshWithBrowserLock(): Promise<void> {
    return browserLock('devsso-portal-refresh', () => refreshSessionRequest(true, true))
  }

  async function refreshSessionRequest(redirectOnFailure: boolean, notifyOnFailure: boolean): Promise<void> {
    try {
      const payload = await fetchJson<{ expiresAt: number }>('/auth/refresh', { method: 'POST' })
      if (principal.value) principal.value = { ...principal.value, expiresAt: payload.expiresAt }
      broadcastAuthMessage({ type: 'refreshed', expiresAt: payload.expiresAt })
    } catch {
      clearSessionState()
      if (notifyOnFailure) broadcastAuthMessage({ type: 'expired' })
      if (redirectOnFailure) window.location.assign('/session-expired')
      throw new Error('SSO session refresh failed.')
    }
  }

  async function refreshWhenNeeded(): Promise<void> {
    if (!principal.value) return

    const secondsLeft = principal.value.expiresAt - Math.floor(Date.now() / 1000)
    if (secondsLeft > 180) return

    try {
      await refreshSession()
    } catch {
      // Redirect dikelola refreshSessionRequest.
    }
  }

  async function loadPrincipal(): Promise<void> {
    const response = await fetchJson<{ principal: SsoPrincipal }>('/api/session')
    principal.value = response.principal
    status.value = 'ready'
  }

  async function retryPrincipalLoad(fallback: unknown): Promise<boolean> {
    try {
      await loadPrincipal()
      return true
    } catch (error) {
      clearSessionState()
      status.value = 'idle'
      redirectTo.value = redirectFromError(error) ?? redirectFromError(fallback)
      return false
    }
  }

  async function trySilentRefresh(): Promise<boolean> {
    try {
      await browserLock('devsso-portal-refresh', () => refreshSessionRequest(false, false))
      return true
    } catch {
      return false
    }
  }

  function redirectAfterAuthFailure(error: unknown): boolean {
    const target = redirectFromError(error)
    if (!target) return false

    clearSessionState()
    status.value = 'idle'
    redirectTo.value = target
    window.location.assign(target)
    return true
  }

  function startAuthSync(): void {
    if (authChannel || typeof BroadcastChannel === 'undefined') return
    authChannel = new BroadcastChannel(ssoAuthChannelName)
    authChannel.addEventListener('message', syncAuthState)
  }

  function syncAuthState(event: MessageEvent<SsoAuthMessage>): void {
    if (event.data.type === 'expired') {
      clearSessionState()
      window.location.assign('/session-expired')
    }

    if (event.data.type === 'refreshed' && event.data.expiresAt && principal.value) {
      principal.value = { ...principal.value, expiresAt: event.data.expiresAt }
    }
  }

  return {
    principal,
    profile,
    connectedApps,
    mySessions,
    status,
    errorMessage,
    redirectTo,
    isAuthenticated,
    displayName,
    bootstrap,
    ensureSession,
    loadProfile,
    updateProfile,
    loadConnectedApps,
    revokeConnectedApp,
    loadMySessions,
    revokeMySession,
    logoutEverywhere,
    refreshSession,
    refreshWhenNeeded,
  }
})

type ApiError = Error & {
  readonly status?: number
  readonly redirectTo?: string
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  })

  const payload = await response.json().catch(() => ({})) as {
    readonly message?: string
    readonly error?: string
    readonly redirectTo?: string
  }

  if (!response.ok) {
    const error = new Error(payload.message ?? `Request failed with HTTP ${response.status}`) as ApiError
    Object.defineProperty(error, 'status', { value: response.status })
    Object.defineProperty(error, 'redirectTo', { value: payload.redirectTo })
    throw error
  }

  return payload as T
}

function redirectFromError(error: unknown): string | null {
  const apiError = error as ApiError
  if (apiError.redirectTo) return apiError.redirectTo
  if (apiError.status === 401) return '/'
  return null
}

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.'
}

function broadcastAuthMessage(message: SsoAuthMessage): void {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(ssoAuthChannelName)
  channel.postMessage(message)
  channel.close()
}

type BrowserLockManager = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

async function browserLock<T>(name: string, callback: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { readonly locks?: BrowserLockManager }).locks
  return locks ? locks.request(name, callback) : callback()
}
